// Package temporalclient wraps connecting to Temporal with retry.
package temporalclient

import (
	"context"
	"log/slog"
	"time"

	"go.temporal.io/sdk/client"
)

/*
DialWithRetry calls dial repeatedly with a fixed delay between attempts,
rather than giving up on the first failure.

client.Dial makes an eager GetSystemInfo RPC to verify the server is
reachable, so a container whose network is still settling — even after its
dependency's own healthcheck has passed — can miss that RPC's deadline on the
very first try. Without this, that single flaky attempt kills the whole
process, and a restart-policy container starts an identical race over from
zero rather than retrying inside a process that is already up.

dial is a parameter rather than a call to client.Dial directly so this can be
tested without a real Temporal server.
*/
func DialWithRetry(
	ctx context.Context,
	dial func() (client.Client, error),
	log *slog.Logger,
	attempts int,
	delay time.Duration,
) (client.Client, error) {
	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		c, err := dial()
		if err == nil {
			return c, nil
		}
		lastErr = err

		if attempt == attempts {
			break
		}
		log.Warn("temporal dial failed, retrying",
			"attempt", attempt, "of", attempts, "error", err)
		select {
		case <-time.After(delay):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return nil, lastErr
}
