package main

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/Zhyizhouu/af/backend/internal/convert"
)

const (
	sweepEvery     = time.Hour
	scratchMaxAge  = 2 * time.Hour
	scratchPattern = "af-audio-*"
)

var blobPrefixes = []string{"sources/", "results/"}

func sweepLoop(
	ctx context.Context,
	log *slog.Logger,
	blobs convert.Blobs,
	budget time.Duration,
	tempDir string,
) {
	if removed := sweepScratch(tempDir, scratchMaxAge, time.Now()); removed > 0 {
		log.Info("stale scratch directories removed", "count", removed)
	}

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

func sweepScratch(root string, maxAge time.Duration, now time.Time) int {
	if root == "" {
		root = os.TempDir()
	}
	matches, err := filepath.Glob(filepath.Join(root, scratchPattern))
	if err != nil {
		return 0
	}
	removed := 0
	for _, path := range matches {
		info, err := os.Stat(path)
		if err != nil || !info.IsDir() || now.Sub(info.ModTime()) < maxAge {
			continue
		}
		if os.RemoveAll(path) == nil {
			removed++
		}
	}
	return removed
}
