// Package plan turns a sentence into calendar entries.
//
// The model's job is narrow on purpose: read what somebody typed and propose
// records. It never writes anything. Every proposal goes back to the browser
// to be looked at, corrected and confirmed, because the failure mode of an AI
// that writes straight to your calendar is a calendar you can no longer trust.
package plan

import (
	"fmt"
	"strings"
	"time"
)

// SessionTypes are the only proctoring sessions that exist. The model picks
// one of these or the request is refused — a free-text type would end up as a
// field nothing in the app knows how to render.
var SessionTypes = []string{"UAP", "UAS"}

// Session is a proposed proctoring session, matching the ProctorSession the
// app stores. Times come back as local wall-clock strings rather than
// instants: the model is reasoning about "Monday at nine", and turning that
// into an instant is the client's job, in the client's timezone.
type Session struct {
	Type        string `json:"type"`
	Start       string `json:"start"`
	Room        string `json:"room"`
	CourseCode  string `json:"courseCode"`
	CourseName  string `json:"courseName"`
	CourseClass string `json:"courseClass"`
}

// Event is a proposed calendar event.
type Event struct {
	Title    string `json:"title"`
	Notes    string `json:"notes"`
	Start    string `json:"start"`
	End      string `json:"end"`
	AllDay   bool   `json:"allDay"`
	Category string `json:"category"`
}

// Plan is what one request produces.
type Plan struct {
	Sessions []Session `json:"sessions"`
	Events   []Event   `json:"events"`

	// Note is the model's own remark — what it assumed, or what it could not
	// work out. Shown to the person confirming, because "I assumed 2026" is
	// exactly the kind of thing worth reading before pressing the button.
	Note string `json:"note"`
}

func (p Plan) IsEmpty() bool { return len(p.Sessions) == 0 && len(p.Events) == 0 }

// Request is what the browser sends.
type Request struct {
	Prompt string `json:"prompt"`

	// The client's current local time, formatted like the times the model is
	// asked to produce. Sent rather than read from the server's clock: "next
	// Monday" depends on where the person asking is, not where this runs.
	Now string `json:"now"`

	// Category slugs the model may choose from. Sent by the client because it
	// owns them — the built-ins ship with the app and the rest are the user's.
	Categories []string `json:"categories"`
}

const (
	maxPromptRunes = 2000
	// A single sentence should not be able to ask for a thousand records.
	MaxProposals = 40
)

func (r Request) Validate() error {
	prompt := strings.TrimSpace(r.Prompt)
	switch {
	case prompt == "":
		return fmt.Errorf("say what you would like scheduled")
	case len([]rune(prompt)) > maxPromptRunes:
		return fmt.Errorf("that is too long — keep it under %d characters",
			maxPromptRunes)
	case len(r.Categories) == 0:
		return fmt.Errorf("no categories were offered to choose from")
	}
	if _, err := time.Parse(TimeLayout, strings.TrimSpace(r.Now)); err != nil {
		return fmt.Errorf("the current time was not sent in a form I can read")
	}
	return nil
}

// TimeLayout is the shape every time in this package takes: local wall clock,
// no zone. A zone would be a lie — the model is not told one and the client
// resolves these against its own.
const TimeLayout = "2006-01-02 15:04"
