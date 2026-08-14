package convert

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

// Activities is the worker-side half of the use case.
//
// It holds only ports, so the worker binary decides what "storage" and
// "transcoder" mean and this file never learns. That is also what makes the
// pipeline testable without a SeaweedFS container or ffmpeg on PATH.
type Activities struct {
	Blobs      Blobs
	Transcoder Transcoder

	// Where sources are staged. Empty means the system temp directory. In the
	// container this is a tmpfs-backed volume, so a 500MB upload never touches
	// the image's writable layer.
	TempDir string
}

// heartbeatEvery throttles progress reporting. ffmpeg emits progress several
// times a second and every heartbeat is an RPC; once a second is plenty to
// keep a progress bar honest and to prove the worker is still alive.
const heartbeatEvery = time.Second

// Convert is the whole conversion: fetch the source, probe it, encode it,
// store the MP3.
//
// One activity rather than four because each step needs the same bytes on the
// same disk — splitting them would mean pulling the source out of the object
// store once per step, and a workflow cannot pass a temp file between
// activities that may run on different workers.
func (a *Activities) Convert(ctx context.Context, req Request) (Result, error) {
	format, err := FormatByID(req.Format)
	if err != nil {
		return Result{}, unsupported(err)
	}

	dir, err := os.MkdirTemp(a.TempDir, "af-audio-")
	if err != nil {
		return Result{}, fmt.Errorf("staging directory: %w", err)
	}
	// Removes the staged source and output together, on every path out of this
	// function — including a panic or a cancellation mid-encode. The copies in
	// the object store are the workflow's problem; these are this activity's,
	// and they are the ones that would otherwise fill a worker's disk.
	defer os.RemoveAll(dir)

	// Keeping the original extension matters: ffmpeg picks a demuxer partly by
	// suffix, and an .m4a handed over as "source" is guessed at instead.
	source := filepath.Join(dir, "source"+strings.ToLower(filepath.Ext(req.SourceName)))
	if err := a.fetch(ctx, req.SourceKey, source); err != nil {
		return Result{}, err
	}

	activity.RecordHeartbeat(ctx, Progress{Step: StepEncoding})

	media, err := a.Transcoder.Probe(ctx, source)
	if err != nil {
		return Result{}, unsupported(fmt.Errorf("that file could not be read as media: %w", err))
	}
	if !media.HasAudio {
		return Result{}, unsupported(errors.New("that file has no audio track to convert"))
	}

	output := filepath.Join(dir, "output."+format.Extension)
	last := time.Now()
	err = a.Transcoder.Transcode(
		ctx,
		source,
		output,
		Options{Format: format, Bitrate: req.Bitrate},
		func(fraction float64) {
			if time.Since(last) < heartbeatEvery {
				return
			}
			last = time.Now()
			activity.RecordHeartbeat(ctx, Progress{
				Step:    StepEncoding,
				Percent: clamp(fraction),
			})
		},
	)
	if err != nil {
		if ctx.Err() != nil {
			return Result{}, err
		}
		return Result{}, unsupported(fmt.Errorf("encoding failed: %w", err))
	}

	activity.RecordHeartbeat(ctx, Progress{Step: StepStoring, Percent: 1})

	file, err := os.Open(output)
	if err != nil {
		return Result{}, fmt.Errorf("opening the encoded file: %w", err)
	}
	defer file.Close()

	name := OutputName(req.SourceName, format)
	key := ResultKey(req.JobID, name)
	if err := a.Blobs.Put(ctx, key, file, format.MIME); err != nil {
		return Result{}, fmt.Errorf("storing the result: %w", err)
	}

	size, err := a.Blobs.Size(ctx, key)
	if err != nil {
		// The bytes are stored; not knowing their length is cosmetic.
		activity.GetLogger(ctx).Warn("result size unknown", "key", key, "error", err)
	}

	return Result{Key: key, Name: name, SizeBytes: size, Seconds: media.Seconds}, nil
}

// Discard removes one object. Missing is success: the workflow calls this on
// both the happy and the cancelled path, and a retry after a partial failure
// should not fail because the first attempt already worked.
func (a *Activities) Discard(ctx context.Context, key string) error {
	if key == "" {
		return nil
	}
	return a.Blobs.Delete(ctx, key)
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

	_, err = io.Copy(file, &reporter{
		reader: body,
		total:  total,
		report: func(fraction float64) {
			activity.RecordHeartbeat(ctx, Progress{Step: StepFetching, Percent: fraction})
		},
	})
	if err != nil {
		return fmt.Errorf("staging the source: %w", err)
	}
	return file.Sync()
}

// reporter heartbeats as bytes go past, so a slow fetch of a large file still
// counts as liveness and does not trip the heartbeat timeout.
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
	if r.total > 0 && time.Since(r.last) >= heartbeatEvery {
		r.last = time.Now()
		r.report(clamp(float64(r.read) / float64(r.total)))
	}
	return n, err
}

// OutputName is the download filename: the source's, with its extension
// swapped for the target format's.
func OutputName(sourceName string, format Format) string {
	base := filepath.Base(strings.TrimSpace(sourceName))
	base = strings.TrimSuffix(base, filepath.Ext(base))
	base = sanitise(base)
	if base == "" {
		base = "audio"
	}
	return base + "." + format.Extension
}

// SafeName makes an uploaded filename safe to paste into an object key, with
// its extension intact — ffmpeg picks a demuxer partly by suffix, so the
// extension is load-bearing rather than decoration.
func SafeName(sourceName string) string {
	cleaned := sanitise(filepath.Base(strings.TrimSpace(sourceName)))
	if cleaned == "" {
		return "upload"
	}
	return cleaned
}

// sanitise keeps the name recognisable but harmless: it becomes part of an
// object key and of a Content-Disposition header, so separators and control
// characters have to go.
//
// Runs of replacements collapse to one dash and the edges are trimmed, which
// is mostly cosmetic — but it also makes the result the same on Windows and
// Linux. `filepath.Base` treats a backslash as a separator on one and as an
// ordinary character on the other, and without the collapse that difference
// would show up in the filename people download.
func sanitise(name string) string {
	var b strings.Builder
	for _, r := range name {
		switch {
		case r < 0x20 || r == 0x7f:
			// Dropped outright — a control character is not standing in for
			// anything a person typed.
		case strings.ContainsRune(`/\:*?"<>|`, r):
			if !strings.HasSuffix(b.String(), "-") {
				b.WriteRune('-')
			}
		default:
			b.WriteRune(r)
		}
	}

	trimmed := strings.Trim(b.String(), " .-")
	if len(trimmed) > 80 {
		trimmed = strings.TrimRight(trimmed[:80], " .-")
	}
	return trimmed
}

func clamp(f float64) float64 {
	switch {
	case f < 0:
		return 0
	case f > 1:
		return 1
	}
	return f
}

func unsupported(err error) error {
	return temporal.NewNonRetryableApplicationError(err.Error(), ErrUnsupportedMedia, err)
}
