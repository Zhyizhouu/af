package caption

import (
	"context"
	"io"
)

// Blobs is the object store, same narrow port the audio converter uses.
type Blobs interface {
	Put(ctx context.Context, key string, body io.Reader, contentType string) error
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
	Size(ctx context.Context, key string) (int64, error)
}

// Chunk is a slice of the extracted audio, and where it sits in the original.
type Chunk struct {
	Path         string
	OffsetSecond float64
	Seconds      float64
}

// Video is the ffmpeg-shaped work: pull the audio out, cut it up, put the
// captions back in.
type Video interface {
	// Seconds is the source's running time. Captions cannot be validated
	// against a video whose length is unknown.
	Seconds(ctx context.Context, path string) (float64, error)

	// ExtractAudio writes speech-recognition-shaped audio: 16kHz mono, which
	// is what every ASR model wants and a fraction of the bytes of the
	// original track.
	ExtractAudio(ctx context.Context, videoPath, audioPath string) error

	// Split cuts audio into pieces of at most chunkSeconds.
	//
	// Chunking is what keeps the timings usable. A model asked to timestamp
	// ninety minutes in one pass drifts steadily further out as it goes;
	// asked to timestamp ten minutes, it stays close — and the offset of each
	// chunk is exact, because ffmpeg did the cutting.
	Split(ctx context.Context, audioPath, intoDir string, chunkSeconds float64) ([]Chunk, error)

	// Mux copies the video through untouched and adds the subtitles as a
	// selectable track. No re-encode, so it takes seconds and costs nothing
	// in quality.
	Mux(ctx context.Context, videoPath, subtitlePath, outPath, language string) error
}

// Transcriber turns speech into timed text.
type Transcriber interface {
	// Transcribe returns segments timed from the start of the given audio.
	// Offsetting them into the original is the caller's job, since only the
	// caller knows which chunk this was.
	//
	// languageHint is BCP-47 or empty for "work it out".
	Transcribe(ctx context.Context, audioPath, languageHint string) ([]Segment, error)
}
