// Package media adapts the ffmpeg command line to the convert.Transcoder port.
//
// Shelling out rather than binding libavcodec: the worker image already needs
// the ffmpeg binaries for ffprobe, cgo bindings would tie the build to a
// matching library version, and the progress protocol on stdout is easier to
// consume than a callback across the cgo boundary.
package media

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"strings"

	"github.com/Zhyizhouu/af/backend/internal/convert"
)

type FFmpeg struct {
	FFmpegPath  string
	FFprobePath string
}

func New(ffmpegPath, ffprobePath string) FFmpeg {
	if ffmpegPath == "" {
		ffmpegPath = "ffmpeg"
	}
	if ffprobePath == "" {
		ffprobePath = "ffprobe"
	}
	return FFmpeg{FFmpegPath: ffmpegPath, FFprobePath: ffprobePath}
}

type probeOutput struct {
	Format struct {
		Duration string `json:"duration"`
		Name     string `json:"format_name"`
	} `json:"format"`
	Streams []struct {
		CodecType string `json:"codec_type"`
	} `json:"streams"`
}

func (f FFmpeg) Probe(ctx context.Context, path string) (convert.Media, error) {
	cmd := exec.CommandContext(ctx, f.FFprobePath,
		"-v", "error",
		"-print_format", "json",
		"-show_format",
		"-show_streams",
		path,
	)

	var stderr strings.Builder
	cmd.Stderr = &stderr

	out, err := cmd.Output()
	if err != nil {
		return convert.Media{}, fmt.Errorf("ffprobe: %w: %s", err, tail(stderr.String()))
	}

	var parsed probeOutput
	if err := json.Unmarshal(out, &parsed); err != nil {
		return convert.Media{}, fmt.Errorf("reading ffprobe output: %w", err)
	}

	media := convert.Media{Format: parsed.Format.Name}
	// Streamed sources often report no duration. That only costs a progress
	// bar, so it is not worth failing over.
	if seconds, err := strconv.ParseFloat(parsed.Format.Duration, 64); err == nil {
		media.Seconds = seconds
	}
	for _, stream := range parsed.Streams {
		if stream.CodecType == "audio" {
			media.HasAudio = true
			break
		}
	}
	return media, nil
}

func (f FFmpeg) ToMP3(
	ctx context.Context,
	inPath, outPath string,
	opt convert.Options,
	progress func(float64),
) error {
	// Probing again is one local stat-and-parse, and it is what makes the
	// percentage possible: ffmpeg reports how far it has got, never how far
	// there is to go.
	media, err := f.Probe(ctx, inPath)
	if err != nil {
		return err
	}

	cmd := exec.CommandContext(ctx, f.FFmpegPath,
		"-hide_banner",
		// Without this a prompt on a malformed file waits forever on a stdin
		// nobody is attached to.
		"-nostdin",
		"-y",
		"-i", inPath,
		// Drops video and cover art alike: the output is an audio file, and a
		// video stream in an MP3 container is what breaks fussy players.
		"-vn",
		"-c:a", "libmp3lame",
		"-b:a", strconv.Itoa(opt.Bitrate)+"k",
		"-map_metadata", "0",
		"-progress", "pipe:1",
		"-nostats",
		outPath,
	)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("ffmpeg progress pipe: %w", err)
	}

	var stderr strings.Builder
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("starting ffmpeg: %w", err)
	}

	readProgress(stdout, media.Seconds, progress)

	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("ffmpeg: %w: %s", err, tail(stderr.String()))
	}
	return nil
}

// readProgress consumes ffmpeg's `-progress` stream.
//
// The stream is key=value lines, one block per update. `out_time_us` is the
// microseconds encoded so far; `out_time_ms` is not milliseconds despite the
// name — it carries microseconds too in most builds — so it is left alone and
// the formatted `out_time` is the fallback instead.
func readProgress(stdout io.Reader, totalSeconds float64, report func(float64)) {
	if report == nil || totalSeconds <= 0 {
		// Still has to be drained, or ffmpeg blocks on a full pipe.
		_, _ = io.Copy(io.Discard, stdout)
		return
	}

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		key, value, found := strings.Cut(strings.TrimSpace(scanner.Text()), "=")
		if !found {
			continue
		}

		var seconds float64
		switch key {
		case "out_time_us":
			micros, err := strconv.ParseFloat(value, 64)
			if err != nil {
				continue
			}
			seconds = micros / 1_000_000
		case "out_time":
			parsed, ok := clockToSeconds(value)
			if !ok {
				continue
			}
			seconds = parsed
		default:
			continue
		}

		report(seconds / totalSeconds)
	}
}

// clockToSeconds parses ffmpeg's HH:MM:SS.micros.
func clockToSeconds(value string) (float64, bool) {
	parts := strings.Split(strings.TrimSpace(value), ":")
	if len(parts) != 3 {
		return 0, false
	}

	hours, err := strconv.ParseFloat(parts[0], 64)
	if err != nil {
		return 0, false
	}
	minutes, err := strconv.ParseFloat(parts[1], 64)
	if err != nil {
		return 0, false
	}
	seconds, err := strconv.ParseFloat(parts[2], 64)
	if err != nil {
		return 0, false
	}
	return hours*3600 + minutes*60 + seconds, true
}

// tail keeps the end of ffmpeg's stderr, which is where the reason lives. The
// rest is codec banners nobody needs in an error message.
func tail(s string) string {
	s = strings.TrimSpace(s)
	const limit = 400
	if len(s) <= limit {
		return s
	}
	return "…" + s[len(s)-limit:]
}
