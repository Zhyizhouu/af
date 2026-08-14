package caption

import (
	"errors"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// ErrUnusableSource marks a failure repeating cannot fix — a file with no
// audio, or one ffmpeg will not open.
const ErrUnusableSource = "UnusableSource"

// Transcript is what the transcribe step produces and the editor loads.
type Transcript struct {
	Segments []Segment `json:"segments"`
	Seconds  float64   `json:"seconds"`
	Language string    `json:"language"`
}

// Muxed is what the final step leaves in the object store.
type Muxed struct {
	VideoKey     string `json:"videoKey"`
	VideoName    string `json:"videoName"`
	SubtitleKey  string `json:"subtitleKey"`
	SubtitleName string `json:"subtitleName"`
	SizeBytes    int64  `json:"sizeBytes"`
}

// Generate is the workflow.
//
// The shape worth noticing is the middle: after transcribing it stops and
// waits for a person. Temporal makes that a normal thing to write — the
// workflow blocks on a signal channel for as long as an hour, survives a
// worker restart while it waits, and needs no job table, no polling loop and
// no state machine of its own to remember where it got to.
func Generate(ctx workflow.Context, req Request) (Status, error) {
	status := Status{
		JobID:      req.JobID,
		OwnerUID:   req.OwnerUID,
		Stage:      StageQueued,
		SourceName: req.SourceName,
		Language:   req.Language,
	}
	var transcript Transcript

	if err := workflow.SetQueryHandler(ctx, StatusQuery, func() (Status, error) {
		return status, nil
	}); err != nil {
		return status, err
	}
	// Separate from the status query because it is large and rarely wanted:
	// the editor asks once, the poller asks every second.
	if err := workflow.SetQueryHandler(ctx, SegmentsQuery, func() (Transcript, error) {
		return transcript, nil
	}); err != nil {
		return status, err
	}

	if err := req.Validate(); err != nil {
		status.Stage = StageFailed
		status.Error = err.Error()
		discard(ctx, req.SourceKey)
		return status, temporal.NewNonRetryableApplicationError(
			err.Error(), ErrUnusableSource, err)
	}

	var a *Activities
	activityCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		// Transcription is a network call per ten-minute chunk of a file that
		// may be two hours long.
		StartToCloseTimeout: 2 * time.Hour,
		HeartbeatTimeout:    5 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			// Sized to ride out a per-minute API quota rather than just a
			// dropped connection. Three attempts at five seconds apart span
			// about twenty seconds and would fail a job that needs to wait
			// sixty for its quota window to roll over; these span roughly six
			// minutes, which clears a per-minute limit comfortably and still
			// gives up on a daily one instead of retrying it all afternoon.
			InitialInterval:        15 * time.Second,
			BackoffCoefficient:     2,
			MaximumInterval:        2 * time.Minute,
			MaximumAttempts:        6,
			NonRetryableErrorTypes: []string{ErrUnusableSource},
		},
	})

	status.Stage = StageTranscribing
	if err := workflow.ExecuteActivity(activityCtx, a.Transcribe, req).
		Get(activityCtx, &transcript); err != nil {
		status.Stage = StageFailed
		status.Error = describe(err)
		discard(ctx, req.SourceKey)
		return status, err
	}

	status.Seconds = transcript.Seconds
	status.Segments = len(transcript.Segments)
	if transcript.Language != "" {
		status.Language = transcript.Language
	}

	// ---- the pause ----

	status.Stage = StageReview
	status.ReviewDeadline = workflow.Now(ctx).Add(req.ReviewTTL)

	approved := waitForApproval(ctx, req.ReviewTTL, transcript.Segments)
	transcript.Segments = Normalise(approved.Segments, transcript.Seconds)
	status.Segments = len(transcript.Segments)

	if len(transcript.Segments) == 0 {
		status.Stage = StageFailed
		status.Error = "There is nothing to caption — no speech was found."
		discard(ctx, req.SourceKey)
		return status, temporal.NewNonRetryableApplicationError(
			status.Error, ErrUnusableSource, errors.New("empty transcript"))
	}

	// ---- back to work ----

	status.Stage = StageMuxing
	var muxed Muxed
	muxErr := workflow.ExecuteActivity(activityCtx, a.Mux, MuxInput{
		Request:  req,
		Segments: transcript.Segments,
		Language: status.Language,
	}).Get(activityCtx, &muxed)

	// The upload has served its purpose either way — the captioned copy is
	// what anybody wanted, and it is a whole second video's worth of bytes.
	discard(ctx, req.SourceKey)

	if muxErr != nil {
		status.Stage = StageFailed
		status.Error = describe(muxErr)
		return status, muxErr
	}

	status.VideoKey = muxed.VideoKey
	status.VideoName = muxed.VideoName
	status.SubtitleKey = muxed.SubtitleKey
	status.SubtitleName = muxed.SubtitleName
	status.SizeBytes = muxed.SizeBytes
	status.Stage = StageReady

	if err := workflow.Sleep(ctx, req.ResultTTL); err != nil {
		discard(ctx, muxed.VideoKey)
		discard(ctx, muxed.SubtitleKey)
		status.Stage = StageExpired
		return status, err
	}

	discard(ctx, muxed.VideoKey)
	discard(ctx, muxed.SubtitleKey)
	status.Stage = StageExpired
	return status, nil
}

// waitForApproval blocks until the editor sends its segments or the review
// window closes.
//
// A lapsed window muxes the transcript unedited rather than throwing it away.
// Somebody who uploaded a lecture and then closed the tab is better served by
// an imperfect caption track than by nothing at all, and the untouched
// transcript is exactly what they would have got had they pressed the button
// without changing anything.
func waitForApproval(
	ctx workflow.Context,
	within time.Duration,
	fallback []Segment,
) Approval {
	var approval Approval
	settled := false

	channel := workflow.GetSignalChannel(ctx, ApproveSignal)
	timer := workflow.NewTimer(ctx, within)

	selector := workflow.NewSelector(ctx)
	selector.AddReceive(channel, func(c workflow.ReceiveChannel, _ bool) {
		c.Receive(ctx, &approval)
		settled = true
	})
	selector.AddFuture(timer, func(workflow.Future) {
		if settled {
			return
		}
		workflow.GetLogger(ctx).Info("review window lapsed; muxing as transcribed")
		approval = Approval{Segments: fallback, Automatic: true}
		settled = true
	})

	selector.Select(ctx)
	return approval
}

// discard removes one object, and keeps trying until it is gone. Same
// reasoning as the audio converter's: a disconnected context because
// cancellation is when cleanup matters most, and no attempt limit because a
// storage outage should postpone a deletion rather than cancel it.
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
	if err := workflow.ExecuteActivity(cleanup, a.DiscardObject, key).Get(cleanup, nil); err != nil {
		workflow.GetLogger(ctx).Error("object left behind", "key", key, "error", err)
	}
}

func describe(err error) string {
	var applicationErr *temporal.ApplicationError
	if errors.As(err, &applicationErr) {
		return applicationErr.Message()
	}
	if errors.Is(err, workflow.ErrCanceled) {
		return "Cancelled."
	}
	return "Captioning failed."
}
