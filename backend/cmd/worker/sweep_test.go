package main

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/Zhyizhouu/af/backend/internal/convert"
)

type fakeBlobs struct {
	objects map[string][]convert.Object
	deleted []string
}

func (f *fakeBlobs) List(_ context.Context, prefix string) ([]convert.Object, error) {
	return f.objects[prefix], nil
}

func (f *fakeBlobs) Delete(_ context.Context, key string) error {
	f.deleted = append(f.deleted, key)
	return nil
}

func (f *fakeBlobs) Put(context.Context, string, io.Reader, string) error { return nil }

func (f *fakeBlobs) Get(context.Context, string) (io.ReadCloser, error) { return nil, nil }

func (f *fakeBlobs) Size(context.Context, string) (int64, error) { return 0, nil }

func TestSweepBlobsRemovesOnlyObjectsPastTheBudget(t *testing.T) {
	now := time.Unix(1_000_000, 0)
	budget := 5 * time.Hour
	blobs := &fakeBlobs{objects: map[string][]convert.Object{
		"sources/": {
			{Key: "sources/old/a.wav", Modified: now.Add(-6 * time.Hour)},
			{Key: "sources/new/b.wav", Modified: now.Add(-time.Hour)},
		},
		"results/": {
			{Key: "results/old/a.mp3", Modified: now.Add(-budget - time.Minute)},
			{Key: "results/edge/b.mp3", Modified: now.Add(-budget)},
		},
	}}

	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	removed := sweepBlobs(context.Background(), log, blobs, budget, now)

	want := []string{"sources/old/a.wav", "results/old/a.mp3"}
	if removed != 2 || !slices.Equal(blobs.deleted, want) {
		t.Fatalf("removed %d %v, want %v", removed, blobs.deleted, want)
	}
}

func TestSweepScratchRemovesOldDirectoriesOnly(t *testing.T) {
	root := t.TempDir()
	now := time.Now()
	old := filepath.Join(root, "af-audio-old")
	fresh := filepath.Join(root, "af-audio-fresh")
	other := filepath.Join(root, "unrelated")
	for _, dir := range []string{old, fresh, other} {
		if err := os.Mkdir(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	for _, dir := range []string{old, other} {
		if err := os.Chtimes(dir, now.Add(-3*time.Hour), now.Add(-3*time.Hour)); err != nil {
			t.Fatal(err)
		}
	}

	if removed := sweepScratch(root, scratchMaxAge, now); removed != 1 {
		t.Fatalf("removed = %d, want 1", removed)
	}
	for dir, wantGone := range map[string]bool{old: true, fresh: false, other: false} {
		_, err := os.Stat(dir)
		if gone := os.IsNotExist(err); gone != wantGone {
			t.Errorf("%s gone = %v, want %v", dir, gone, wantGone)
		}
	}
}
