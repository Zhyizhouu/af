package caption_test

import (
	"context"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"go.temporal.io/sdk/testsuite"

	"github.com/Zhyizhouu/af/backend/internal/caption"
)

// The review pause is the part of this workflow with no equivalent anywhere
// else in AF: the job stops, hands its work to a person, and waits. These
// tests cover what happens when the person answers, when they answer with
// something different, and when they never answer at all.
func TestReviewPause(t *testing.T) {
	transcribed := []caption.Segment{
		{Start: 0, End: 2, Text: "Selamat pagi"},
		{Start: 2.5, End: 5, Text: "hari ini kita bahas rekursi"},
	}

	t.Run("edited segments are what gets muxed", func(t *testing.T) {
		env, activities, _ := newEnv()

		env.OnActivity(activities.Transcribe, mock.Anything, mock.Anything).
			Return(caption.Transcript{Segments: transcribed, Seconds: 60}, nil)

		var muxed []caption.Segment
		env.OnActivity(activities.Mux, mock.Anything, mock.Anything).
			Run(func(args mock.Arguments) {
				muxed = args.Get(1).(caption.MuxInput).Segments
			}).
			Return(caption.Muxed{
				VideoKey:  "captions/job-1/result/talk-captioned.mp4",
				VideoName: "talk-captioned.mp4",
				SizeBytes: 1024,
			}, nil)

		// Somebody fixes a typo and retimes the second caption.
		env.RegisterDelayedCallback(func() {
			env.SignalWorkflow(caption.ApproveSignal, caption.Approval{
				Segments: []caption.Segment{
					{Start: 0, End: 2, Text: "Selamat pagi"},
					{Start: 2.5, End: 6, Text: "Hari ini kita bahas rekursi."},
				},
			})
		}, time.Minute)

		env.ExecuteWorkflow(caption.Generate, request())

		if len(muxed) != 2 {
			t.Fatalf("expected 2 segments muxed, got %d", len(muxed))
		}
		if muxed[1].Text != "Hari ini kita bahas rekursi." {
			t.Errorf("the edit was lost: muxed %q", muxed[1].Text)
		}
		if muxed[1].End != 6 {
			t.Errorf("the retiming was lost: ends at %v, expected 6", muxed[1].End)
		}
	})

	// Somebody who uploaded a lecture and closed the tab is better served by
	// an imperfect caption track than by nothing.
	t.Run("a lapsed review window muxes the transcript unedited", func(t *testing.T) {
		env, activities, _ := newEnv()

		env.OnActivity(activities.Transcribe, mock.Anything, mock.Anything).
			Return(caption.Transcript{Segments: transcribed, Seconds: 60}, nil)

		var muxed []caption.Segment
		env.OnActivity(activities.Mux, mock.Anything, mock.Anything).
			Run(func(args mock.Arguments) {
				muxed = args.Get(1).(caption.MuxInput).Segments
			}).
			Return(caption.Muxed{VideoKey: "k", VideoName: "n"}, nil)

		// No signal is ever sent; the test environment fast-forwards the
		// review timer rather than waiting an hour for it.
		env.ExecuteWorkflow(caption.Generate, request())

		if !env.IsWorkflowCompleted() {
			t.Fatal("the workflow should not still be waiting")
		}
		if len(muxed) != 2 {
			t.Fatalf("expected the transcript muxed as-is, got %d segments", len(muxed))
		}
	})

	// The signal can be sent by anything that can reach Temporal, so the
	// workflow re-normalises rather than trusting what arrives.
	t.Run("an approval with broken timings is repaired, not trusted", func(t *testing.T) {
		env, activities, _ := newEnv()

		env.OnActivity(activities.Transcribe, mock.Anything, mock.Anything).
			Return(caption.Transcript{Segments: transcribed, Seconds: 60}, nil)

		var muxed []caption.Segment
		env.OnActivity(activities.Mux, mock.Anything, mock.Anything).
			Run(func(args mock.Arguments) {
				muxed = args.Get(1).(caption.MuxInput).Segments
			}).
			Return(caption.Muxed{VideoKey: "k", VideoName: "n"}, nil)

		env.RegisterDelayedCallback(func() {
			env.SignalWorkflow(caption.ApproveSignal, caption.Approval{
				Segments: []caption.Segment{
					{Start: 10, End: 20, Text: "second"},
					{Start: 0, End: 15, Text: "first"},
					{Start: 500, End: 600, Text: "past the end"},
				},
			})
		}, time.Minute)

		env.ExecuteWorkflow(caption.Generate, request())

		if len(muxed) != 2 {
			t.Fatalf("expected the out-of-range segment dropped, got %d", len(muxed))
		}
		if muxed[0].Text != "first" {
			t.Errorf("segments were not sorted: first is %q", muxed[0].Text)
		}
		if muxed[1].Start < muxed[0].End {
			t.Error("segments still overlap after the workflow normalised them")
		}
	})
}

// The uploaded video is the biggest thing in the store and nobody asked to
// keep it. Same guarantee as the audio converter, exercised the same way.
func TestSourceIsAlwaysDeleted(t *testing.T) {
	t.Run("after a finished job", func(t *testing.T) {
		env, activities, blobs := newEnv()

		env.OnActivity(activities.Transcribe, mock.Anything, mock.Anything).
			Return(caption.Transcript{
				Segments: []caption.Segment{{Start: 0, End: 2, Text: "hello"}},
				Seconds:  60,
			}, nil)
		env.OnActivity(activities.Mux, mock.Anything, mock.Anything).
			Return(caption.Muxed{
				VideoKey:    "captions/job-1/result/talk-captioned.mp4",
				SubtitleKey: "captions/job-1/result/talk.srt",
			}, nil)

		env.RegisterDelayedCallback(func() {
			env.SignalWorkflow(caption.ApproveSignal, caption.Approval{
				Segments: []caption.Segment{{Start: 0, End: 2, Text: "hello"}},
			})
		}, time.Minute)

		env.ExecuteWorkflow(caption.Generate, request())

		requireDeleted(t, blobs, "captions/job-1/source/talk.mp4")
		// And both results, once the lifetime is up.
		requireDeleted(t, blobs, "captions/job-1/result/talk-captioned.mp4")
		requireDeleted(t, blobs, "captions/job-1/result/talk.srt")
	})

	t.Run("when transcription fails", func(t *testing.T) {
		env, activities, blobs := newEnv()

		env.OnActivity(activities.Transcribe, mock.Anything, mock.Anything).
			Return(caption.Transcript{}, errors.New("gemini said no"))

		env.ExecuteWorkflow(caption.Generate, request())

		if env.GetWorkflowError() == nil {
			t.Fatal("a failed transcription should fail the workflow")
		}
		requireDeleted(t, blobs, "captions/job-1/source/talk.mp4")
	})

	t.Run("when cancelled during review", func(t *testing.T) {
		env, activities, blobs := newEnv()

		env.OnActivity(activities.Transcribe, mock.Anything, mock.Anything).
			Return(caption.Transcript{
				Segments: []caption.Segment{{Start: 0, End: 2, Text: "hello"}},
				Seconds:  60,
			}, nil)

		env.RegisterDelayedCallback(env.CancelWorkflow, time.Minute)

		env.ExecuteWorkflow(caption.Generate, request())

		requireDeleted(t, blobs, "captions/job-1/source/talk.mp4")
	})
}

func request() caption.Request {
	return caption.Request{
		JobID:      "job-1",
		OwnerUID:   "user-1",
		SourceKey:  "captions/job-1/source/talk.mp4",
		SourceName: "talk.mp4",
		Language:   "id-ID",
		ReviewTTL:  time.Hour,
		ResultTTL:  2 * time.Hour,
	}
}

// ---- harness ----

func newEnv() (*testsuite.TestWorkflowEnvironment, *caption.Activities, *recordingBlobs) {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()

	blobs := &recordingBlobs{}
	// Discard stays real: it is what the deletion tests are actually about.
	activities := &caption.Activities{Blobs: blobs}
	env.RegisterActivity(activities)

	return env, activities, blobs
}

func requireDeleted(t *testing.T, blobs *recordingBlobs, key string) {
	t.Helper()
	if !blobs.deleted(key) {
		t.Fatalf("%q was left behind; deleted: [%s]", key, blobs.keys())
	}
}

type recordingBlobs struct {
	mu      sync.Mutex
	removed []string
}

func (b *recordingBlobs) Delete(_ context.Context, key string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.removed = append(b.removed, key)
	return nil
}

func (b *recordingBlobs) deleted(key string) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, k := range b.removed {
		if k == key {
			return true
		}
	}
	return false
}

func (b *recordingBlobs) keys() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return strings.Join(b.removed, ", ")
}

func (b *recordingBlobs) Put(context.Context, string, io.Reader, string) error { return nil }

func (b *recordingBlobs) Get(context.Context, string) (io.ReadCloser, error) {
	return io.NopCloser(strings.NewReader("")), nil
}

func (b *recordingBlobs) Size(context.Context, string) (int64, error) { return 0, nil }
