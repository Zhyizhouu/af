package vercelfn

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func testGateway(t *testing.T) http.Handler {
	t.Helper()
	t.Setenv("AF_GEMINI_API_KEY", "")
	t.Setenv("AF_FIREBASE_PROJECT_ID", "af-main")
	t.Setenv("AF_AUTH_DISABLED", "")
	handler, err := newGateway()
	if err != nil {
		t.Fatalf("newGateway: %v", err)
	}
	return handler
}

func serve(handler http.Handler, target string) int {
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, restorePath(httptest.NewRequest(http.MethodGet, target, nil)))
	return recorder.Code
}

func TestHealthz(t *testing.T) {
	if got := serve(testGateway(t), "/healthz"); got != http.StatusOK {
		t.Fatalf("status = %d, want 200", got)
	}
}

// Vercel hands the function /api/gateway?path=<rest>; both assistant routes
// must reach their /v1 handlers, which answer 401 without a token.
func TestRewrittenPathIsRouted(t *testing.T) {
	handler := testGateway(t)
	for _, target := range []string{"/api/gateway?path=me", "/api/gateway?path=ai/limits", "/api/gateway?path=/me"} {
		if got := serve(handler, target); got != http.StatusUnauthorized {
			t.Fatalf("%s: status = %d, want 401", target, got)
		}
	}
}

// A request already under /v1 is served as it is, so a stray path parameter
// does not redirect it: an unknown route stays 404 rather than becoming /v1/me.
func TestDirectPathIsNotRewritten(t *testing.T) {
	handler := testGateway(t)
	if got := serve(handler, "/v1/me"); got != http.StatusUnauthorized {
		t.Fatalf("/v1/me: status = %d, want 401", got)
	}
	if got := serve(handler, "/v1/nope?path=me"); got != http.StatusNotFound {
		t.Fatalf("/v1/nope?path=me: status = %d, want 404", got)
	}
}

func TestRestorePathKeepsOtherQuery(t *testing.T) {
	got := restorePath(httptest.NewRequest(http.MethodGet, "/api/gateway?path=jobs/abc&x=1", nil))
	if got.URL.Path != "/v1/jobs/abc" || got.URL.RawQuery != "x=1" {
		t.Fatalf("path = %q, query = %q", got.URL.Path, got.URL.RawQuery)
	}
}

func TestPlanTimeoutDefaultsBelowMaxDuration(t *testing.T) {
	t.Setenv("AF_PLAN_TIMEOUT", "")
	cfg, err := loadConfig()
	if err != nil {
		t.Fatalf("loadConfig: %v", err)
	}
	if cfg.PlanTimeout != 55*time.Second {
		t.Fatalf("PlanTimeout = %v, want 55s", cfg.PlanTimeout)
	}
	if !cfg.ConverterDisabled {
		t.Fatal("converter should be disabled")
	}
}

func TestPlanTimeoutEnvOverrides(t *testing.T) {
	t.Setenv("AF_PLAN_TIMEOUT", "30s")
	cfg, err := loadConfig()
	if err != nil {
		t.Fatalf("loadConfig: %v", err)
	}
	if cfg.PlanTimeout != 30*time.Second {
		t.Fatalf("PlanTimeout = %v, want 30s", cfg.PlanTimeout)
	}
}
