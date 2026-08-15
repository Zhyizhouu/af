// Package httpapi is the driving adapter: it turns browser requests into
// Temporal workflows and reads their state back out.
//
// It holds no job state of its own. Temporal is the database for anything
// in-flight and SeaweedFS is the database for bytes, which is what lets the
// gateway be restarted, scaled out or redeployed mid-conversion without a
// single job noticing.
package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"go.temporal.io/sdk/client"

	"github.com/Zhyizhouu/af/backend/internal/auth"
	"github.com/Zhyizhouu/af/backend/internal/config"
	"github.com/Zhyizhouu/af/backend/internal/convert"
	"github.com/Zhyizhouu/af/backend/internal/gemini"
)

// Planner is the model the assistant asks. An interface so the endpoint can be
// tested without a network, and nil when no API key is configured — which the
// page checks before offering to do anything.
type Planner interface {
	GenerateJSON(
		ctx context.Context,
		instructions string,
		turns []gemini.Turn,
		schema map[string]any,
		into any,
	) error
}

type Server struct {
	cfg      config.Config
	temporal client.Client
	blobs    convert.Blobs
	verifier auth.Verifier
	planner  Planner
	log      *slog.Logger
}

func New(
	cfg config.Config,
	temporalClient client.Client,
	blobs convert.Blobs,
	verifier auth.Verifier,
	planner Planner,
	log *slog.Logger,
) *Server {
	return &Server{
		cfg:      cfg,
		temporal: temporalClient,
		blobs:    blobs,
		verifier: verifier,
		planner:  planner,
		log:      log,
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /v1/limits", s.handleLimits)
	mux.HandleFunc("POST /v1/jobs", s.handleCreate)
	mux.HandleFunc("GET /v1/jobs/{id}", s.handleStatus)
	mux.HandleFunc("GET /v1/jobs/{id}/result", s.handleDownload)
	mux.HandleFunc("DELETE /v1/jobs/{id}", s.handleCancel)

	mux.HandleFunc("GET /v1/ai/limits", s.handlePlanLimits)
	mux.HandleFunc("POST /v1/ai/plan", s.handlePlan)

	return s.withCORS(s.withLogging(mux))
}

// ---- middleware ----

func (s *Server) withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(recorder, r)
		s.log.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", recorder.status,
			"ms", time.Since(started).Milliseconds(),
		)
	})
}

// withCORS answers the preflight and echoes back only origins on the list.
//
// The browser is the only client, and it is served from a different origin
// than this API in every deployment — Vercel for the app, a container host for
// this. Reflecting the origin rather than replying `*` is what allows the
// Authorization header to be sent at all.
func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && originAllowed(origin, s.cfg.AllowedOrigins) {
			header := w.Header()
			header.Set("Access-Control-Allow-Origin", origin)
			header.Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			header.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			header.Set("Access-Control-Max-Age", "600")
			// Without this a shared cache could serve one origin's response to
			// another origin's request.
			header.Add("Vary", "Origin")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// originAllowed matches an origin against patterns that may contain `*`, so
// one entry covers every Vercel preview deployment.
func originAllowed(origin string, patterns []string) bool {
	for _, pattern := range patterns {
		if pattern == "*" || pattern == origin {
			return true
		}
		if !strings.Contains(pattern, "*") {
			continue
		}

		prefix, suffix, _ := strings.Cut(pattern, "*")
		if len(origin) >= len(prefix)+len(suffix) &&
			strings.HasPrefix(origin, prefix) &&
			strings.HasSuffix(origin, suffix) {
			return true
		}
	}
	return false
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

// ---- helpers ----

// caller returns the authenticated user id, having already answered the
// request if there is not one.
func (s *Server) caller(w http.ResponseWriter, r *http.Request) (string, bool) {
	uid, err := s.verifier.Verify(r.Context(), auth.BearerToken(r))
	if err != nil {
		// Deliberately not naming the feature: this guards the converter and the
		// assistant alike, and the converter's wording appearing on the AI page
		// reads as the wrong page having answered.
		writeError(w, http.StatusUnauthorized, "Sign in first.")
		return "", false
	}
	return uid, true
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
