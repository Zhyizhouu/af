package main

import (
	"context"
	"log/slog"
	"time"

	"github.com/Zhyizhouu/af/backend/internal/convert"
)

const sweepEvery = time.Hour

var blobPrefixes = []string{"sources/", "results/"}

func sweepLoop(
	ctx context.Context,
	log *slog.Logger,
	blobs convert.Blobs,
	budget time.Duration,
) {
	ticker := time.NewTicker(sweepEvery)
	defer ticker.Stop()
	for {
		sweepBlobs(ctx, log, blobs, budget, time.Now())
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func sweepBlobs(
	ctx context.Context,
	log *slog.Logger,
	blobs convert.Blobs,
	budget time.Duration,
	now time.Time,
) int {
	cutoff := now.Add(-budget)
	removed := 0
	for _, prefix := range blobPrefixes {
		objects, err := blobs.List(ctx, prefix)
		if err != nil {
			log.Error("sweep list failed", "prefix", prefix, "error", err)
			continue
		}
		for _, object := range objects {
			if !object.Modified.Before(cutoff) {
				continue
			}
			if err := blobs.Delete(ctx, object.Key); err != nil {
				log.Warn("sweep delete failed", "key", object.Key, "error", err)
				continue
			}
			removed++
		}
	}
	if removed > 0 {
		log.Info("orphaned objects removed", "count", removed)
	}
	return removed
}
