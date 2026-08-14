package caption

import (
	"fmt"
	"sort"
	"strings"
)

const (
	// Below this a caption flashes rather than reads. Anything shorter is
	// stretched, or dropped if there is no room to stretch into.
	minSegmentSeconds = 0.4

	// A caption on screen much longer than this has almost certainly absorbed
	// a silence the model did not notice.
	maxSegmentSeconds = 12.0

	// Kept between neighbours so two captions never occupy the same frame.
	gapSeconds = 0.02
)

// Normalise makes a list of segments safe to render.
//
// This is where a model's timings are made honest. It is not polish: a
// transcript that runs past the end of the video, or whose segments overlap,
// produces a subtitle track that players handle in their own contradictory
// ways — some show both captions, some show neither, some stop rendering
// entirely from that point on.
//
// Applied to the model's output *and* to what comes back from the editor,
// because a person dragging blocks around can produce exactly the same
// problems by hand.
func Normalise(segments []Segment, durationSeconds float64) []Segment {
	cleaned := make([]Segment, 0, len(segments))
	for _, segment := range segments {
		text := tidyText(segment.Text)
		if text == "" {
			continue
		}
		cleaned = append(cleaned, Segment{
			Start: segment.Start,
			End:   segment.End,
			Text:  text,
		})
	}

	// Stable, so two segments claiming the same start keep the order the model
	// or the editor put them in.
	sort.SliceStable(cleaned, func(i, j int) bool {
		return cleaned[i].Start < cleaned[j].Start
	})

	out := make([]Segment, 0, len(cleaned))
	var previousEnd float64

	for _, segment := range cleaned {
		start := segment.Start
		if start < previousEnd {
			start = previousEnd
		}
		if start < 0 {
			start = 0
		}
		// A known duration is a hard ceiling; an unknown one (0) is not a
		// reason to throw the transcript away.
		if durationSeconds > 0 && start >= durationSeconds {
			break
		}

		end := segment.End
		if end < start+minSegmentSeconds {
			end = start + minSegmentSeconds
		}
		if end > start+maxSegmentSeconds {
			end = start + maxSegmentSeconds
		}
		if durationSeconds > 0 && end > durationSeconds {
			end = durationSeconds
		}
		if end-start < minSegmentSeconds/2 {
			// Ran out of video to stretch into.
			break
		}

		out = append(out, Segment{Start: start, End: end, Text: segment.Text})
		previousEnd = end + gapSeconds
	}

	return out
}

// tidyText normalises whitespace and removes the one sequence that cannot
// appear in a caption body: SRT uses `-->` as its cue separator, so a segment
// containing one would split into two malformed cues.
func tidyText(text string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	text = strings.ReplaceAll(text, "-->", "→")

	lines := make([]string, 0, 2)
	for _, line := range strings.Split(text, "\n") {
		if trimmed := strings.TrimSpace(line); trimmed != "" {
			lines = append(lines, strings.Join(strings.Fields(trimmed), " "))
		}
	}
	return strings.Join(lines, "\n")
}

// SRT renders the format Premiere, YouTube and every player agree on.
func SRT(segments []Segment) string {
	var b strings.Builder
	for i, segment := range segments {
		fmt.Fprintf(&b, "%d\n%s --> %s\n%s\n\n",
			i+1,
			stamp(segment.Start, ','),
			stamp(segment.End, ','),
			segment.Text,
		)
	}
	return b.String()
}

// VTT is what a browser's <track> element wants.
func VTT(segments []Segment) string {
	var b strings.Builder
	b.WriteString("WEBVTT\n\n")
	for i, segment := range segments {
		fmt.Fprintf(&b, "%d\n%s --> %s\n%s\n\n",
			i+1,
			stamp(segment.Start, '.'),
			stamp(segment.End, '.'),
			segment.Text,
		)
	}
	return b.String()
}

// stamp writes HH:MM:SS,mmm — or with a full stop, which is the only thing
// separating VTT's timestamps from SRT's.
func stamp(seconds float64, decimal rune) string {
	if seconds < 0 {
		seconds = 0
	}
	// Rounded to the millisecond first: truncating 3.9999 to 3 seconds and 999
	// milliseconds is right, but doing it in the wrong order gives 3.999.
	total := int64(seconds*1000 + 0.5)

	milliseconds := total % 1000
	total /= 1000
	secs := total % 60
	total /= 60
	minutes := total % 60
	hours := total / 60

	return fmt.Sprintf("%02d:%02d:%02d%c%03d",
		hours, minutes, secs, decimal, milliseconds)
}
