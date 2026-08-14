// Package convert holds the audio conversion use case: the job vocabulary, the
// ports it needs from the outside world, the Temporal workflow that sequences
// it, and the activities that do the work.
//
// Nothing in this package knows about HTTP, SeaweedFS or ffmpeg specifically.
// The workflow talks to storage and to a transcoder through the interfaces in
// ports.go; the adapters that satisfy them live in internal/storage and
// internal/media, and cmd/worker wires the two together.
package convert

import (
	"fmt"
	"time"
)

// Stage is the coarse position of a job, and what the UI renders as a status
// line. Finer detail — which second of the file ffmpeg is on — arrives as
// activity heartbeats instead, because a workflow cannot see inside a running
// activity.
type Stage string

const (
	StageQueued      Stage = "queued"
	StageTranscoding Stage = "transcoding"
	StageReady       Stage = "ready"
	StageExpired     Stage = "expired"
	StageFailed      Stage = "failed"
)

// StatusQuery is the query name the gateway uses to read a running job.
const StatusQuery = "status"

// Bitrates the API will accept, in kbit/s, for the formats that have one.
// Anything else is rejected at the edge rather than handed to ffmpeg, so a
// malformed request cannot become a command-line argument.
var Bitrates = []int{128, 192, 256, 320}

const DefaultBitrate = 192

func ValidBitrate(kbps int) bool {
	for _, b := range Bitrates {
		if b == kbps {
			return true
		}
	}
	return false
}

// Request is what the gateway hands the workflow. The source is already in the
// object store by this point: the upload is a synchronous HTTP concern, and
// streaming a browser upload through a workflow would mean holding the request
// open for the whole conversion.
type Request struct {
	JobID      string `json:"jobId"`
	OwnerUID   string `json:"ownerUid"`
	SourceKey  string `json:"sourceKey"`
	SourceName string `json:"sourceName"`
	Format     string `json:"format"`
	Bitrate    int    `json:"bitrate"`

	// How long the finished file stays downloadable. Carried on the request
	// rather than read from config inside the workflow: workflow code has to
	// replay identically forever, and a config change under a running job
	// would rewrite history that has already happened.
	ResultTTL time.Duration `json:"resultTtl"`
}

func (r Request) Validate() error {
	if r.JobID == "" {
		return fmt.Errorf("job id is required")
	}
	if r.SourceKey == "" {
		return fmt.Errorf("source key is required")
	}

	format, err := FormatByID(r.Format)
	if err != nil {
		return err
	}
	// A bitrate on a lossless format is ignored rather than rejected — it is a
	// setting that does not apply, not a malformed request.
	if format.Lossy && !format.Accepts(r.Bitrate) {
		return fmt.Errorf("%s does not accept %d kbit/s; it takes one of %v",
			format.Label, r.Bitrate, format.BitratesFor())
	}
	return nil
}

// Status is the queryable state of a job.
//
// OwnerUID travels with it so the gateway can refuse to describe somebody
// else's job — workflow ids are guessable and the store is shared.
type Status struct {
	JobID      string  `json:"jobId"`
	OwnerUID   string  `json:"ownerUid"`
	Stage      Stage   `json:"stage"`
	SourceName string  `json:"sourceName"`
	ResultName string  `json:"resultName"`
	ResultKey  string  `json:"resultKey"`
	Format     string  `json:"format"`
	Bitrate    int     `json:"bitrate"`
	Seconds    float64 `json:"seconds"`
	SizeBytes  int64   `json:"sizeBytes"`
	Error      string  `json:"error,omitempty"`
}

// Media is what ffprobe found in the source.
type Media struct {
	Seconds  float64 `json:"seconds"`
	HasAudio bool    `json:"hasAudio"`
	Format   string  `json:"format"`
}

// Options are the knobs the transcoder exposes.
type Options struct {
	Format  Format `json:"format"`
	Bitrate int    `json:"bitrate"`
}

// SourceKey and ResultKey keep the object layout in one place, so the gateway
// and the activities cannot disagree about where a job's bytes live.
func SourceKey(jobID, fileName string) string {
	return fmt.Sprintf("sources/%s/%s", jobID, fileName)
}

func ResultKey(jobID, fileName string) string {
	return fmt.Sprintf("results/%s/%s", jobID, fileName)
}
