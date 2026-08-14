// Package config reads the process settings out of the environment.
//
// Every value has a default that works against the docker-compose stack, so a
// bare `docker compose up` needs no .env file. The defaults are development
// credentials and are safe only because nothing in the stack is exposed beyond
// localhost — see .env.example before putting this on a host.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	// HTTP gateway
	HTTPAddr       string
	AllowedOrigins []string
	MaxUploadBytes int64

	// Temporal
	TemporalHostPort  string
	TemporalNamespace string
	TaskQueue         string

	// SeaweedFS, spoken to through its S3 gateway
	S3Endpoint  string
	S3Region    string
	S3AccessKey string
	S3SecretKey string
	S3Bucket    string

	// Firebase, for verifying the caller's ID token
	FirebaseProjectID   string
	FirebaseCredsFile   string
	AuthDisabled        bool
	ResultTTL           time.Duration
	WorkerMaxConcurrent int
}

func Load() (Config, error) {
	c := Config{
		HTTPAddr:            env("AF_HTTP_ADDR", ":8080"),
		AllowedOrigins:      list("AF_ALLOWED_ORIGINS", "http://localhost:*,https://*.vercel.app"),
		TemporalHostPort:    env("AF_TEMPORAL_HOSTPORT", "temporal:7233"),
		TemporalNamespace:   env("AF_TEMPORAL_NAMESPACE", "default"),
		TaskQueue:           env("AF_TASK_QUEUE", "mp3-convert"),
		S3Endpoint:          env("AF_S3_ENDPOINT", "http://seaweedfs:8333"),
		S3Region:            env("AF_S3_REGION", "us-east-1"),
		S3AccessKey:         env("AF_S3_ACCESS_KEY", "af-local"),
		S3SecretKey:         env("AF_S3_SECRET_KEY", "af-local-secret"),
		S3Bucket:            env("AF_S3_BUCKET", "af-mp3"),
		FirebaseProjectID:   env("AF_FIREBASE_PROJECT_ID", "af-main"),
		FirebaseCredsFile:   env("AF_FIREBASE_CREDENTIALS_FILE", ""),
		AuthDisabled:        boolean("AF_AUTH_DISABLED", false),
		WorkerMaxConcurrent: number("AF_WORKER_MAX_CONCURRENT", 2),
	}

	var err error
	if c.MaxUploadBytes, err = bytesEnv("AF_MAX_UPLOAD_BYTES", 512<<20); err != nil {
		return c, err
	}
	if c.ResultTTL, err = duration("AF_RESULT_TTL", 2*time.Hour); err != nil {
		return c, err
	}
	return c, nil
}

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func list(key, fallback string) []string {
	raw := env(key, fallback)
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func boolean(key string, fallback bool) bool {
	v, err := strconv.ParseBool(env(key, strconv.FormatBool(fallback)))
	if err != nil {
		return fallback
	}
	return v
}

func number(key string, fallback int) int {
	v, err := strconv.Atoi(env(key, strconv.Itoa(fallback)))
	if err != nil || v <= 0 {
		return fallback
	}
	return v
}

func bytesEnv(key string, fallback int64) (int64, error) {
	raw := env(key, "")
	if raw == "" {
		return fallback, nil
	}
	v, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || v <= 0 {
		return 0, fmt.Errorf("%s must be a positive byte count, got %q", key, raw)
	}
	return v, nil
}

func duration(key string, fallback time.Duration) (time.Duration, error) {
	raw := env(key, "")
	if raw == "" {
		return fallback, nil
	}
	v, err := time.ParseDuration(raw)
	if err != nil || v <= 0 {
		return 0, fmt.Errorf("%s must be a positive duration, got %q", key, raw)
	}
	return v, nil
}
