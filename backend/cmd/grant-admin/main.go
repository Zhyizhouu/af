// Command grant-admin creates or promotes the account that may reach
// admin-only programs.
//
// Admin is a Firebase custom claim. Only the Admin SDK holding a service
// account can set one, which is the property that makes it a usable authority:
// there is no document a user could write to grant it to themselves.
//
// The password is read from AF_ADMIN_PASSWORD, never a flag and never a
// default. A credential passed as an argument lands in shell history and CI
// logs; one written into source outlives every rotation, because git keeps it.
//
//	set AF_ADMIN_PASSWORD=...
//	go run ./cmd/grant-admin -email admin@example.com -credentials sa.json
//
// Promoting an existing account needs no password at all — omit it.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"time"

	firebase "firebase.google.com/go/v4"
	firebaseauth "firebase.google.com/go/v4/auth"
	"google.golang.org/api/option"
)

const passwordEnv = "AF_ADMIN_PASSWORD"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run() error {
	var (
		email       = flag.String("email", "", "account to create or promote (required)")
		projectID   = flag.String("project", "af-main", "Firebase project id")
		credentials = flag.String("credentials", os.Getenv("GOOGLE_APPLICATION_CREDENTIALS"),
			"service account JSON (or set GOOGLE_APPLICATION_CREDENTIALS)")
		revoke = flag.Bool("revoke", false, "remove admin instead of granting it")
		check  = flag.Bool("check", false, "report the account's current claims and change nothing")
		setPwd = flag.Bool("set-password", false,
			"add or replace the password on an existing account, from "+passwordEnv)
	)
	flag.Parse()

	if *email == "" {
		flag.Usage()
		return errors.New("-email is required")
	}
	if *credentials == "" {
		return errors.New("a service account is required: pass -credentials or set " +
			"GOOGLE_APPLICATION_CREDENTIALS. Verifying tokens needs no secret, but " +
			"writing a claim does")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	app, err := firebase.NewApp(ctx,
		&firebase.Config{ProjectID: *projectID},
		option.WithCredentialsFile(*credentials))
	if err != nil {
		return fmt.Errorf("firebase: %w", err)
	}
	client, err := app.Auth(ctx)
	if err != nil {
		return fmt.Errorf("firebase auth: %w", err)
	}

	if *check {
		user, err := client.GetUserByEmail(ctx, *email)
		if err != nil {
			return fmt.Errorf("looking up %s: %w", *email, err)
		}
		admin, _ := user.CustomClaims["admin"].(bool)
		fmt.Printf("email    : %s\n", user.Email)
		fmt.Printf("uid      : %s\n", user.UID)
		fmt.Printf("created  : %s\n", time.UnixMilli(user.UserMetadata.CreationTimestamp).Format(time.RFC3339))
		fmt.Printf("claims   : %v\n", user.CustomClaims)
		fmt.Printf("admin    : %v\n", admin)
		fmt.Printf("providers: %d\n", len(user.ProviderUserInfo))
		for _, p := range user.ProviderUserInfo {
			fmt.Printf("  - %s\n", p.ProviderID)
		}
		return nil
	}

	user, err := resolve(ctx, client, *email)
	if err != nil {
		return err
	}

	// Behind its own flag rather than implied by the env var being set. An
	// account that signs in with Google has no password, so "grant admin" and
	// "give this account a password" are different intentions — and silently
	// resetting a credential because a variable happened to be exported is the
	// kind of surprise that costs somebody their sign-in.
	if *setPwd {
		password := os.Getenv(passwordEnv)
		switch {
		case password == "":
			return fmt.Errorf("-set-password needs %s", passwordEnv)
		case len(password) < 6:
			return fmt.Errorf("%s must be at least 6 characters", passwordEnv)
		}
		if _, err := client.UpdateUser(ctx, user.UID,
			(&firebaseauth.UserToUpdate{}).Password(password)); err != nil {
			return fmt.Errorf("setting password on %s: %w", user.Email, err)
		}
		fmt.Printf("password set on %s — email/password sign-in now works "+
			"alongside any existing provider\n", user.Email)
	}

	claims := map[string]any{"admin": true}
	if *revoke {
		// Written as an empty map rather than admin:false. A false claim still
		// occupies the token; removing it is the honest way to say "not an
		// admin", and it is what the verifier's absent case already expects.
		claims = map[string]any{}
	}
	if err := client.SetCustomUserClaims(ctx, user.UID, claims); err != nil {
		return fmt.Errorf("setting claim: %w", err)
	}

	verb := "granted to"
	if *revoke {
		verb = "revoked from"
	}
	fmt.Printf("admin %s %s (uid %s)\n", verb, user.Email, user.UID)
	fmt.Println("\nThe claim rides in the ID token, so it appears only after the")
	fmt.Println("token is refreshed. Sign out and back in, or wait for the hourly")
	fmt.Println("refresh — an already-signed-in session will not see it before that.")
	return nil
}

// resolve finds the account, creating it when a password is supplied.
//
// Creation is deliberately opt-in: a typo in -email should not silently make a
// second account and grant it admin.
func resolve(ctx context.Context, client *firebaseauth.Client, email string) (*firebaseauth.UserRecord, error) {
	user, err := client.GetUserByEmail(ctx, email)
	if err == nil {
		return user, nil
	}
	if !firebaseauth.IsUserNotFound(err) {
		return nil, fmt.Errorf("looking up %s: %w", email, err)
	}

	password := os.Getenv(passwordEnv)
	if password == "" {
		return nil, fmt.Errorf("no account for %s, and %s is unset. "+
			"Set it to create one, or check the address", email, passwordEnv)
	}
	if len(password) < 6 {
		return nil, fmt.Errorf("%s must be at least 6 characters", passwordEnv)
	}

	created, err := client.CreateUser(ctx, (&firebaseauth.UserToCreate{}).
		Email(email).
		Password(password).
		EmailVerified(true))
	if err != nil {
		return nil, fmt.Errorf("creating %s: %w", email, err)
	}
	fmt.Printf("created %s\n", email)
	return created, nil
}
