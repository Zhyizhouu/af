package caption_test

import (
	"strings"
	"testing"

	"github.com/Zhyizhouu/af/backend/internal/caption"
)

// Normalise is the guard between a model's arithmetic and a subtitle file.
//
// Every case here is something a language model actually does to timestamps,
// and each one produces a track that players disagree about: some show both
// overlapping captions, some show neither, some stop rendering from that point
// on. Getting this wrong is not a cosmetic failure.
func TestNormaliseFixesModelTimings(t *testing.T) {
	const duration = 60

	t.Run("overlapping segments are pushed apart", func(t *testing.T) {
		got := caption.Normalise([]caption.Segment{
			{Start: 0, End: 5, Text: "first"},
			{Start: 3, End: 8, Text: "second"},
		}, duration)

		if len(got) != 2 {
			t.Fatalf("expected 2 segments, got %d", len(got))
		}
		if got[1].Start < got[0].End {
			t.Errorf("segments still overlap: %v ends at %v, %v starts at %v",
				got[0].Text, got[0].End, got[1].Text, got[1].Start)
		}
	})

	t.Run("out-of-order segments are sorted", func(t *testing.T) {
		got := caption.Normalise([]caption.Segment{
			{Start: 10, End: 12, Text: "later"},
			{Start: 1, End: 3, Text: "earlier"},
		}, duration)

		if got[0].Text != "earlier" {
			t.Errorf("expected the earlier segment first, got %q", got[0].Text)
		}
	})

	// The classic drift failure: a model that has lost track of where it is
	// puts the last caption past the end of the video.
	t.Run("segments past the end are clamped or dropped", func(t *testing.T) {
		got := caption.Normalise([]caption.Segment{
			{Start: 55, End: 70, Text: "runs over"},
			{Start: 90, End: 95, Text: "entirely outside"},
		}, duration)

		if len(got) != 1 {
			t.Fatalf("expected the outside segment dropped, got %d segments", len(got))
		}
		if got[0].End > duration {
			t.Errorf("segment ends at %v, past the %v-second video", got[0].End, duration)
		}
	})

	t.Run("zero-length segments are given room to be read", func(t *testing.T) {
		got := caption.Normalise([]caption.Segment{
			{Start: 4, End: 4, Text: "blink"},
		}, duration)

		if len(got) != 1 || got[0].Duration() < 0.3 {
			t.Fatalf("expected a readable segment, got %+v", got)
		}
	})

	t.Run("a caption held for a whole minute is cut back", func(t *testing.T) {
		got := caption.Normalise([]caption.Segment{
			{Start: 0, End: 55, Text: "the model missed a pause"},
		}, duration)

		if got[0].Duration() > 15 {
			t.Errorf("segment runs for %vs; a caption that long has swallowed a silence",
				got[0].Duration())
		}
	})

	t.Run("negative starts are pulled to zero", func(t *testing.T) {
		got := caption.Normalise([]caption.Segment{
			{Start: -3, End: 2, Text: "before the beginning"},
		}, duration)

		if got[0].Start < 0 {
			t.Errorf("segment starts at %v", got[0].Start)
		}
	})

	t.Run("empty and whitespace-only segments are dropped", func(t *testing.T) {
		got := caption.Normalise([]caption.Segment{
			{Start: 1, End: 2, Text: "   "},
			{Start: 3, End: 4, Text: ""},
			{Start: 5, End: 6, Text: "real"},
		}, duration)

		if len(got) != 1 || got[0].Text != "real" {
			t.Fatalf("expected only the real segment, got %+v", got)
		}
	})

	// SRT uses `-->` to separate a cue's timestamps. A segment containing one
	// would split into two malformed cues and corrupt everything after it.
	t.Run("an arrow in the text cannot break the file", func(t *testing.T) {
		got := caption.Normalise([]caption.Segment{
			{Start: 1, End: 3, Text: "input --> output"},
		}, duration)

		if strings.Contains(got[0].Text, "-->") {
			t.Errorf("text still contains a cue separator: %q", got[0].Text)
		}
	})

	// A video whose duration ffprobe would not report is not a reason to
	// throw a good transcript away.
	t.Run("an unknown duration still normalises", func(t *testing.T) {
		got := caption.Normalise([]caption.Segment{
			{Start: 0, End: 2, Text: "one"},
			{Start: 1, End: 4, Text: "two"},
		}, 0)

		if len(got) != 2 {
			t.Fatalf("expected both segments kept, got %d", len(got))
		}
		if got[1].Start < got[0].End {
			t.Error("segments still overlap")
		}
	})
}

func TestSRTFormat(t *testing.T) {
	got := caption.SRT([]caption.Segment{
		{Start: 0, End: 2.5, Text: "First line"},
		{Start: 3661.007, End: 3663, Text: "Past an hour"},
	})

	want := "1\n00:00:00,000 --> 00:00:02,500\nFirst line\n\n" +
		"2\n01:01:01,007 --> 01:01:03,000\nPast an hour\n\n"

	if got != want {
		t.Errorf("SRT mismatch\n got: %q\nwant: %q", got, want)
	}
}

func TestVTTFormat(t *testing.T) {
	got := caption.VTT([]caption.Segment{{Start: 1.5, End: 2, Text: "Hello"}})

	if !strings.HasPrefix(got, "WEBVTT\n\n") {
		t.Error("VTT must start with its magic line or a browser rejects it")
	}
	// A full stop, not a comma — the one thing separating VTT from SRT.
	if !strings.Contains(got, "00:00:01.500 --> 00:00:02.000") {
		t.Errorf("VTT timestamps are wrong: %q", got)
	}
}

// Rounding has to happen before the split into units, or 3.9999 seconds
// becomes 3 seconds and 999 milliseconds instead of 4 seconds flat.
func TestStampRoundsBeforeSplitting(t *testing.T) {
	got := caption.SRT([]caption.Segment{{Start: 3.9999, End: 5, Text: "x"}})

	if !strings.Contains(got, "00:00:04,000 -->") {
		t.Errorf("expected 00:00:04,000, got %q", strings.SplitN(got, "\n", 3)[1])
	}
}

func TestOutputNames(t *testing.T) {
	for _, c := range []struct{ in, video, subtitle string }{
		{"lecture.mp4", "lecture-captioned.mp4", "lecture.srt"},
		{"lecture.mkv", "lecture-captioned.mp4", "lecture.srt"},
		{"../../etc/passwd", "passwd-captioned.mp4", "passwd.srt"},
		{"", "video-captioned.mp4", "video.srt"},
	} {
		if got := caption.CaptionedName(c.in); got != c.video {
			t.Errorf("CaptionedName(%q) = %q, want %q", c.in, got, c.video)
		}
		if got := caption.SubtitleName(c.in); got != c.subtitle {
			t.Errorf("SubtitleName(%q) = %q, want %q", c.in, got, c.subtitle)
		}
	}
}
