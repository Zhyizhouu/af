package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.temporal.io/api/serviceerror"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/converter"

	"github.com/Zhyizhouu/af/backend/internal/caption"
	"github.com/Zhyizhouu/af/backend/internal/storage"
)

type captionResponse struct {
	ID         string  `json:"id"`
	Stage      string  `json:"stage"`
	Step       string  `json:"step,omitempty"`
	Percent    float64 `json:"percent"`
	SourceName string  `json:"sourceName"`
	Language   string  `json:"language"`
	Seconds    float64 `json:"seconds"`
	Segments   int     `json:"segments"`

	// Seconds left before the workflow stops waiting and muxes what it has.
	// Sent as a countdown rather than a wall-clock time so the browser does
	// not have to trust its own clock against the server's.
	ReviewSeconds int `json:"reviewSeconds"`

	VideoName    string `json:"videoName,omitempty"`
	SubtitleName string `json:"subtitleName,omitempty"`
	SizeBytes    int64  `json:"sizeBytes"`
	Downloadable bool   `json:"downloadable"`
	Error        string `json:"error,omitempty"`
}

type captionLimitsResponse struct {
	MaxUploadBytes   int64 `json:"maxUploadBytes"`
	Languages        any   `json:"languages"`
	ReviewTTLSeconds int   `json:"reviewTtlSeconds"`
	ResultTTLSeconds int   `json:"resultTtlSeconds"`
	Configured       bool  `json:"configured"`
}

func captionWorkflowID(jobID string) string { return "caption-" + jobID }

func (s *Server) handleCaptionLimits(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, captionLimitsResponse{
		MaxUploadBytes:   s.cfg.MaxUploadBytes,
		Languages:        caption.Languages,
		ReviewTTLSeconds: int(s.cfg.ReviewTTL.Seconds()),
		ResultTTLSeconds: int(s.cfg.ResultTTL.Seconds()),
		// Lets the page say "captioning is not configured on this server"
		// instead of accepting an upload and failing a minute later.
		Configured: s.cfg.GeminiAPIKey != "",
	})
}

func (s *Server) handleCaptionCreate(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.caller(w, r)
	if !ok {
		return
	}

	if s.cfg.GeminiAPIKey == "" {
		writeError(w, http.StatusServiceUnavailable,
			"Captioning is not configured on this server.")
		return
	}

	language := r.URL.Query().Get("language")
	if !caption.ValidLanguage(language) {
		writeError(w, http.StatusBadRequest, "That is not a language this converter offers.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, s.cfg.MaxUploadBytes)

	parts, err := r.MultipartReader()
	if err != nil {
		writeError(w, http.StatusBadRequest, "Send the file as multipart/form-data.")
		return
	}

	part, err := filePart(parts)
	if err != nil {
		writeError(w, http.StatusBadRequest, "No file was sent.")
		return
	}
	defer part.Close()

	sourceName := strings.TrimSpace(part.FileName())
	if sourceName == "" {
		sourceName = "video.mp4"
	}

	jobID := uuid.NewString()
	sourceKey := caption.SourceKey(jobID, sourceName)

	contentType := part.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	if err := s.blobs.Put(r.Context(), sourceKey, part, contentType); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeError(w, http.StatusRequestEntityTooLarge,
				fmt.Sprintf("Files are limited to %d MB.", s.cfg.MaxUploadBytes>>20))
			return
		}
		s.log.Error("caption upload failed", "key", sourceKey, "error", err)
		writeError(w, http.StatusBadGateway, "The file could not be stored. Try again.")
		return
	}

	_, err = s.temporal.ExecuteWorkflow(r.Context(), client.StartWorkflowOptions{
		ID:        captionWorkflowID(jobID),
		TaskQueue: s.cfg.TaskQueue,
		// Long enough to cover transcription, a full review window and the
		// result's lifetime, with room for a slow model.
		WorkflowExecutionTimeout: s.cfg.ReviewTTL + s.cfg.ResultTTL + 3*time.Hour,
	}, caption.Generate, caption.Request{
		JobID:      jobID,
		OwnerUID:   uid,
		SourceKey:  sourceKey,
		SourceName: sourceName,
		Language:   language,
		ReviewTTL:  s.cfg.ReviewTTL,
		ResultTTL:  s.cfg.ResultTTL,
	})
	if err != nil {
		s.log.Error("caption workflow start failed", "job", jobID, "error", err)
		if err := s.blobs.Delete(context.WithoutCancel(r.Context()), sourceKey); err != nil {
			s.log.Warn("orphaned caption source", "key", sourceKey, "error", err)
		}
		writeError(w, http.StatusBadGateway, "The converter is not accepting jobs. Try again.")
		return
	}

	writeJSON(w, http.StatusAccepted, captionResponse{
		ID:         jobID,
		Stage:      string(caption.StageQueued),
		SourceName: sourceName,
		Language:   language,
	})
}

func (s *Server) handleCaptionStatus(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.caller(w, r)
	if !ok {
		return
	}
	status, ok := s.describeCaption(w, r, uid)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, s.presentCaption(r.Context(), status))
}

// handleCaptionSegments returns the transcript for the editor.
//
// Separate from the status endpoint because it is large and asked for once,
// while status is polled every second.
func (s *Server) handleCaptionSegments(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.caller(w, r)
	if !ok {
		return
	}
	status, ok := s.describeCaption(w, r, uid)
	if !ok {
		return
	}

	response, err := s.temporal.QueryWorkflow(
		r.Context(), captionWorkflowID(status.JobID), "", caption.SegmentsQuery)
	if err != nil {
		s.log.Error("segment query failed", "job", status.JobID, "error", err)
		writeError(w, http.StatusBadGateway, "The transcript could not be read. Try again.")
		return
	}

	var transcript caption.Transcript
	if err := response.Get(&transcript); err != nil {
		writeError(w, http.StatusBadGateway, "The transcript came back unreadable.")
		return
	}
	writeJSON(w, http.StatusOK, transcript)
}

// handleCaptionApprove releases the workflow's review wait.
//
// The segments are normalised twice — here so a malformed edit is refused
// while somebody is still looking at the screen, and again inside the workflow
// because a signal can arrive from anywhere and the workflow is the only place
// that is authoritative.
func (s *Server) handleCaptionApprove(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.caller(w, r)
	if !ok {
		return
	}
	status, ok := s.describeCaption(w, r, uid)
	if !ok {
		return
	}

	if status.Stage != caption.StageReview {
		writeError(w, http.StatusConflict,
			"That job is not waiting for edits.")
		return
	}

	var body struct {
		Segments []caption.Segment `json:"segments"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 8<<20)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "The edited captions did not parse.")
		return
	}

	segments := caption.Normalise(body.Segments, status.Seconds)
	if len(segments) == 0 {
		writeError(w, http.StatusBadRequest,
			"There are no captions left to write. Add at least one line.")
		return
	}

	if err := s.temporal.SignalWorkflow(
		r.Context(),
		captionWorkflowID(status.JobID),
		"",
		caption.ApproveSignal,
		caption.Approval{Segments: segments},
	); err != nil {
		s.log.Error("approve signal failed", "job", status.JobID, "error", err)
		writeError(w, http.StatusBadGateway, "The edits could not be sent. Try again.")
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]any{
		"segments": len(segments),
		"stage":    string(caption.StageMuxing),
	})
}

func (s *Server) handleCaptionDownload(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.caller(w, r)
	if !ok {
		return
	}
	status, ok := s.describeCaption(w, r, uid)
	if !ok {
		return
	}

	switch status.Stage {
	case caption.StageReady:
	case caption.StageExpired:
		writeError(w, http.StatusGone, "That job has expired. Caption the video again.")
		return
	case caption.StageFailed:
		writeError(w, http.StatusConflict, status.Error)
		return
	default:
		writeError(w, http.StatusConflict, "That job is not finished yet.")
		return
	}

	// Two artefacts, one endpoint: the MP4 to play and the SRT to drop on an
	// editing timeline.
	key, name, contentType := status.VideoKey, status.VideoName, "video/mp4"
	if r.PathValue("artefact") == "subtitles" {
		key, name, contentType = status.SubtitleKey, status.SubtitleName, "application/x-subrip"
	}

	body, err := s.blobs.Get(r.Context(), key)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			writeError(w, http.StatusGone, "That job has expired. Caption the video again.")
			return
		}
		s.log.Error("caption result unreadable", "key", key, "error", err)
		writeError(w, http.StatusBadGateway, "The file could not be read back. Try again.")
		return
	}
	defer body.Close()

	header := w.Header()
	header.Set("Content-Type", contentType)
	if contentType == "video/mp4" && status.SizeBytes > 0 {
		header.Set("Content-Length", strconv.FormatInt(status.SizeBytes, 10))
	}
	header.Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", name))

	if _, err := io.Copy(w, body); err != nil {
		s.log.Warn("caption download interrupted", "key", key, "error", err)
	}
}

func (s *Server) handleCaptionCancel(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.caller(w, r)
	if !ok {
		return
	}
	status, ok := s.describeCaption(w, r, uid)
	if !ok {
		return
	}

	if err := s.temporal.CancelWorkflow(
		r.Context(), captionWorkflowID(status.JobID), ""); err != nil {
		s.log.Error("caption cancel failed", "job", status.JobID, "error", err)
		writeError(w, http.StatusBadGateway, "The job could not be cancelled.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- reading a job ----

func (s *Server) describeCaption(
	w http.ResponseWriter,
	r *http.Request,
	uid string,
) (caption.Status, bool) {
	id := r.PathValue("id")

	response, err := s.temporal.QueryWorkflow(
		r.Context(), captionWorkflowID(id), "", caption.StatusQuery)
	if err != nil {
		var notFound *serviceerror.NotFound
		if errors.As(err, &notFound) {
			writeError(w, http.StatusNotFound, "No such job.")
			return caption.Status{}, false
		}
		s.log.Error("caption query failed", "job", id, "error", err)
		writeError(w, http.StatusBadGateway, "The converter is not answering. Try again.")
		return caption.Status{}, false
	}

	var status caption.Status
	if err := response.Get(&status); err != nil {
		s.log.Error("caption status unreadable", "job", id, "error", err)
		writeError(w, http.StatusBadGateway, "The converter returned something unreadable.")
		return caption.Status{}, false
	}

	if status.OwnerUID != uid {
		writeError(w, http.StatusNotFound, "No such job.")
		return caption.Status{}, false
	}
	return status, true
}

func (s *Server) presentCaption(
	ctx context.Context,
	status caption.Status,
) captionResponse {
	body := captionResponse{
		ID:           status.JobID,
		Stage:        string(status.Stage),
		SourceName:   status.SourceName,
		Language:     status.Language,
		Seconds:      status.Seconds,
		Segments:     status.Segments,
		VideoName:    status.VideoName,
		SubtitleName: status.SubtitleName,
		SizeBytes:    status.SizeBytes,
		Error:        status.Error,
	}

	switch status.Stage {
	case caption.StageReady:
		body.Percent = 1
		body.Downloadable = true
	case caption.StageReview:
		if left := time.Until(status.ReviewDeadline); left > 0 {
			body.ReviewSeconds = int(left.Seconds())
		}
	case caption.StageTranscribing, caption.StageMuxing, caption.StageQueued:
		if progress, ok := s.captionProgress(ctx, captionWorkflowID(status.JobID)); ok {
			body.Step = progress.Step
			body.Percent = progress.Percent
		}
	}
	return body
}

func (s *Server) captionProgress(
	ctx context.Context,
	id string,
) (caption.Progress, bool) {
	description, err := s.temporal.DescribeWorkflowExecution(ctx, id, "")
	if err != nil {
		return caption.Progress{}, false
	}

	for _, pending := range description.GetPendingActivities() {
		details := pending.GetHeartbeatDetails()
		if details == nil {
			continue
		}
		var progress caption.Progress
		if err := converter.GetDefaultDataConverter().
			FromPayloads(details, &progress); err == nil {
			return progress, true
		}
	}
	return caption.Progress{}, false
}
