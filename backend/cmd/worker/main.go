// Command worker runs conversions.
//
// It polls the task queue and executes whatever Temporal hands it. Scaling is
// literally `--scale worker=N`: every replica polls the same queue, Temporal
// hands each task to exactly one of them, and a replica dying mid-file means
// the activity's heartbeat lapses and another picks the job up.
package main

import (
	"context"
	"log/slog"
	"os"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"

	"github.com/Zhyizhouu/af/backend/internal/config"
	"github.com/Zhyizhouu/af/backend/internal/convert"
	"github.com/Zhyizhouu/af/backend/internal/media"
	"github.com/Zhyizhouu/af/backend/internal/storage"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	if err := run(log); err != nil {
		log.Error("worker stopped", "error", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx := context.Background()

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

	temporalClient, err := client.Dial(client.Options{
		HostPort:  cfg.TemporalHostPort,
		Namespace: cfg.TemporalNamespace,
		Logger:    log,
	})
	if err != nil {
		return err
	}
	defer temporalClient.Close()

	w := worker.New(temporalClient, cfg.TaskQueue, worker.Options{
		// ffmpeg saturates the cores it is given, so letting one replica take
		// a dozen files at once makes every one of them slower. Concurrency
		// belongs in the replica count, not here.
		MaxConcurrentActivityExecutionSize: cfg.WorkerMaxConcurrent,
	})

	w.RegisterWorkflow(convert.ToMP3)
	w.RegisterActivity(&convert.Activities{
		Blobs:      blobs,
		Transcoder: media.New(os.Getenv("AF_FFMPEG_PATH"), os.Getenv("AF_FFPROBE_PATH")),
		TempDir:    os.Getenv("AF_TEMP_DIR"),
	})

	log.Info("worker polling",
		"queue", cfg.TaskQueue,
		"temporal", cfg.TemporalHostPort,
		"concurrency", cfg.WorkerMaxConcurrent,
	)
	return w.Run(worker.InterruptCh())
}
