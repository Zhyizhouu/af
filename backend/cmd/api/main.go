// Command api is the HTTP gateway the browser talks to.
//
// It accepts an upload, puts it in the object store, starts a workflow and
// then answers questions about it. It holds no state, so it can be restarted
// or scaled out mid-conversion without a job noticing.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.temporal.io/sdk/client"

	"github.com/Zhyizhouu/af/backend/internal/auth"
	"github.com/Zhyizhouu/af/backend/internal/config"
	"github.com/Zhyizhouu/af/backend/internal/httpapi"
	"github.com/Zhyizhouu/af/backend/internal/storage"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	if err := run(log); err != nil {
		log.Error("api stopped", "error", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	blobs, err := storage.NewSeaweed(ctx, storage.Options{
		Endpoint:  cfg.S3Endpoint,
		Region:    cfg.S3Region,
		AccessKey: cfg.S3AccessKey,
		SecretKey: cfg.S3SecretKey,
		Bucket:    cfg.S3Bucket,
	})
	if err != nil {
		return err
	}

	verifier, err := verifier(ctx, cfg, log)
	if err != nil {
		return err
	}

	temporalClient, err := client.Dial(client.Options{
		HostPort:  cfg.TemporalHostPort,
		Namespace: cfg.TemporalNamespace,
		Logger:    log,
	})
	if err != nil {
		return err
	}
	defer temporalClient.Close()

	server := &http.Server{
		Addr:    cfg.HTTPAddr,
		Handler: httpapi.New(cfg, temporalClient, blobs, verifier, log).Handler(),
		// Generous: the write timeout has to cover streaming a finished MP3 to
		// a phone on a bad connection, and the read timeout an upload of up to
		// AF_MAX_UPLOAD_BYTES.
		ReadHeaderTimeout: 20 * time.Second,
		ReadTimeout:       30 * time.Minute,
		WriteTimeout:      30 * time.Minute,
		IdleTimeout:       2 * time.Minute,
	}

	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()

	log.Info("api listening", "addr", cfg.HTTPAddr, "temporal", cfg.TemporalHostPort)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func verifier(ctx context.Context, cfg config.Config, log *slog.Logger) (auth.Verifier, error) {
	if cfg.AuthDisabled {
		log.Warn("AF_AUTH_DISABLED is set: every request is accepted as one shared user. " +
			"On a reachable host this lets anyone spend your CPU and disk.")
		return auth.Open{}, nil
	}
	return auth.NewFirebase(ctx, cfg.FirebaseProjectID, cfg.FirebaseCredsFile)
}
