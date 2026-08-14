package caption

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
)

// Activities is the worker-side half. Ports only, so this file never learns
// what "Gemini" or "SeaweedFS" mean.
type Activities struct {
	Blobs       Blobs
	Video       Video
	Transcriber Transcriber

	// How much audio goes to the model at once. Ten minutes keeps timings
	// close without making the number of round trips silly.
	ChunkSeconds float64

	TempDir string
}

// Progress is heartbeated so the browser can show which chunk is in flight.
type Progress struct {
	Step    string  `json:"step"`
	Percent float64 `json:"percent"`
}

const (
	StepFetching     = "fetching"
	StepExtracting   = "extracting"
	StepTranscribing = "transcribing"
	StepMuxing       = "muxing"
	StepStoring      = "storing"
)

// Transcribe pulls the audio out of the video, cuts it up, and sends each
// piece to the model.
func (a *Activities) Transcribe(ctx context.Context, req Request) (Transcript, error) {
	dir, err := os.MkdirTemp(a.TempDir, "af-caption-")
	if err != nil {
		return Transcript{}, fmt.Errorf("staging directory: %w", err)
	}
	defer os.RemoveAll(dir)

	video := filepath.Join(dir, "source"+strings.ToLower(filepath.Ext(req.SourceName)))
	if err := a.fetch(ctx, req.SourceKey, video); err != nil {
		return Transcript{}, err
	}

	activity.RecordHeartbeat(ctx, Progress{Step: StepExtracting})

	seconds, err := a.Video.Seconds(ctx, video)
	if err != nil {
		return Transcript{}, unusable(fmt.Errorf("that file could not be read as video: %w", err))
	}

	audio := filepath.Join(dir, "audio.wav")
	if err := a.Video.ExtractAudio(ctx, video, audio); err != nil {
		return Transcript{}, unusable(fmt.Errorf("that file has no audio to caption: %w", err))
	}

	chunkDir := filepath.Join(dir, "chunks")
	if err := os.MkdirAll(chunkDir, 0o755); err != nil {
		return Transcript{}, err
	}

	chunks, err := a.Video.Split(ctx, audio, chunkDir, a.chunkSeconds())
	if err != nil {
		return Transcript{}, err
	}

	all := make([]Segment, 0, len(chunks)*64)
	for i, chunk := range chunks {
		activity.RecordHeartbeat(ctx, Progress{
			Step:    StepTranscribing,
			Percent: float64(i) / float64(len(chunks)),
		})

		segments, err := a.Transcriber.Transcribe(ctx, chunk.Path, req.Language)
		if err != nil {
			return Transcript{}, fmt.Errorf(
				"transcribing minute %d: %w", int(chunk.OffsetSecond/60), err)
		}

		// The model timed this chunk from its own zero. Adding the offset back
		// is what makes chunking work at all, and the offset is exact because
		// ffmpeg chose the cut.
		for _, segment := range segments {
			all = append(all, Segment{
				Start: segment.Start + chunk.OffsetSecond,
				End:   segment.End + chunk.OffsetSecond,
				Text:  segment.Text,
			})
		}
	}

	normalised := Normalise(all, seconds)
	if len(normalised) == 0 {
		return Transcript{}, unusable(errors.New("no speech was found in that video"))
	}

	return Transcript{
		Segments: normalised,
		Seconds:  seconds,
		Language: req.Language,
	}, nil
}

// MuxInput is what the final step needs: the approved segments, and enough of
// the request to find the video again.
type MuxInput struct {
	Request  Request   `json:"request"`
	Segments []Segment `json:"segments"`
	Language string    `json:"language"`
}

// Mux writes the subtitle file, puts it into a copy of the video, and stores
// both — the MP4 to play, the SRT to drop on a timeline.
func (a *Activities) Mux(ctx context.Context, in MuxInput) (Muxed, error) {
	dir, err := os.MkdirTemp(a.TempDir, "af-caption-mux-")
	if err != nil {
		return Muxed{}, fmt.Errorf("staging directory: %w", err)
	}
	defer os.RemoveAll(dir)

	video := filepath.Join(dir, "source"+strings.ToLower(filepath.Ext(in.Request.SourceName)))
	if err := a.fetch(ctx, in.Request.SourceKey, video); err != nil {
		return Muxed{}, err
	}

	activity.RecordHeartbeat(ctx, Progress{Step: StepMuxing})

	subtitlePath := filepath.Join(dir, "captions.srt")
	if err := os.WriteFile(subtitlePath, []byte(SRT(in.Segments)), 0o600); err != nil {
		return Muxed{}, fmt.Errorf("writing the subtitle file: %w", err)
	}

	// Always .mp4 out, whatever went in: mov_text is an MP4 subtitle codec,
	// and a caption track in a .mkv would not survive the container swap
	// somebody inevitably does later.
	output := filepath.Join(dir, "captioned.mp4")
	if err := a.Video.Mux(ctx, video, subtitlePath, output, in.Language); err != nil {
		return Muxed{}, fmt.Errorf("adding the caption track: %w", err)
	}

	activity.RecordHeartbeat(ctx, Progress{Step: StepStoring, Percent: 1})

	videoName := CaptionedName(in.Request.SourceName)
	videoKey := ResultKey(in.Request.JobID, videoName)
	if err := a.putFile(ctx, output, videoKey, "video/mp4"); err != nil {
		return Muxed{}, err
	}

	subtitleName := SubtitleName(in.Request.SourceName)
	subtitleKey := ResultKey(in.Request.JobID, subtitleName)
	if err := a.putFile(ctx, subtitlePath, subtitleKey, "application/x-subrip"); err != nil {
		return Muxed{}, err
	}

	size, err := a.Blobs.Size(ctx, videoKey)
	if err != nil {
		activity.GetLogger(ctx).Warn("result size unknown", "key", videoKey, "error", err)
	}

	return Muxed{
		VideoKey:     videoKey,
		VideoName:    videoName,
		SubtitleKey:  subtitleKey,
		SubtitleName: subtitleName,
		SizeBytes:    size,
	}, nil
}

// DiscardObject removes one object. Missing counts as success.
//
// Named for its domain rather than the plain "Discard" the audio converter
// uses, because Temporal registers activities by method name into one flat
// namespace per worker. Two structs on the same task queue with a method of
// the same name panic the worker at boot — the collision is not scoped by
// type, and nothing catches it until the process starts.
func (a *Activities) DiscardObject(ctx context.Context, key string) error {
	if key == "" {
		return nil
	}
	return a.Blobs.Delete(ctx, key)
}

// ---- plumbing ----

func (a *Activities) chunkSeconds() float64 {
	if a.ChunkSeconds > 0 {
		return a.ChunkSeconds
	}
	return 600
}

func (a *Activities) fetch(ctx context.Context, key, path string) error {
	total, err := a.Blobs.Size(ctx, key)
	if err != nil {
		return fmt.Errorf("reading the source: %w", err)
	}

	body, err := a.Blobs.Get(ctx, key)
	if err != nil {
		return fmt.Errorf("reading the source: %w", err)
	}
	defer body.Close()

	file, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("staging the source: %w", err)
	}
	defer file.Close()

	if _, err := io.Copy(file, &reporter{
		reader: body,
		total:  total,
		report: func(fraction float64) {
			activity.RecordHeartbeat(ctx, Progress{
				Step:    StepFetching,
				Percent: fraction,
			})
		},
	}); err != nil {
		return fmt.Errorf("staging the source: %w", err)
	}
	return file.Sync()
}

func (a *Activities) putFile(ctx context.Context, path, key, contentType string) error {
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("opening %s: %w", filepath.Base(path), err)
	}
	defer file.Close()

	if err := a.Blobs.Put(ctx, key, file, contentType); err != nil {
		return fmt.Errorf("storing %s: %w", filepath.Base(path), err)
	}
	return nil
}

// reporter heartbeats as bytes go past, so a slow fetch of a two-hour lecture
// still counts as liveness.
type reporter struct {
	reader io.Reader
	total  int64
	read   int64
	last   time.Time
	report func(float64)
}

func (r *reporter) Read(p []byte) (int, error) {
	n, err := r.reader.Read(p)
	r.read += int64(n)
	if r.total > 0 && time.Since(r.last) >= time.Second {
		r.last = time.Now()
		fraction := float64(r.read) / float64(r.total)
		if fraction > 1 {
			fraction = 1
		}
		r.report(fraction)
	}
	return n, err
}

func unusable(err error) error {
	return temporal.NewNonRetryableApplicationError(err.Error(), ErrUnusableSource, err)
}
