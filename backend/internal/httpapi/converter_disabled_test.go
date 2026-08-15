package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Zhyizhouu/af/backend/internal/auth"
	"github.com/Zhyizhouu/af/backend/internal/config"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// A gateway started with AF_CONVERTER_DISABLED has no Temporal client and no
// object store. Every converter route has to say so rather than dereference a
// nil interface and panic the process — the assistant is the reason this mode
// exists, and it is served by the same binary.
//
// auth.Open is the verifier AF_AUTH_DISABLED uses, which keeps these tests
// about the converter rather than about Firebase.
func gatewayWithoutConverter(t *testing.T) http.Handler {
	t.Helper()
	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("config.Load: %v", err)
	}
	// nil temporal and nil blobs: exactly what run() leaves them as when the
	// converter is switched off.
	return New(cfg, nil, nil, auth.Open{}, nil, discardLogger()).Handler()
}

func TestConverterRoutesReportUnavailable(t *testing.T) {
	handler := gatewayWithoutConverter(t)

	cases := []struct {
		name   string
		method string
		path   string
	}{
		{"create", http.MethodPost, "/v1/jobs?format=mp3&bitrate=192"},
		{"status", http.MethodGet, "/v1/jobs/abc"},
		{"download", http.MethodGet, "/v1/jobs/abc/result"},
		{"cancel", http.MethodDelete, "/v1/jobs/abc"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(tc.method, tc.path, nil))

			if recorder.Code != http.StatusServiceUnavailable {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusServiceUnavailable)
			}
			var body map[string]string
			if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
				t.Fatalf("decode: %v (body %q)", err, recorder.Body.String())
			}
			if body["error"] == "" {
				t.Fatalf("no error message in %q", recorder.Body.String())
			}
		})
	}
}

// The page reads this to decide whether to offer the button at all, so the flag
// has to be present and false rather than merely absent.
func TestLimitsReportsConverterUnconfigured(t *testing.T) {
	recorder := httptest.NewRecorder()
	gatewayWithoutConverter(t).ServeHTTP(
		recorder, httptest.NewRequest(http.MethodGet, "/v1/limits", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", recorder.Code)
	}
	var body struct {
		Configured *bool `json:"configured"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Configured == nil {
		t.Fatal("limits response has no `configured` field")
	}
	if *body.Configured {
		t.Fatal("configured = true with no temporal client and no blob store")
	}
}

// Health has to answer on a converter-less gateway too: it is what a container
// host polls to decide whether the deployment came up at all.
func TestHealthAnswersWithoutConverter(t *testing.T) {
	recorder := httptest.NewRecorder()
	gatewayWithoutConverter(t).ServeHTTP(
		recorder, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", recorder.Code)
	}
}
