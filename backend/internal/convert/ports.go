package convert

import (
	"context"
	"io"
)

// Blobs is the object store the pipeline reads from and writes to.
//
// Deliberately smaller than the S3 API: four verbs is everything the workflow
// needs, and keeping the port narrow is what lets the SeaweedFS adapter be
// swapped for a local directory in a test without the domain noticing.
type Blobs interface {
	Put(ctx context.Context, key string, body io.Reader, contentType string) error
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
	Size(ctx context.Context, key string) (int64, error)
}

// Transcoder inspects and converts media on the local filesystem.
//
// Files rather than streams: ffmpeg needs to seek in most containers, so
// piping a source through stdin fails on exactly the formats people upload.
// The activity stages the bytes on disk and hands over paths.
type Transcoder interface {
	Probe(ctx context.Context, path string) (Media, error)

	// ToMP3 writes an MP3 to outPath. progress is called with a fraction
	// between 0 and 1 as ffmpeg reports it, and may be called many times a
	// second — the caller decides how often that is worth forwarding.
	ToMP3(ctx context.Context, inPath, outPath string, opt Options, progress func(float64)) error
}
