// Package caption holds the subtitle use case: transcribe a video, let
// somebody fix the result, then write it back into the file.
//
// The shape is deliberately different from the audio converter's. A caption
// job is not fire-and-forget — it stops half way, hands the segments to a
// person, and waits. That pause is the whole point: timings that come out of a
// model are close rather than exact, and a caption that is close is a caption
// that is wrong.
package caption

import (
	"fmt"
	"strings"
	"time"
)

type Stage string

const (
	StageQueued       Stage = "queued"
	StageExtracting   Stage = "extracting"
	StageTranscribing Stage = "transcribing"

	// StageReview is where the workflow parks, holding the segments, until the
	// editor signals it. Nothing happens on its own from here.
	StageReview Stage = "review"

	StageMuxing  Stage = "muxing"
	StageReady   Stage = "ready"
	StageExpired Stage = "expired"
	StageFailed  Stage = "failed"
)

const (
	// StatusQuery returns the job's state without its segments — it is polled
	// every second or so and the segments do not change while it runs.
	StatusQuery = "status"

	// SegmentsQuery returns the transcript. Asked for once, when the editor
	// opens, because a two-hour lecture is a large answer.
	SegmentsQuery = "segments"

	// ApproveSignal carries the edited segments back and releases the wait.
	ApproveSignal = "approve"
)

// Segment is one caption: a span of time and the words in it.
type Segment struct {
	// Seconds from the start of the video. Floats rather than a Duration
	// because this crosses to a browser and back, and JSON has no duration.
	Start float64 `json:"start"`
	End   float64 `json:"end"`
	Text  string  `json:"text"`
}

func (s Segment) Duration() float64 { return s.End - s.Start }

// Approval is what the editor sends back.
type Approval struct {
	Segments []Segment `json:"segments"`

	// Set when the person approving is the workflow's own review timer rather
	// than a person, so the log can tell the difference later.
	Automatic bool `json:"automatic"`
}

type Request struct {
	JobID      string `json:"jobId"`
	OwnerUID   string `json:"ownerUid"`
	SourceKey  string `json:"sourceKey"`
	SourceName string `json:"sourceName"`

	// BCP-47, or empty to let the model decide. A lecture that switches
	// between Indonesian and English is the case this exists for: naming one
	// language makes the model commit, and leaving it empty lets it follow.
	Language string `json:"language"`

	// How long the job waits in review before muxing what it has.
	ReviewTTL time.Duration `json:"reviewTtl"`
	ResultTTL time.Duration `json:"resultTtl"`
}

func (r Request) Validate() error {
	switch {
	case r.JobID == "":
		return fmt.Errorf("job id is required")
	case r.SourceKey == "":
		return fmt.Errorf("source key is required")
	case r.ReviewTTL <= 0 || r.ResultTTL <= 0:
		return fmt.Errorf("both lifetimes must be positive")
	}
	return nil
}

// Status is the queryable state of a job, minus the transcript.
type Status struct {
	JobID      string  `json:"jobId"`
	OwnerUID   string  `json:"ownerUid"`
	Stage      Stage   `json:"stage"`
	SourceName string  `json:"sourceName"`
	Language   string  `json:"language"`
	Seconds    float64 `json:"seconds"`
	Segments   int     `json:"segments"`

	// Set once the job reaches review, so the editor can show how long is
	// left before the workflow decides for itself.
	ReviewDeadline time.Time `json:"reviewDeadline"`

	VideoKey     string `json:"videoKey"`
	VideoName    string `json:"videoName"`
	SubtitleKey  string `json:"subtitleKey"`
	SubtitleName string `json:"subtitleName"`
	SizeBytes    int64  `json:"sizeBytes"`
	Error        string `json:"error,omitempty"`
}

// Languages the UI offers. Not a limit on what the model understands — it is
// the list of hints worth naming, with "detect" meaning no hint at all.
var Languages = []struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}{
	{"", "Detect"},
	{"id-ID", "Indonesian"},
	{"en-US", "English"},
	{"zh-CN", "Chinese"},
	{"ja-JP", "Japanese"},
	{"ko-KR", "Korean"},
}

func ValidLanguage(id string) bool {
	for _, language := range Languages {
		if language.ID == id {
			return true
		}
	}
	return false
}

// SourceKey and friends keep the object layout in one place.
func SourceKey(jobID, fileName string) string {
	return fmt.Sprintf("captions/%s/source/%s", jobID, fileName)
}

func ResultKey(jobID, fileName string) string {
	return fmt.Sprintf("captions/%s/result/%s", jobID, fileName)
}

// CaptionedName is the muxed file's name: the source's, marked so it cannot be
// confused with the original sitting next to it in a downloads folder.
func CaptionedName(sourceName string) string {
	base, _ := splitExtension(sourceName)
	if base == "" {
		base = "video"
	}
	return base + "-captioned.mp4"
}

// SubtitleName is the sidecar's name — the one that imports into a Premiere
// timeline as an editable caption track.
func SubtitleName(sourceName string) string {
	base, _ := splitExtension(sourceName)
	if base == "" {
		base = "video"
	}
	return base + ".srt"
}

func splitExtension(name string) (base, ext string) {
	name = strings.TrimSpace(name)
	if i := strings.LastIndex(name, "/"); i >= 0 {
		name = name[i+1:]
	}
	if i := strings.LastIndex(name, `\`); i >= 0 {
		name = name[i+1:]
	}
	if i := strings.LastIndex(name, "."); i > 0 {
		return sanitise(name[:i]), name[i:]
	}
	return sanitise(name), ""
}

// sanitise mirrors the audio converter's: this becomes part of an object key
// and of a Content-Disposition header.
func sanitise(name string) string {
	var b strings.Builder
	for _, r := range name {
		switch {
		case r < 0x20 || r == 0x7f:
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
