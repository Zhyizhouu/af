package convert

import (
	"errors"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// ErrUnsupportedMedia marks a failure that repeating cannot fix. A file ffmpeg
// refuses to decode will still be refused on the third attempt, so it is worth
// separating from the transport failures that retries exist for.
const ErrUnsupportedMedia = "UnsupportedMedia"

// Result is what a finished conversion leaves in the object store.
type Result struct {
	Key       string  `json:"key"`
	Name      string  `json:"name"`
	SizeBytes int64   `json:"sizeBytes"`
	Seconds   float64 `json:"seconds"`
}

// Progress is what an in-flight conversion heartbeats.
//
// A workflow cannot see inside a running activity, so the percentage reaches
// the UI the other way round: the activity heartbeats it, and the gateway
// reads it off the pending activity when the browser asks for status.
type Progress struct {
	Step    string  `json:"step"`
	Percent float64 `json:"percent"`
}

const (
	StepFetching = "fetching"
	StepEncoding = "encoding"
	StepStoring  = "storing"
)

// Audio is the workflow: convert, drop the source, wait out the result's
// lifetime, drop the result.
//
// The wait is a real Temporal timer rather than a cleanup cron. That keeps the
// deletion exactly as reliable as the conversion was, and it means a job stays
// queryable for precisely as long as it stays downloadable — one object's
// lifetime, one workflow, no reconciliation between them.
func Audio(ctx workflow.Context, req Request) (Status, error) {
	status := Status{
		JobID:      req.JobID,
		OwnerUID:   req.OwnerUID,
		Stage:      StageQueued,
		SourceName: req.SourceName,
		Format:     req.Format,
		Bitrate:    req.Bitrate,
	}

	// Registered before anything can fail, so a job that dies immediately is
	// still describable rather than answering "workflow not found".
	if err := workflow.SetQueryHandler(ctx, StatusQuery, func() (Status, error) {
		return status, nil
	}); err != nil {
		return status, err
	}

	options := workflow.ActivityOptions{
		// Sized for the file, not for the request: a long recording at 320k is
		// minutes of encoding, and the browser is polling rather than waiting.
		StartToCloseTimeout: time.Hour,
		// Well under the encode's heartbeat cadence, so a worker that dies
		// mid-file is noticed in a couple of minutes rather than an hour.
		HeartbeatTimeout: 2 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:        2 * time.Second,
			MaximumInterval:        30 * time.Second,
			MaximumAttempts:        3,
			NonRetryableErrorTypes: []string{ErrUnsupportedMedia},
		},
	}

	if err := req.Validate(); err != nil {
		status.Stage = StageFailed
		status.Error = err.Error()
		// Nothing else will ever collect the upload if the job stops here.
		discard(ctx, req.SourceKey)
		return status, temporal.NewNonRetryableApplicationError(
			err.Error(), ErrUnsupportedMedia, err)
	}

	var a *Activities
	activityCtx := workflow.WithActivityOptions(ctx, options)

	status.Stage = StageTranscoding
	var result Result
	convertErr := workflow.ExecuteActivity(activityCtx, a.Convert, req).Get(activityCtx, &result)

	// The source is finished with either way, and it is the larger of the two
	// files. Dropped here rather than at the end of the workflow so it does
	// not sit in the store for the whole of the result's lifetime.
	discard(ctx, req.SourceKey)

	if convertErr != nil {
		status.Stage = StageFailed
		status.Error = describe(convertErr)
		return status, convertErr
	}

	status.ResultKey = result.Key
	status.ResultName = result.Name
	status.SizeBytes = result.SizeBytes
	status.Seconds = result.Seconds
	status.Stage = StageReady

	if err := workflow.Sleep(ctx, req.ResultTTL); err != nil {
		// Cancelled part-way through the wait. The result still has to go.
		discard(ctx, result.Key)
		status.Stage = StageExpired
		return status, err
	}

	discard(ctx, result.Key)
	status.Stage = StageExpired
	return status, nil
}

// discard removes one object, and keeps trying until it is gone.
//
// Two things make this a guarantee rather than a best effort. It runs on a
// disconnected context, because cancellation is exactly the moment a
// half-finished source gets left behind and a cancelled context refuses to
// schedule anything. And it retries without an attempt limit, bounded only by
// the workflow's own execution timeout — a delete that failed because the
// object store was briefly down should be retried, not logged and forgotten.
//
// Deleting an object that is already gone counts as success, so a retry after
// a partial failure cannot fail on its own previous work.
func discard(ctx workflow.Context, key string) {
	if key == "" {
		return
	}

	cleanup, cancel := workflow.NewDisconnectedContext(ctx)
	defer cancel()

	cleanup = workflow.WithActivityOptions(cleanup, workflow.ActivityOptions{
		StartToCloseTimeout: time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval: time.Second,
			MaximumInterval: time.Minute,
			MaximumAttempts: 0,
		},
	})

	var a *Activities
	if err := workflow.ExecuteActivity(cleanup, a.Discard, key).Get(cleanup, nil); err != nil {
		// Only reachable once the workflow itself is out of time, which means
		// the object store has been unreachable for hours.
		workflow.GetLogger(ctx).Error("object left behind", "key", key, "error", err)
	}
}

// describe unwraps the message somebody should actually read.
//
// A raw activity error arrives wrapped in Temporal's own framing — attempt
// counts, retry state, activity ids — none of which means anything to a person
// waiting on a file.
func describe(err error) string {
	var applicationErr *temporal.ApplicationError
	if errors.As(err, &applicationErr) {
		return applicationErr.Message()
	}
	if errors.Is(err, workflow.ErrCanceled) {
		return "Cancelled."
	}
	return "Conversion failed."
}
