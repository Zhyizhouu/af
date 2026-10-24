package httpapi

import (
	"context"
	"errors"
	"sync"
	"time"

	"go.temporal.io/api/serviceerror"

	"github.com/Zhyizhouu/af/backend/internal/convert"
)

const (
	rateWindow    = 10 * time.Minute
	sweepInterval = time.Minute
)

type tokenBucket struct {
	tokens float64
	last   time.Time
}

// rateLimiter keeps its buckets in this process's memory, so the limit is per
// instance: with N gateway instances behind a balancer the effective cap is N
// times the configured one.
type rateLimiter struct {
	mu        sync.Mutex
	capacity  float64
	buckets   map[string]*tokenBucket
	lastSweep time.Time
	now       func() time.Time
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
	if now.Sub(l.lastSweep) >= sweepInterval {
		l.lastSweep = now
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

// openJobs tracks each account's open jobs in this process's memory, so the cap
// is per instance: with N gateway instances the effective cap is N times the
// configured one. An id older than budget is dropped by the periodic sweep, as
// no job can still be running past its execution budget.
type openJobs struct {
	mu        sync.Mutex
	byUID     map[string]map[string]time.Time
	budget    time.Duration
	lastSweep time.Time
	now       func() time.Time
}

func newOpenJobs(budget time.Duration) *openJobs {
	return &openJobs{
		byUID:  make(map[string]map[string]time.Time),
		budget: budget,
		now:    time.Now,
	}
}

func (o *openJobs) sweep(now time.Time) {
	if now.Sub(o.lastSweep) < sweepInterval {
		return
	}
	o.lastSweep = now
	for uid, set := range o.byUID {
		for id, started := range set {
			if now.Sub(started) >= o.budget {
				delete(set, id)
			}
		}
		if len(set) == 0 {
			delete(o.byUID, uid)
		}
	}
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
	now := o.now()
	o.sweep(now)
	if len(o.byUID[uid]) >= limit {
		return false
	}
	if o.byUID[uid] == nil {
		o.byUID[uid] = make(map[string]time.Time)
	}
	o.byUID[uid][id] = now
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
