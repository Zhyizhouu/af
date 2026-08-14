package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Zhyizhouu/af/backend/internal/gemini"
	"github.com/Zhyizhouu/af/backend/internal/plan"
)

// The whole feature is one synchronous call.
//
// No Temporal, no queue, no job id: this is a sub-second request that writes
// nothing and holds nothing. Reaching for the machinery next door because it
// is there would buy a worse version of a plain HTTP handler.
func (s *Server) handlePlan(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.caller(w, r)
	if !ok {
		return
	}
	if s.planner == nil {
		writeError(w, http.StatusServiceUnavailable,
			"The assistant is not configured on this server.")
		return
	}

	var request plan.Request
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).
		Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "That request did not parse.")
		return
	}
	if err := request.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, capitalise(err.Error())+".")
		return
	}

	now, err := plan.ParseLocal(request.Now)
	if err != nil {
		writeError(w, http.StatusBadRequest, "That request did not parse.")
		return
	}

	// Bounded independently of the client: a browser that hangs up should not
	// leave a model call running, and one that asks for something enormous
	// should not hold a connection open indefinitely.
	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()

	var proposed plan.Plan
	if err := s.planner.GenerateJSON(
		ctx,
		plan.Instructions(now, request.Categories),
		request.Prompt,
		plan.Schema,
		&proposed,
	); err != nil {
		if errors.Is(err, gemini.ErrQuota) {
			writeError(w, http.StatusTooManyRequests,
				"The assistant has hit its quota for now. Try again shortly.")
			return
		}
		// Already retried a few times inside the client; saying whose problem
		// it is stops somebody going through their own configuration looking
		// for a fault that is not there.
		if errors.Is(err, gemini.ErrBusy) {
			writeError(w, http.StatusServiceUnavailable,
				"The model is busy right now. Try again in a moment.")
			return
		}
		s.log.Error("plan failed", "uid", uid, "error", err)
		writeError(w, http.StatusBadGateway,
			"The assistant could not answer. Try again.")
		return
	}

	// The schema guarantees the shape and nothing else. Everything that makes
	// a proposal sensible — a real category, an end after its start, a year
	// somebody meant — is checked here.
	cleaned := plan.Normalise(proposed, request.Categories, now)

	writeJSON(w, http.StatusOK, map[string]any{
		"sessions": cleaned.Sessions,
		"events":   cleaned.Events,
		"note":     cleaned.Note,
	})
}

func (s *Server) handlePlanLimits(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"configured":   s.planner != nil,
		"sessionTypes": plan.SessionTypes,
		"maxProposals": plan.MaxProposals,
	})
}

// capitalise turns a validation message into a sentence. The messages are
// written lowercase so they read correctly when wrapped in a larger one.
func capitalise(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
