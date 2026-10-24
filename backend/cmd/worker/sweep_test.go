package main

import (
	"context"
	"io"
	"log/slog"
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
