package httpapi

import (
	"context"
	"mime"
	"testing"
	"time"
)

func TestRateLimiterRefillsOverTheWindow(t *testing.T) {
	clock := time.Unix(1000, 0)
	limiter := newRateLimiter(20)
	limiter.now = func() time.Time { return clock }

	for i := 0; i < 20; i++ {
		if !limiter.allow("u1") {
			t.Fatalf("request %d refused inside the allowance", i+1)
		}
	}
	if limiter.allow("u1") {
		t.Fatal("the 21st request should be refused")
	}
	if !limiter.allow("u2") {
		t.Fatal("another account must have its own bucket")
	}

	clock = clock.Add(rateWindow / 20)
	if !limiter.allow("u1") {
		t.Fatal("one token should have refilled")
	}
	if limiter.allow("u1") {
		t.Fatal("only one token should have refilled")
	}
}

func TestOpenJobsCap(t *testing.T) {
	open := map[string]bool{"a": true, "b": true, "c": true, "d": true}
	stillOpen := func(_ context.Context, id string) bool { return open[id] }
	jobs := newOpenJobs()
	ctx := context.Background()

	for _, id := range []string{"a", "b", "c"} {
		if !jobs.reserve(ctx, "u1", id, 3, stillOpen) {
			t.Fatalf("job %s refused under the cap", id)
		}
	}
	if jobs.reserve(ctx, "u1", "d", 3, stillOpen) {
		t.Fatal("a fourth open job should be refused")
	}
	if !jobs.reserve(ctx, "u2", "x", 3, stillOpen) {
		t.Fatal("another account is not affected")
	}

	open["b"] = false
	if !jobs.reserve(ctx, "u1", "d", 3, stillOpen) {
		t.Fatal("a finished job should free its slot")
	}

	jobs.release("u1", "a")
	if got := len(jobs.ids("u1")); got != 2 {
		t.Fatalf("open = %d, want 2 after a release", got)
	}
}

func TestContentDispositionEncodesNonASCII(t *testing.T) {
	header := contentDisposition("résumé 日本.mp3")

	disposition, params, err := mime.ParseMediaType(header)
	if err != nil {
		t.Fatalf("%q does not parse: %v", header, err)
	}
	if disposition != "attachment" || params["filename"] != "résumé 日本.mp3" {
		t.Fatalf("got %q %v from %q", disposition, params, header)
	}
}
