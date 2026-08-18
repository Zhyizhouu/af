package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Zhyizhouu/af/backend/internal/auth"
	"github.com/Zhyizhouu/af/backend/internal/config"
)

// stubVerifier returns whatever the test wants, without Firebase.
type stubVerifier struct {
	caller auth.Caller
	err    error
}

func (s stubVerifier) Verify(context.Context, string) (auth.Caller, error) {
	return s.caller, s.err
}

func serverWith(v auth.Verifier) *Server {
	return New(
		config.Config{},
		nil, nil, v, nil,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
}

// The gate is the whole point of the feature, so it gets tested at the
// middleware rather than through a handler that might guard itself by accident.
func TestAdminCaller(t *testing.T) {
	t.Run("an admin passes and keeps its uid", func(t *testing.T) {
		s := serverWith(stubVerifier{caller: auth.Caller{UID: "u1", Admin: true}})
		rec := httptest.NewRecorder()

		uid, ok := s.adminCaller(rec, httptest.NewRequest("GET", "/x", nil))
		if !ok || uid != "u1" {
			t.Fatalf("got uid=%q ok=%v, want u1/true", uid, ok)
		}
	})

	// The interesting case: a real, signed-in, entirely legitimate user. The
	// token verifies; only the claim is missing. 403 not 401 — the credential
	// was fine, the authority was not.
	t.Run("a signed-in non-admin is refused with 403", func(t *testing.T) {
		s := serverWith(stubVerifier{caller: auth.Caller{UID: "u2", Admin: false}})
		rec := httptest.NewRecorder()

		if _, ok := s.adminCaller(rec, httptest.NewRequest("GET", "/x", nil)); ok {
			t.Fatal("a non-admin was allowed through")
		}
		if rec.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
		}
	})

	t.Run("a bad token is 401, not 403", func(t *testing.T) {
		s := serverWith(stubVerifier{err: auth.ErrUnauthorized})
		rec := httptest.NewRecorder()

		if _, ok := s.adminCaller(rec, httptest.NewRequest("GET", "/x", nil)); ok {
			t.Fatal("an unverified caller was allowed through")
		}
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
		}
	})

	// caller() must not have picked up the role check by sharing verify() with
	// adminCaller() — every existing per-account route depends on it not having.
	t.Run("caller still admits a non-admin", func(t *testing.T) {
		s := serverWith(stubVerifier{caller: auth.Caller{UID: "u3", Admin: false}})
		rec := httptest.NewRecorder()

		uid, ok := s.caller(rec, httptest.NewRequest("GET", "/x", nil))
		if !ok || uid != "u3" {
			t.Fatalf("got uid=%q ok=%v, want u3/true", uid, ok)
		}
	})
}

func TestHandleMe(t *testing.T) {
	for _, tc := range []struct {
		name  string
		admin bool
	}{
		{"admin", true},
		{"not admin", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := serverWith(stubVerifier{caller: auth.Caller{UID: "u", Admin: tc.admin}})
			rec := httptest.NewRecorder()

			s.handleMe(rec, httptest.NewRequest("GET", "/v1/me", nil))

			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d", rec.Code)
			}
			var got meResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			if got.Admin != tc.admin || got.UID != "u" {
				t.Fatalf("got %+v, want uid=u admin=%v", got, tc.admin)
			}
		})
	}
}
