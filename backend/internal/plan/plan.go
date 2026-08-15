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

	// Reply is what the assistant says back — the conversational half. It
	// carries what was assumed and what could not be worked out, because
	// "I assumed 2026" is exactly the kind of thing worth reading before
	// pressing the button. Never empty: a chat with a blank turn in it looks
	// broken, so Normalise supplies one when the model does not.
	Reply string `json:"reply"`
}

func (p Plan) IsEmpty() bool { return len(p.Sessions) == 0 && len(p.Events) == 0 }

// Roles a conversation turn can take. The wire uses "assistant" rather than
// Gemini's "model", because this is the vocabulary the client speaks; the
// mapping happens where the model is actually called.
const (
	RoleUser      = "user"
	RoleAssistant = "assistant"
)

// Turn is one message in the conversation so far.
//
// The client sends the whole transcript on every request and the server keeps
// none of it. That is what lets the assistant stay a plain handler with no
// store behind it: there is no conversation to own, so there is no
// conversation to scope, leak or expire.
type Turn struct {
	Role string `json:"role"`
	Text string `json:"text"`

	// What the assistant proposed on this turn, echoed back by the client.
	// Without them "move that one to ten" is unanswerable — the prose alone
	// does not say which entries were on the table. Only read on an assistant
	// turn.
	Sessions []Session `json:"sessions,omitempty"`
	Events   []Event   `json:"events,omitempty"`

	// True once the person confirmed this turn's proposals. The model is told
	// so that it does not cheerfully offer to create them a second time.
	Committed bool `json:"committed,omitempty"`
}

// Render is what the model is shown for this turn.
func (t Turn) Render() string {
	if t.Role != RoleAssistant {
		return t.Text
	}

	var b strings.Builder
	b.WriteString(strings.TrimSpace(t.Text))
	for _, s := range t.Sessions {
		fmt.Fprintf(&b, "\n- session | %s | %s | room %s | %s %s %s",
			s.Type, s.Start, orDash(s.Room),
			orDash(s.CourseCode), orDash(s.CourseName), orDash(s.CourseClass))
	}
	for _, e := range t.Events {
		if e.AllDay {
			fmt.Fprintf(&b, "\n- event | %s | %s | all day | %s",
				e.Title, e.Start, e.Category)
			continue
		}
		fmt.Fprintf(&b, "\n- event | %s | %s to %s | %s",
			e.Title, e.Start, e.End, e.Category)
	}
	if t.Committed && (len(t.Sessions) > 0 || len(t.Events) > 0) {
		b.WriteString("\n(confirmed — these are already saved, do not propose them again)")
	}
	return b.String()
}

func orDash(value string) string {
	if strings.TrimSpace(value) == "" {
		return "—"
	}
	return value
}

// Request is what the browser sends.
type Request struct {
	Prompt string `json:"prompt"`

	// Everything said before this message, oldest first. Sent by the client
	// because the client is the only thing that remembers it.
	History []Turn `json:"history"`

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
	// MaxHistoryTurns is how far back the model is shown. A dozen exchanges is
	// far more than a scheduling conversation runs to, and the cap is what
	// stops a long-lived tab growing its own prompt cost without limit.
	MaxHistoryTurns = 24
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

	// The history was produced by this API, so anything malformed in it was
	// made up by the caller rather than sent back unchanged. Refusing beats
	// quietly feeding the model whatever it contains.
	for _, turn := range r.History {
		switch {
		case turn.Role != RoleUser && turn.Role != RoleAssistant:
			return fmt.Errorf("that conversation contains a turn I cannot read")
		case len([]rune(turn.Text)) > maxPromptRunes:
			return fmt.Errorf("that conversation contains a message that is too long")
		}
	}
	return nil
}

// Recent is the tail of the conversation the model is actually shown.
//
// Trimmed rather than refused: a conversation outgrowing the window is normal
// use, and dropping the oldest turns is what every chat does. The turns that
// matter for a correction are the recent ones.
func (r Request) Recent() []Turn {
	if len(r.History) <= MaxHistoryTurns {
		return r.History
	}
	return r.History[len(r.History)-MaxHistoryTurns:]
}

// TimeLayout is the shape every time in this package takes: local wall clock,
// no zone. A zone would be a lie — the model is not told one and the client
// resolves these against its own.
const TimeLayout = "2006-01-02 15:04"
