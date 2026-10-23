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
