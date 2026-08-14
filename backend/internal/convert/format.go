package convert

import "fmt"

// Format is one thing the converter can produce.
//
// The set is deliberately small and closed. Every field here ends up on an
// ffmpeg command line, so letting a request name its own codec would be
// letting a request name its own arguments.
type Format struct {
	ID    string `json:"id"`
	Label string `json:"label"`

	// Extension drives the muxer: ffmpeg picks the container from the output
	// path's suffix, so this is load-bearing rather than cosmetic.
	Extension string `json:"extension"`
	MIME      string `json:"mime"`

	// Codec is the `-c:a` value.
	Codec string `json:"-"`

	// Lossy formats take a bitrate; lossless ones ignore it, and the UI hides
	// the control rather than offering a setting that does nothing.
	Lossy bool `json:"lossy"`

	// Bitrates this codec will actually accept, or nil for the common set.
	//
	// Not every encoder spans the same range: libopus refuses anything above
	// 256k and fails the whole conversion rather than clamping. Offering a
	// setting that cannot work is worse than not offering it.
	Bitrates []int `json:"bitrates,omitempty"`

	// Note is shown under the picker — the one thing worth knowing before
	// choosing this format.
	Note string `json:"note"`
}

// Formats is the whole menu, in the order the picker shows them.
//
// All six are in Alpine's ffmpeg build. If the worker's base image changes,
// check `ffmpeg -encoders` still lists every codec below before assuming a
// conversion will work — a missing encoder fails at runtime, not at build.
var Formats = []Format{
	{
		ID: "mp3", Label: "MP3", Extension: "mp3", MIME: "audio/mpeg",
		Codec: "libmp3lame", Lossy: true,
		Note: "plays everywhere",
	},
	{
		ID: "wav", Label: "WAV", Extension: "wav", MIME: "audio/wav",
		Codec: "pcm_s16le",
		Note:  "uncompressed — expect roughly 10MB a minute",
	},
	{
		ID: "flac", Label: "FLAC", Extension: "flac", MIME: "audio/flac",
		Codec: "flac",
		Note:  "lossless, about half the size of WAV",
	},
	{
		ID: "m4a", Label: "M4A", Extension: "m4a", MIME: "audio/mp4",
		Codec: "aac", Lossy: true,
		Note: "AAC — better than MP3 at the same bitrate",
	},
	{
		ID: "ogg", Label: "OGG", Extension: "ogg", MIME: "audio/ogg",
		Codec: "libvorbis", Lossy: true,
		Note: "Vorbis — open, but thinner support on Apple devices",
	},
	{
		ID: "opus", Label: "Opus", Extension: "opus", MIME: "audio/opus",
		Codec: "libopus", Lossy: true,
		// libopus caps at 256k and errors out above it. It also needs far less
		// than the others for the same quality, so the range starts lower.
		Bitrates: []int{96, 128, 192, 256},
		Note:     "best quality per byte — caps at 256",
	},
}

const DefaultFormat = "mp3"

// BitratesFor is the menu for one format: its own list where it has one, the
// common set otherwise, and nothing at all for lossless output.
func (f Format) BitratesFor() []int {
	if !f.Lossy {
		return nil
	}
	if len(f.Bitrates) > 0 {
		return f.Bitrates
	}
	return Bitrates
}

func (f Format) Accepts(kbps int) bool {
	for _, b := range f.BitratesFor() {
		if b == kbps {
			return true
		}
	}
	return false
}

// DefaultBitrateFor keeps a format change from carrying an impossible setting
// across — 320 chosen for MP3 must not follow the user to Opus.
func (f Format) DefaultBitrateFor() int {
	options := f.BitratesFor()
	if len(options) == 0 {
		return 0
	}
	for _, b := range options {
		if b == DefaultBitrate {
			return b
		}
	}
	return options[len(options)-1]
}

func FormatByID(id string) (Format, error) {
	if id == "" {
		id = DefaultFormat
	}
	for _, format := range Formats {
		if format.ID == id {
			return format, nil
		}
	}
	return Format{}, fmt.Errorf("%q is not a format this converter produces", id)
}
