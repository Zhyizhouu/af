package httpapi

import (
	"context"
	"errors"
	"sync"
	"time"

	"go.temporal.io/api/serviceerror"

	"github.com/Zhyizhouu/af/backend/internal/convert"
)

const rateWindow = 10 * time.Minute

type tokenBucket struct {
	tokens float64
	last   time.Time
}

type rateLimiter struct {
	mu       sync.Mutex
	capacity float64
	buckets  map[string]*tokenBucket
	now      func() time.Time
}

func newRateLimiter(perWindow int) *rateLimiter {
	return &rateLimiter{
		capacity: float64(perWindow),
		buckets:  make(map[string]*tokenBucket),
		now:      time.Now,
	}
}

func (l *rateLimiter) allow(uid string) bool {
	if l.capacity <= 0 {
		return true
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	if len(l.buckets) > 1024 {
		for id, b := range l.buckets {
			if now.Sub(b.last) >= rateWindow {
				delete(l.buckets, id)
			}
		}
	}

	b, ok := l.buckets[uid]
	if !ok {
		b = &tokenBucket{tokens: l.capacity, last: now}
		l.buckets[uid] = b
	}
	b.tokens = min(l.capacity, b.tokens+now.Sub(b.last).Seconds()*l.capacity/rateWindow.Seconds())
	b.last = now

	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

type openJobs struct {
	mu    sync.Mutex
	byUID map[string]map[string]struct{}
}

func newOpenJobs() *openJobs {
	return &openJobs{byUID: make(map[string]map[string]struct{})}
}

func (o *openJobs) ids(uid string) []string {
	o.mu.Lock()
	defer o.mu.Unlock()
	out := make([]string, 0, len(o.byUID[uid]))
	for id := range o.byUID[uid] {
		out = append(out, id)
	}
	return out
}

func (o *openJobs) release(uid, id string) {
	o.mu.Lock()
	defer o.mu.Unlock()
	delete(o.byUID[uid], id)
	if len(o.byUID[uid]) == 0 {
		delete(o.byUID, uid)
	}
}

func (o *openJobs) reserve(
	ctx context.Context,
	uid, id string,
	limit int,
	stillOpen func(context.Context, string) bool,
) bool {
	if limit <= 0 {
		return true
	}

	if known := o.ids(uid); len(known) >= limit {
		for _, other := range known {
			if !stillOpen(ctx, other) {
				o.release(uid, other)
			}
		}
	}

	o.mu.Lock()
	defer o.mu.Unlock()
	if len(o.byUID[uid]) >= limit {
		return false
	}
	if o.byUID[uid] == nil {
		o.byUID[uid] = make(map[string]struct{})
	}
	o.byUID[uid][id] = struct{}{}
	return true
}

func isOpen(stage convert.Stage) bool {
	return stage == convert.StageQueued || stage == convert.StageTranscoding
}

func (s *Server) jobStillOpen(ctx context.Context, id string) bool {
	response, err := s.temporal.QueryWorkflow(ctx, workflowID(id), "", convert.StatusQuery)
	if err != nil {
		var notFound *serviceerror.NotFound
		return !errors.As(err, &notFound)
	}
	var status convert.Status
	if err := response.Get(&status); err != nil {
		return true
	}
	return isOpen(status.Stage)
}
