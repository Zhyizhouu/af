package convert_test

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

	"github.com/Zhyizhouu/af/backend/internal/convert"
)

// The uploaded source must not survive the job.
//
// It is the larger of the two files and the one nobody asked to keep, so every
// way out of the workflow — finished, refused, failed, cancelled — has to take
// it with it. These run the real workflow against Temporal's test environment,
// so the durable timer and the disconnected cleanup context are exercised
// rather than described.
func TestSourceIsAlwaysDeleted(t *testing.T) {
	const sourceKey = "sources/job-1/lecture.m4a"

	request := func(format string) convert.Request {
		return convert.Request{
			JobID:      "job-1",
			OwnerUID:   "user-1",
			SourceKey:  sourceKey,
			SourceName: "lecture.m4a",
			Format:     format,
			Bitrate:    192,
			ResultTTL:  2 * time.Hour,
		}
	}

	t.Run("after a successful conversion", func(t *testing.T) {
		env, activities, blobs := newEnv()
		env.OnActivity(activities.Convert, mock.Anything, mock.Anything).
			Return(convert.Result{
				Key:       "results/job-1/lecture.mp3",
				Name:      "lecture.mp3",
				SizeBytes: 4096,
			}, nil)

		env.ExecuteWorkflow(convert.Audio, request("mp3"))

		requireDeleted(t, blobs, sourceKey)
		// And the result too, once its lifetime is up — the test environment
		// fast-forwards the two-hour timer rather than waiting it out.
		requireDeleted(t, blobs, "results/job-1/lecture.mp3")
	})

	t.Run("when the conversion fails", func(t *testing.T) {
		env, activities, blobs := newEnv()
		env.OnActivity(activities.Convert, mock.Anything, mock.Anything).
			Return(convert.Result{}, errors.New("ffmpeg exploded"))

		env.ExecuteWorkflow(convert.Audio, request("mp3"))

		if env.GetWorkflowError() == nil {
			t.Fatal("a failed conversion should fail the workflow")
		}
		requireDeleted(t, blobs, sourceKey)
	})

	// The request never reaches an activity, so nothing else would ever come
	// back for the bytes the gateway has already uploaded.
	t.Run("when the request is rejected before any work starts", func(t *testing.T) {
		env, _, blobs := newEnv()

		env.ExecuteWorkflow(convert.Audio, request("mp4"))

		if env.GetWorkflowError() == nil {
			t.Fatal("an unknown format should fail the workflow")
		}
		requireDeleted(t, blobs, sourceKey)
	})
}

// Cancellation is the case a plain cleanup call gets wrong: a cancelled
// workflow context refuses to schedule anything, so a deletion written the
// obvious way silently does not happen.
func TestCancellationStillDeletesBothFiles(t *testing.T) {
	env, activities, blobs := newEnv()

	env.OnActivity(activities.Convert, mock.Anything, mock.Anything).
		Return(convert.Result{
			Key:       "results/job-2/talk.opus",
			Name:      "talk.opus",
			SizeBytes: 2048,
		}, nil)

	// Once the result is ready the workflow is sitting on its TTL timer, which
	// is exactly where a cancellation lands in practice.
	env.RegisterDelayedCallback(env.CancelWorkflow, time.Minute)

	env.ExecuteWorkflow(convert.Audio, convert.Request{
		JobID:      "job-2",
		OwnerUID:   "user-1",
		SourceKey:  "sources/job-2/talk.wav",
		SourceName: "talk.wav",
		Format:     "opus",
		Bitrate:    192,
		ResultTTL:  2 * time.Hour,
	})

	requireDeleted(t, blobs, "sources/job-2/talk.wav")
	requireDeleted(t, blobs, "results/job-2/talk.opus")
}

// A lossless format carries no bitrate, so validation must not demand one.
func TestLosslessRequestsNeedNoBitrate(t *testing.T) {
	request := convert.Request{
		JobID:     "job-3",
		SourceKey: "sources/job-3/talk.mp3",
		Format:    "wav",
	}
	if err := request.Validate(); err != nil {
		t.Fatalf("a WAV request without a bitrate should be valid: %v", err)
	}

	request.Format = "mp3"
	if err := request.Validate(); err == nil {
		t.Fatal("an MP3 request without a bitrate should be rejected")
	}
}

func TestOutputNameSwapsTheExtension(t *testing.T) {
	flac, err := convert.FormatByID("flac")
	if err != nil {
		t.Fatal(err)
	}

	// The last two matter beyond tidiness. A traversal attempt has to end up
	// as a plain filename, and the separator case has to give the same answer
	// on the Windows dev machine as in the Linux container.
	for _, c := range []struct{ in, want string }{
		{"lecture.m4a", "lecture.flac"},
		{"no-extension", "no-extension.flac"},
		{"../../etc/passwd", "passwd.flac"},
		{`weird/\:*?"<>|name.wav`, "name.flac"},
		{"   ", "audio.flac"},
	} {
		if got := convert.OutputName(c.in, flac); got != c.want {
			t.Errorf("OutputName(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// ---- harness ----

func newEnv() (*testsuite.TestWorkflowEnvironment, *convert.Activities, *recordingBlobs) {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()

	blobs := &recordingBlobs{}
	// Discard is deliberately left real: it is the thing under test, and
	// mocking it would only prove that the mock was called.
	activities := &convert.Activities{Blobs: blobs}
	env.RegisterActivity(activities)

	return env, activities, blobs
}

func requireDeleted(t *testing.T, blobs *recordingBlobs, key string) {
	t.Helper()
	if !blobs.deleted(key) {
		t.Fatalf("%q was left behind; deleted: [%s]", key, blobs.keys())
	}
}

// recordingBlobs is a convert.Blobs that only remembers what was deleted.
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

func (b *recordingBlobs) Put(context.Context, string, io.Reader, string) error {
	return nil
}

func (b *recordingBlobs) Get(context.Context, string) (io.ReadCloser, error) {
	return io.NopCloser(strings.NewReader("")), nil
}

func (b *recordingBlobs) Size(context.Context, string) (int64, error) { return 0, nil }
