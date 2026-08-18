// Package auth verifies the caller's Firebase ID token.
//
// The converter runs work and holds bytes on somebody's behalf, so it has to
// know whose. The web app already signs people in with Firebase, so the token
// it holds is the credential — no second account system, and no session for
// this service to store.
package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	firebase "firebase.google.com/go/v4"
	firebaseauth "firebase.google.com/go/v4/auth"
	"google.golang.org/api/option"
)

// ErrUnauthorized is returned for every rejection, whatever the cause. The
// caller learns that the token did not work and nothing more — the reason is
// only useful to somebody probing.
var ErrUnauthorized = errors.New("unauthorized")

// Caller is a verified identity: who is asking, and what they are allowed to
// reach beyond their own data.
//
// Admin comes from a Firebase custom claim rather than a document in
// Firestore. A claim is signed into the ID token, so checking it costs no read
// and — more to the point — a user cannot grant it to themselves by writing
// their own record. Only the Admin SDK, holding a service account, can set it.
type Caller struct {
	UID   string
	Admin bool
}

// Verifier turns a bearer token into a caller.
type Verifier interface {
	Verify(ctx context.Context, idToken string) (Caller, error)
}

type Firebase struct {
	client *firebaseauth.Client
}

// NewFirebase builds a verifier for projectID.
//
// credentialsFile is optional: verifying an ID token needs only the project id
// and Google's public signing keys, both of which are public. A service
// account is required for revocation checks and user management, and this
// service does neither — so the usual deployment mounts no secret at all.
func NewFirebase(ctx context.Context, projectID, credentialsFile string) (*Firebase, error) {
	if projectID == "" {
		return nil, errors.New("a Firebase project id is required to verify tokens")
	}

	options := []option.ClientOption{option.WithoutAuthentication()}
	if credentialsFile != "" {
		options = []option.ClientOption{option.WithCredentialsFile(credentialsFile)}
	}

	app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: projectID}, options...)
	if err != nil {
		return nil, fmt.Errorf("firebase: %w", err)
	}

	client, err := app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("firebase auth: %w", err)
	}
	return &Firebase{client: client}, nil
}

func (f *Firebase) Verify(ctx context.Context, idToken string) (Caller, error) {
	token, err := f.client.VerifyIDToken(ctx, idToken)
	if err != nil {
		return Caller{}, ErrUnauthorized
	}
	if token.UID == "" {
		return Caller{}, ErrUnauthorized
	}
	return Caller{UID: token.UID, Admin: adminClaim(token.Claims)}, nil
}

// adminClaim reads the `admin` custom claim, treating anything that is not a
// real boolean true as absent.
//
// Claims round-trip through JSON, so a claim set as the string "true" arrives
// as a string. Comparing loosely would let a mis-set claim grant access; the
// type assertion failing closed is the safe direction to be wrong in.
func adminClaim(claims map[string]any) bool {
	admin, _ := claims["admin"].(bool)
	return admin
}

// Open accepts everybody as one shared user.
//
// For running the stack before the Firebase console work is finished. It is
// wired only by AF_AUTH_DISABLED, and the API logs a warning at boot, because
// on a reachable host it means anyone can spend your CPU and disk.
type Open struct{}

const OpenUID = "local-dev"

// Verify grants admin along with everything else.
//
// This mode already means anyone reaching the host is trusted completely, so
// withholding the admin flag would protect nothing while making the local
// stack behave unlike the deployed one — the failure mode being a feature that
// cannot be exercised until it is in production.
func (Open) Verify(context.Context, string) (Caller, error) {
	return Caller{UID: OpenUID, Admin: true}, nil
}

// BearerToken pulls the credential out of a request.
func BearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if len(header) < 7 || !strings.EqualFold(header[:7], "bearer ") {
		return ""
	}
	return strings.TrimSpace(header[7:])
}
