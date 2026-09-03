package temporalclient

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"go.temporal.io/sdk/client"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestDialWithRetrySucceedsWithoutRetrying(t *testing.T) {
	calls := 0
	dial := func() (client.Client, error) {
		calls++
		return nil, nil
	}

	if _, err := DialWithRetry(context.Background(), dial, discardLogger(), 3, time.Millisecond); err != nil {
		t.Fatalf("DialWithRetry: %v", err)
	}
	if calls != 1 {
		t.Errorf("expected 1 call, got %d", calls)
	}
}

func TestDialWithRetrySucceedsOnALaterAttempt(t *testing.T) {
	calls := 0
	dial := func() (client.Client, error) {
		calls++
		if calls < 3 {
			return nil, errors.New("failed reaching server: context deadline exceeded")
		}
		return nil, nil
	}

	if _, err := DialWithRetry(context.Background(), dial, discardLogger(), 5, time.Millisecond); err != nil {
		t.Fatalf("DialWithRetry: %v", err)
	}
	if calls != 3 {
		t.Errorf("expected 3 calls, got %d", calls)
	}
}

func TestDialWithRetryReturnsTheLastErrorOnceExhausted(t *testing.T) {
	calls := 0
	sentinel := errors.New("still unreachable")
	dial := func() (client.Client, error) {
		calls++
		return nil, sentinel
	}

	_, err := DialWithRetry(context.Background(), dial, discardLogger(), 3, time.Millisecond)
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected the sentinel error, got %v", err)
	}
	if calls != 3 {
		t.Errorf("expected exactly 3 attempts, got %d", calls)
	}
}

func TestDialWithRetryStopsWhenContextIsCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	calls := 0
	dial := func() (client.Client, error) {
		calls++
		if calls == 1 {
			cancel()
		}
		return nil, errors.New("unreachable")
	}

	// A long delay: only cancellation should cut this short, not the delay
	// naturally elapsing before the test's own timeout does.
	_, err := DialWithRetry(ctx, dial, discardLogger(), 10, time.Minute)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
	if calls != 1 {
		t.Errorf("expected exactly 1 attempt before cancellation, got %d", calls)
	}
}
