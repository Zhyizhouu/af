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

// ToMP3 is the workflow. Four steps, each durable: convert, drop the source,
// wait out the result's lifetime, drop the result.
//
// The wait is a real Temporal timer rather than a cleanup cron. That keeps the
// deletion exactly as reliable as the conversion was, and it means a job stays
// queryable for precisely as long as it stays downloadable — one object's
// lifetime, one workflow, no reconciliation between them.
func ToMP3(ctx workflow.Context, req Request) (Status, error) {
	status := Status{
		JobID:      req.JobID,
		OwnerUID:   req.OwnerUID,
		Stage:      StageQueued,
		SourceName: req.SourceName,
		Bitrate:    req.Bitrate,
	}

	// Registered before anything can fail, so a job that dies immediately is
	// still describable rather than answering "workflow not found".
	if err := workflow.SetQueryHandler(ctx, StatusQuery, func() (Status, error) {
		return status, nil
	}); err != nil {
		return status, err
	}

	if err := req.Validate(); err != nil {
		status.Stage = StageFailed
		status.Error = err.Error()
		return status, temporal.NewNonRetryableApplicationError(
			err.Error(), ErrUnsupportedMedia, err)
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
	ctx = workflow.WithActivityOptions(ctx, options)

	var a *Activities

	status.Stage = StageTranscoding
	var result Result
	if err := workflow.ExecuteActivity(ctx, a.Convert, req).Get(ctx, &result); err != nil {
		status.Stage = StageFailed
		status.Error = describe(err)
		// The source is the only thing on disk if the encode never finished.
		discard(ctx, options, req.SourceKey)
		return status, err
	}

	status.ResultKey = result.Key
	status.ResultName = result.Name
	status.SizeBytes = result.SizeBytes
	status.Seconds = result.Seconds
	status.Stage = StageReady

	// Dead weight the moment the MP3 exists. Not fatal if it lingers — the
	// result is what the caller is waiting on, so a failed cleanup is logged
	// rather than allowed to fail the job.
	if err := workflow.ExecuteActivity(ctx, a.Discard, req.SourceKey).Get(ctx, nil); err != nil {
		workflow.GetLogger(ctx).Warn("source not removed", "key", req.SourceKey, "error", err)
	}

	if err := workflow.Sleep(ctx, req.ResultTTL); err != nil {
		// Cancelled. The result still has to go, and a cancelled context will
		// refuse to schedule anything — hence the disconnected one.
		cleanup, cancel := workflow.NewDisconnectedContext(ctx)
		defer cancel()
		discard(cleanup, options, result.Key)
		status.Stage = StageExpired
		return status, err
	}

	if err := workflow.ExecuteActivity(ctx, a.Discard, result.Key).Get(ctx, nil); err != nil {
		workflow.GetLogger(ctx).Warn("result not removed", "key", result.Key, "error", err)
	}
	status.Stage = StageExpired
	return status, nil
}

func discard(ctx workflow.Context, options workflow.ActivityOptions, key string) {
	if key == "" {
		return
	}
	var a *Activities
	ctx = workflow.WithActivityOptions(ctx, options)
	if err := workflow.ExecuteActivity(ctx, a.Discard, key).Get(ctx, nil); err != nil {
		workflow.GetLogger(ctx).Warn("object not removed", "key", key, "error", err)
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
	return "Conversion failed."
}
