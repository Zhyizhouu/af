package auth

import (
	"context"
	"io"
	"log/slog"
	"testing"

	"github.com/Zhyizhouu/af/backend/internal/config"
)

func TestFromConfigDisabledIsOpen(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	verifier, err := FromConfig(context.Background(), config.Config{AuthDisabled: true}, log)
	if err != nil {
		t.Fatalf("FromConfig: %v", err)
	}
	if _, ok := verifier.(Open); !ok {
		t.Fatalf("verifier = %T, want Open", verifier)
	}
}
