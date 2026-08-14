package media

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/Zhyizhouu/af/backend/internal/caption"
)

// Seconds is the source's running time, which every caption timing is checked
// against.
func (f FFmpeg) Seconds(ctx context.Context, path string) (float64, error) {
	media, err := f.Probe(ctx, path)
	if err != nil {
		return 0, err
	}
	if media.Seconds <= 0 {
		return 0, fmt.Errorf("that file does not report a duration")
	}
	return media.Seconds, nil
}

// ExtractAudio writes 16kHz mono WAV.
//
// Every speech model resamples to something like this internally, so sending
// the original 48kHz stereo AAC costs upload time and buys nothing. A ninety
// minute lecture comes out around 170MB, which is why it is then chunked.
func (f FFmpeg) ExtractAudio(ctx context.Context, videoPath, audioPath string) error {
	cmd := commandContext(ctx, f.FFmpegPath,
		"-hide_banner", "-nostdin", "-y",
		"-i", videoPath,
		"-vn",
		"-ac", "1",
		"-ar", "16000",
		"-c:a", "pcm_s16le",
		audioPath,
	)

	var stderr strings.Builder
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("extracting audio: %w: %s", err, tail(stderr.String()))
	}
	return nil
}

// Split cuts audio into chunks of at most chunkSeconds.
//
// `-f segment` rather than a loop of `-ss`/`-t` calls: one pass over the file,
// and the cut points are exact sample offsets rather than the nearest
// keyframe. Exactness is the point — each chunk's offset is added back to
// every timestamp inside it, so a sloppy cut would shift a whole chunk of
// captions.
func (f FFmpeg) Split(
	ctx context.Context,
	audioPath, intoDir string,
	chunkSeconds float64,
) ([]caption.Chunk, error) {
	if chunkSeconds <= 0 {
		chunkSeconds = 600
	}

	total, err := f.Seconds(ctx, audioPath)
	if err != nil {
		return nil, err
	}

	// Short enough to send whole: splitting it would only add seams for the
	// model to lose a word across.
	if total <= chunkSeconds {
		return []caption.Chunk{{Path: audioPath, OffsetSecond: 0, Seconds: total}}, nil
	}

	pattern := filepath.Join(intoDir, "chunk-%04d.wav")
	cmd := commandContext(ctx, f.FFmpegPath,
		"-hide_banner", "-nostdin", "-y",
		"-i", audioPath,
		"-f", "segment",
		"-segment_time", strconv.FormatFloat(chunkSeconds, 'f', 3, 64),
		"-c:a", "pcm_s16le",
		"-ac", "1", "-ar", "16000",
		"-reset_timestamps", "1",
		pattern,
	)

	var stderr strings.Builder
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("splitting audio: %w: %s", err, tail(stderr.String()))
	}

	paths, err := filepath.Glob(filepath.Join(intoDir, "chunk-*.wav"))
	if err != nil {
		return nil, err
	}
	if len(paths) == 0 {
		return nil, fmt.Errorf("splitting audio produced nothing")
	}
	// Glob's order is not guaranteed, and chunk order is what the offsets are
	// built from. The zero-padded names sort correctly.
	sort.Strings(paths)

	chunks := make([]caption.Chunk, 0, len(paths))
	for i, path := range paths {
		offset := float64(i) * chunkSeconds
		seconds := math.Min(chunkSeconds, total-offset)
		if seconds <= 0 {
			// A trailing empty segment, which ffmpeg occasionally writes when
			// the duration divides evenly.
			_ = os.Remove(path)
			continue
		}
		chunks = append(chunks, caption.Chunk{
			Path:         path,
			OffsetSecond: offset,
			Seconds:      seconds,
		})
	}
	return chunks, nil
}

// Mux writes the video through untouched with the subtitles alongside it.
//
// `-c copy` on both existing streams is what makes this take seconds instead
// of minutes: not a frame is re-encoded, so the picture is bit-for-bit the
// original and nothing is lost to another generation of compression.
//
// `mov_text` is the only subtitle codec MP4 carries. It is plain text without
// styling, which is what makes the track editable everywhere afterwards.
func (f FFmpeg) Mux(
	ctx context.Context,
	videoPath, subtitlePath, outPath, language string,
) error {
	// ISO 639-2, which is what an MP4 track tag wants — `id-ID` means nothing
	// to it, `ind` does.
	tag := iso639_2(language)

	cmd := commandContext(ctx, f.FFmpegPath,
		"-hide_banner", "-nostdin", "-y",
		"-i", videoPath,
		"-i", subtitlePath,
		"-map", "0",
		"-map", "1",
		"-c", "copy",
		"-c:s", "mov_text",
		"-metadata:s:s:0", "language="+tag,
		"-metadata:s:s:0", "title=Captions",
		// Some players show the first subtitle track only if it is flagged.
		"-disposition:s:0", "default",
		outPath,
	)

	var stderr strings.Builder
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("adding the caption track: %w: %s", err, tail(stderr.String()))
	}
	return nil
}

// iso639_2 maps the BCP-47 hints the UI offers onto MP4's three-letter tags.
// Anything unrecognised becomes "und", which is the correct answer for
// "undetermined" rather than a guess.
func iso639_2(language string) string {
	primary, _, _ := strings.Cut(strings.ToLower(language), "-")
	switch primary {
	case "id":
		return "ind"
	case "en":
		return "eng"
	case "zh":
		return "zho"
	case "ja":
		return "jpn"
	case "ko":
		return "kor"
	default:
		return "und"
	}
}
