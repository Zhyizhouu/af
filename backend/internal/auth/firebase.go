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

// Verifier turns a bearer token into a user id.
type Verifier interface {
	Verify(ctx context.Context, idToken string) (string, error)
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

func (f *Firebase) Verify(ctx context.Context, idToken string) (string, error) {
	token, err := f.client.VerifyIDToken(ctx, idToken)
	if err != nil {
		return "", ErrUnauthorized
	}
	if token.UID == "" {
		return "", ErrUnauthorized
	}
	return token.UID, nil
}

// Open accepts everybody as one shared user.
//
// For running the stack before the Firebase console work is finished. It is
// wired only by AF_AUTH_DISABLED, and the API logs a warning at boot, because
// on a reachable host it means anyone can spend your CPU and disk.
type Open struct{}

const OpenUID = "local-dev"

func (Open) Verify(context.Context, string) (string, error) { return OpenUID, nil }

// BearerToken pulls the credential out of a request.
func BearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if len(header) < 7 || !strings.EqualFold(header[:7], "bearer ") {
		return ""
	}
	return strings.TrimSpace(header[7:])
}
