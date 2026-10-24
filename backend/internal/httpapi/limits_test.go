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
	jobs := newOpenJobs(time.Hour)
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

func TestRateLimiterSweepsOncePerInterval(t *testing.T) {
	clock := time.Unix(1000, 0)
	limiter := newRateLimiter(20)
	limiter.now = func() time.Time { return clock }

	limiter.allow("old")
	clock = clock.Add(rateWindow + time.Second)
	limiter.allow("fresh")
	if _, ok := limiter.buckets["old"]; ok {
		t.Fatal("an expired bucket should be swept once the interval has passed")
	}

	clock = clock.Add(rateWindow)
	limiter.lastSweep = clock.Add(-sweepInterval + time.Second)
	limiter.allow("other")
	if _, ok := limiter.buckets["fresh"]; !ok {
		t.Fatal("no sweep should run inside the interval")
	}

	clock = clock.Add(sweepInterval)
	limiter.allow("other")
	if _, ok := limiter.buckets["fresh"]; ok {
		t.Fatal("the sweep should run once the interval has elapsed")
	}
}

func TestOpenJobsDropsEmptyAccountsAndExpiredIDs(t *testing.T) {
	clock := time.Unix(1000, 0)
	jobs := newOpenJobs(time.Hour)
	jobs.now = func() time.Time { return clock }
	stillOpen := func(context.Context, string) bool { return true }
	ctx := context.Background()

	jobs.reserve(ctx, "u1", "a", 3, stillOpen)
	jobs.release("u1", "a")
	if _, ok := jobs.byUID["u1"]; ok {
		t.Fatal("an account with no open jobs should be removed")
	}

	jobs.reserve(ctx, "u2", "b", 3, stillOpen)
	clock = clock.Add(2 * time.Hour)
	jobs.reserve(ctx, "u3", "c", 3, stillOpen)
	if _, ok := jobs.byUID["u2"]; ok {
		t.Fatal("an id past the execution budget should be swept with its account")
	}
	if len(jobs.byUID["u3"]) != 1 {
		t.Fatal("the new reservation must survive the sweep")
	}

	jobs.reserve(ctx, "u4", "d", 3, stillOpen)
	clock = clock.Add(2 * time.Hour)
	jobs.lastSweep = clock.Add(-sweepInterval + time.Second)
	jobs.reserve(ctx, "u5", "e", 3, stillOpen)
	if _, ok := jobs.byUID["u4"]; !ok {
		t.Fatal("no sweep should run inside the interval")
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
