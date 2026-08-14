package httpapi

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.temporal.io/api/serviceerror"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/converter"

	"github.com/Zhyizhouu/af/backend/internal/convert"
	"github.com/Zhyizhouu/af/backend/internal/storage"
)

// jobResponse is what the browser sees. Deliberately not convert.Status: that
// carries the owner's uid, and a response body is the wrong place for it.
type jobResponse struct {
	ID           string  `json:"id"`
	Stage        string  `json:"stage"`
	Step         string  `json:"step,omitempty"`
	Percent      float64 `json:"percent"`
	SourceName   string  `json:"sourceName"`
	ResultName   string  `json:"resultName,omitempty"`
	Bitrate      int     `json:"bitrate"`
	Seconds      float64 `json:"seconds"`
	SizeBytes    int64   `json:"sizeBytes"`
	Downloadable bool    `json:"downloadable"`
	Error        string  `json:"error,omitempty"`
}

// limitsResponse lets the UI describe the rules without holding a copy of
// them. Same principle as the reset cooldown: the server owns the policy, the
// client renders whatever it is told.
type limitsResponse struct {
	MaxUploadBytes   int64 `json:"maxUploadBytes"`
	Bitrates         []int `json:"bitrates"`
	DefaultBitrate   int   `json:"defaultBitrate"`
	ResultTTLSeconds int   `json:"resultTtlSeconds"`
}

func workflowID(jobID string) string { return "mp3-" + jobID }

func (s *Server) handleLimits(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, limitsResponse{
		MaxUploadBytes:   s.cfg.MaxUploadBytes,
		Bitrates:         convert.Bitrates,
		DefaultBitrate:   convert.DefaultBitrate,
		ResultTTLSeconds: int(s.cfg.ResultTTL.Seconds()),
	})
}

func (s *Server) handleCreate(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.caller(w, r)
	if !ok {
		return
	}

	// A query parameter rather than a form field, so the body can be streamed
	// straight through to storage without first hunting for fields that may
	// arrive after the file.
	bitrate := convert.DefaultBitrate
	if raw := r.URL.Query().Get("bitrate"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || !convert.ValidBitrate(parsed) {
			writeError(w, http.StatusBadRequest,
				fmt.Sprintf("Bitrate must be one of %v kbit/s.", convert.Bitrates))
			return
		}
		bitrate = parsed
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
		sourceName = "upload"
	}

	jobID := uuid.NewString()
	sourceKey := convert.SourceKey(jobID, convert.SafeName(sourceName))

	contentType := part.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	// Streamed to the object store as it arrives — the gateway never holds the
	// file, which is what keeps its memory flat regardless of upload size.
	if err := s.blobs.Put(r.Context(), sourceKey, part, contentType); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeError(w, http.StatusRequestEntityTooLarge,
				fmt.Sprintf("Files are limited to %d MB.", s.cfg.MaxUploadBytes>>20))
			return
		}
		s.log.Error("upload failed", "key", sourceKey, "error", err)
		writeError(w, http.StatusBadGateway, "The file could not be stored. Try again.")
		return
	}

	request := convert.Request{
		JobID:      jobID,
		OwnerUID:   uid,
		SourceKey:  sourceKey,
		SourceName: sourceName,
		Bitrate:    bitrate,
		ResultTTL:  s.cfg.ResultTTL,
	}

	_, err = s.temporal.ExecuteWorkflow(r.Context(), client.StartWorkflowOptions{
		ID:        workflowID(jobID),
		TaskQueue: s.cfg.TaskQueue,
		// The workflow outlives the conversion by the result's lifetime, since
		// it owns the timer that deletes the file. Two hours of headroom on
		// top is the encode budget.
		WorkflowExecutionTimeout: s.cfg.ResultTTL + 2*time.Hour,
	}, convert.ToMP3, request)
	if err != nil {
		s.log.Error("workflow start failed", "job", jobID, "error", err)
		// Nothing will ever collect these bytes if no workflow owns them.
		if err := s.blobs.Delete(context.WithoutCancel(r.Context()), sourceKey); err != nil {
			s.log.Warn("orphaned source", "key", sourceKey, "error", err)
		}
		writeError(w, http.StatusBadGateway, "The converter is not accepting jobs. Try again.")
		return
	}

	writeJSON(w, http.StatusAccepted, jobResponse{
		ID:         jobID,
		Stage:      string(convert.StageQueued),
		SourceName: sourceName,
		Bitrate:    bitrate,
	})
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.caller(w, r)
	if !ok {
		return
	}
	status, ok := s.describe(w, r, uid)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, s.present(r.Context(), status))
}

func (s *Server) handleDownload(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.caller(w, r)
	if !ok {
		return
	}
	status, ok := s.describe(w, r, uid)
	if !ok {
		return
	}

	switch status.Stage {
	case convert.StageReady:
	case convert.StageExpired:
		writeError(w, http.StatusGone, "That conversion has expired. Convert the file again.")
		return
	case convert.StageFailed:
		writeError(w, http.StatusConflict, status.Error)
		return
	default:
		writeError(w, http.StatusConflict, "That conversion is not finished yet.")
		return
	}

	body, err := s.blobs.Get(r.Context(), status.ResultKey)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			writeError(w, http.StatusGone, "That conversion has expired. Convert the file again.")
			return
		}
		s.log.Error("result unreadable", "key", status.ResultKey, "error", err)
		writeError(w, http.StatusBadGateway, "The file could not be read back. Try again.")
		return
	}
	defer body.Close()

	header := w.Header()
	header.Set("Content-Type", "audio/mpeg")
	if status.SizeBytes > 0 {
		header.Set("Content-Length", strconv.FormatInt(status.SizeBytes, 10))
	}
	header.Set("Content-Disposition",
		fmt.Sprintf("attachment; filename=%q", status.ResultName))

	if _, err := io.Copy(w, body); err != nil {
		// Headers are already sent, so there is no status left to change —
		// this is a client that hung up mid-download.
		s.log.Warn("download interrupted", "key", status.ResultKey, "error", err)
	}
}

func (s *Server) handleCancel(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.caller(w, r)
	if !ok {
		return
	}
	status, ok := s.describe(w, r, uid)
	if !ok {
		return
	}

	if err := s.temporal.CancelWorkflow(r.Context(), workflowID(status.JobID), ""); err != nil {
		s.log.Error("cancel failed", "job", status.JobID, "error", err)
		writeError(w, http.StatusBadGateway, "The job could not be cancelled.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- reading a job ----

// describe queries the workflow and confirms the caller owns it, answering the
// request itself if either fails.
func (s *Server) describe(
	w http.ResponseWriter,
	r *http.Request,
	uid string,
) (convert.Status, bool) {
	id := r.PathValue("id")

	response, err := s.temporal.QueryWorkflow(
		r.Context(), workflowID(id), "", convert.StatusQuery)
	if err != nil {
		var notFound *serviceerror.NotFound
		if errors.As(err, &notFound) {
			writeError(w, http.StatusNotFound, "No such job.")
			return convert.Status{}, false
		}
		s.log.Error("job query failed", "job", id, "error", err)
		writeError(w, http.StatusBadGateway, "The converter is not answering. Try again.")
		return convert.Status{}, false
	}

	var status convert.Status
	if err := response.Get(&status); err != nil {
		s.log.Error("job status unreadable", "job", id, "error", err)
		writeError(w, http.StatusBadGateway, "The converter returned something unreadable.")
		return convert.Status{}, false
	}

	// Somebody else's job is "not there" rather than "not allowed". Confirming
	// it exists would turn a guessed id into an oracle.
	if status.OwnerUID != uid {
		writeError(w, http.StatusNotFound, "No such job.")
		return convert.Status{}, false
	}
	return status, true
}

func (s *Server) present(ctx context.Context, status convert.Status) jobResponse {
	body := jobResponse{
		ID:         status.JobID,
		Stage:      string(status.Stage),
		SourceName: status.SourceName,
		ResultName: status.ResultName,
		Bitrate:    status.Bitrate,
		Seconds:    status.Seconds,
		SizeBytes:  status.SizeBytes,
		Error:      status.Error,
	}

	switch status.Stage {
	case convert.StageReady:
		body.Percent = 1
		body.Downloadable = true
	case convert.StageTranscoding:
		if progress, ok := s.progress(ctx, workflowID(status.JobID)); ok {
			body.Step = progress.Step
			body.Percent = progress.Percent
		}
	}
	return body
}

// progress reads the percentage off the running activity's last heartbeat.
//
// This is the only route a live number can take: the workflow schedules the
// activity and then waits, so it has nothing finer than "transcoding" to
// report until the activity returns.
func (s *Server) progress(ctx context.Context, id string) (convert.Progress, bool) {
	description, err := s.temporal.DescribeWorkflowExecution(ctx, id, "")
	if err != nil {
		return convert.Progress{}, false
	}

	for _, pending := range description.GetPendingActivities() {
		details := pending.GetHeartbeatDetails()
		if details == nil {
			continue
		}
		var progress convert.Progress
		if err := converter.GetDefaultDataConverter().
			FromPayloads(details, &progress); err == nil {
			return progress, true
		}
	}
	return convert.Progress{}, false
}

// filePart advances to the part actually carrying the upload, discarding any
// stray fields in front of it.
func filePart(parts *multipart.Reader) (*multipart.Part, error) {
	for {
		part, err := parts.NextPart()
		if err != nil {
			return nil, err
		}
		if part.FormName() == "file" {
			return part, nil
		}
		part.Close()
	}
}
