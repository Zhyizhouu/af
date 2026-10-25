// Package vercelfn adapts the gateway to a Vercel serverless function.
//
// It serves the assistant only: the converter is forced off, so no Temporal
// client or object store is dialled and the function needs neither a workflow
// engine nor a disk. The gateway is built once per warm instance and reused
// for every request after that.
//
// It lives outside internal/ so that the repository-root module, which is the
// one Vercel builds, can import it; the packages it wires together stay
// internal to the backend module.
package vercelfn

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/Zhyizhouu/af/backend/internal/auth"
	"github.com/Zhyizhouu/af/backend/internal/config"
	"github.com/Zhyizhouu/af/backend/internal/httpapi"
)

// planTimeout is the assistant's time budget on Vercel, kept under the 60s
// maxDuration in vercel.json so a slow model call is answered with an error
// instead of the platform cutting the function off. AF_PLAN_TIMEOUT overrides it.
const planTimeout = 55 * time.Second

var (
	log     = slog.New(slog.NewJSONHandler(os.Stdout, nil))
	once    sync.Once
	gateway http.Handler
	failure error
)

// Handler serves one request. The first call builds the gateway; if that
// fails every request answers 500 rather than the process panicking, so the
// cause shows up in the function logs instead of as an opaque crash.
func Handler(w http.ResponseWriter, r *http.Request) {
	once.Do(func() {
		gateway, failure = newGateway()
		if failure != nil {
			log.Error("gateway failed to start", "error", failure)
		}
	})
	if failure != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":"gateway failed to start"}`))
		return
	}
	gateway.ServeHTTP(w, restorePath(r))
}

// loadConfig is the gateway's configuration for this host: the converter is
// off, and the assistant's timeout defaults to planTimeout.
func loadConfig() (config.Config, error) {
	cfg, err := config.Load()
	if err != nil {
		return cfg, err
	}
	cfg.ConverterDisabled = true
	if strings.TrimSpace(os.Getenv("AF_PLAN_TIMEOUT")) == "" {
		cfg.PlanTimeout = planTimeout
	}
	return cfg, nil
}

// newGateway wires the same pieces as cmd/api, minus the converter. Split from
// Handler so tests can build a fresh gateway without sharing the Once.
func newGateway() (http.Handler, error) {
	cfg, err := loadConfig()
	if err != nil {
		return nil, err
	}

	verifier, err := auth.FromConfig(context.Background(), cfg, log)
	if err != nil {
		return nil, err
	}

	planner, err := httpapi.PlannerFromConfig(cfg, log)
	if err != nil {
		return nil, err
	}

	return httpapi.New(cfg, nil, nil, verifier, planner, log).Handler(), nil
}

// restorePath undoes the rewrite in vercel.json. Vercel sends /v1/<rest> to
// the function as /api/gateway?path=<rest>, so the route the gateway knows
// about has to be rebuilt from the query. A request that already carries a
// gateway path is served as it is. The request is cloned before it is changed.
func restorePath(r *http.Request) *http.Request {
	if r.URL.Path == "/healthz" || strings.HasPrefix(r.URL.Path, "/v1/") {
		return r
	}
	query := r.URL.Query()
	rest, ok := query["path"]
	if !ok || len(rest) == 0 {
		return r
	}
	query.Del("path")

	clone := r.Clone(r.Context())
	clone.URL.Path = "/v1/" + strings.TrimLeft(rest[0], "/")
	clone.URL.RawPath = ""
	clone.URL.RawQuery = query.Encode()
	return clone
}
