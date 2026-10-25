package httpapi

import (
	"bytes"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/Zhyizhouu/af/backend/internal/config"
)

func TestPlannerFromConfig(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))

	planner, err := PlannerFromConfig(config.Config{}, log)
	if err != nil || planner != nil {
		t.Fatalf("without a key: planner = %v, err = %v, want nil, nil", planner, err)
	}

	planner, err = PlannerFromConfig(config.Config{GeminiAPIKey: "k"}, log)
	if err != nil || planner == nil {
		t.Fatalf("with a key: planner = %v, err = %v, want a planner", planner, err)
	}
}

func TestPlannerFromConfigLogsTheModel(t *testing.T) {
	var out bytes.Buffer
	log := slog.New(slog.NewTextHandler(&out, nil))

	if _, err := PlannerFromConfig(config.Config{GeminiAPIKey: "k", GeminiModel: "gemini-test"}, log); err != nil {
		t.Fatal(err)
	}
	if got := out.String(); !strings.Contains(got, "assistant ready") || !strings.Contains(got, "gemini-test") {
		t.Fatalf("log = %q, want it to say the assistant is ready with its model", got)
	}
}

func TestPlanTimeoutFallsBackWhenUnset(t *testing.T) {
	for _, tc := range []struct {
		name string
		set  time.Duration
		want time.Duration
	}{
		{"zero", 0, 90 * time.Second},
		{"negative", -time.Second, 90 * time.Second},
		{"configured", 30 * time.Second, 30 * time.Second},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := &Server{cfg: config.Config{PlanTimeout: tc.set}}
			if got := s.planTimeout(); got != tc.want {
				t.Fatalf("planTimeout = %v, want %v", got, tc.want)
			}
		})
	}
}
