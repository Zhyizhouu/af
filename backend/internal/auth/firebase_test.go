package auth

import "testing"

// The claim arrives as decoded JSON, so its Go type depends on how it was set.
// Only a real boolean grants admin: a claim written as the string "true" is a
// mistake, and reading it as authority would turn that mistake into an
// escalation.
func TestAdminClaim(t *testing.T) {
	for _, tc := range []struct {
		name   string
		claims map[string]any
		want   bool
	}{
		{"boolean true grants", map[string]any{"admin": true}, true},
		{"boolean false denies", map[string]any{"admin": false}, false},
		{"absent denies", map[string]any{}, false},
		{"nil map denies", nil, false},
		{"string true denies", map[string]any{"admin": "true"}, false},
		{"number one denies", map[string]any{"admin": float64(1)}, false},
		{"wrong key denies", map[string]any{"isAdmin": true}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := adminClaim(tc.claims); got != tc.want {
				t.Fatalf("adminClaim(%v) = %v, want %v", tc.claims, got, tc.want)
			}
		})
	}
}

func TestOpenVerifierIsAdmin(t *testing.T) {
	caller, err := Open{}.Verify(t.Context(), "")
	if err != nil {
		t.Fatal(err)
	}
	if caller.UID != OpenUID || !caller.Admin {
		t.Fatalf("got %+v, want uid=%s admin=true", caller, OpenUID)
	}
}
