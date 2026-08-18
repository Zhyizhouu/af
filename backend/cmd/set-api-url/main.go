// Command set-api-url points the deployed app at a gateway, without a rebuild.
//
// `AF_CONVERT_API` is compiled into the bundle, which is right for a fixed host
// and useless for a tunnel: the hostname changes every time the tunnel
// restarts, and changing the compiled value costs a fresh Vercel build plus a
// window where the deployed site is broken. The app reads `config/runtime`
// instead, so moving the API is a document write that the next page load picks
// up.
//
//	go run ./cmd/set-api-url -url https://example.trycloudflare.com -credentials sa.json
//	go run ./cmd/set-api-url -check
//
// `firestore.rules` makes `config/{document}` world-readable and refuses every
// client write, so only something holding a service account can move the
// address. The URL itself is not a secret — every route behind it verifies a
// Firebase ID token — but who may change it very much is.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	firebase "firebase.google.com/go/v4"
	"google.golang.org/api/option"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// The document the app reads at startup. One place, named for what it is
// rather than for the tunnel that currently happens to serve it.
const (
	configCollection = "config"
	runtimeDocument  = "runtime"
	urlField         = "convertApi"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run() error {
	var (
		raw       = flag.String("url", "", "gateway base URL, e.g. https://x.trycloudflare.com")
		projectID = flag.String("project", "af-main", "Firebase project id")
		creds     = flag.String("credentials", os.Getenv("GOOGLE_APPLICATION_CREDENTIALS"),
			"service account JSON (or set GOOGLE_APPLICATION_CREDENTIALS)")
		check = flag.Bool("check", false, "print the current value and change nothing")
		clear = flag.Bool("clear", false, "remove the override, falling back to the built-in value")
	)
	flag.Parse()

	if !*check && !*clear && *raw == "" {
		flag.Usage()
		return errors.New("-url is required unless -check or -clear")
	}

	// Validated before anything is written. A malformed address here breaks the
	// deployed site for everyone until somebody notices, and the failure looks
	// like the tunnel being down rather than like a typo.
	var cleaned string
	if *raw != "" {
		parsed, err := url.Parse(strings.TrimSpace(*raw))
		if err != nil {
			return fmt.Errorf("parsing -url: %w", err)
		}
		if parsed.Scheme != "https" && parsed.Host != "127.0.0.1" && parsed.Hostname() != "localhost" {
			return fmt.Errorf("refusing %q: the app is served over https, so anything "+
				"but an https gateway is blocked as mixed content", *raw)
		}
		if parsed.Host == "" {
			return fmt.Errorf("refusing %q: no host in it", *raw)
		}
		cleaned = strings.TrimRight(parsed.String(), "/")
	}

	if *creds == "" {
		return errors.New("a service account is required: pass -credentials or set " +
			"GOOGLE_APPLICATION_CREDENTIALS. Reading this document needs nothing; " +
			"writing it is refused to every client by firestore.rules")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	app, err := firebase.NewApp(ctx,
		&firebase.Config{ProjectID: *projectID},
		option.WithCredentialsFile(*creds))
	if err != nil {
		return fmt.Errorf("firebase: %w", err)
	}
	client, err := app.Firestore(ctx)
	if err != nil {
		return fmt.Errorf("firestore: %w", err)
	}
	defer client.Close()

	ref := client.Collection(configCollection).Doc(runtimeDocument)

	if *check {
		snapshot, err := ref.Get(ctx)
		// A document that has never been written is not an error worth
		// printing as one: the Firestore client reports a missing document as
		// NotFound rather than as an empty snapshot, and "not set yet" is the
		// ordinary state before the first publish.
		if status.Code(err) == codes.NotFound {
			fmt.Println("no override set — the app uses whatever it was built with")
			return nil
		}
		if err != nil {
			return fmt.Errorf("reading %s/%s: %w", configCollection, runtimeDocument, err)
		}
		current, _ := snapshot.Data()[urlField].(string)
		if current == "" {
			fmt.Println("no override set — the app uses whatever it was built with")
			return nil
		}
		fmt.Println(current)
		return nil
	}

	if *clear {
		// Emptied rather than deleted: the app treats a blank field as "no
		// override" and falls back, and a document that exists is one less
		// not-found to reason about on the read side.
		if _, err := ref.Set(ctx, map[string]any{
			urlField:    "",
			"updatedAt": time.Now().UTC(),
		}); err != nil {
			return fmt.Errorf("clearing: %w", err)
		}
		fmt.Println("cleared — the app falls back to its built-in address")
		return nil
	}

	if _, err := ref.Set(ctx, map[string]any{
		urlField:    cleaned,
		"updatedAt": time.Now().UTC(),
	}); err != nil {
		return fmt.Errorf("writing %s/%s: %w", configCollection, runtimeDocument, err)
	}

	fmt.Printf("%s/%s -> %s\n", configCollection, runtimeDocument, cleaned)
	fmt.Println("live on the next page load. No rebuild, no redeploy.")
	return nil
}
