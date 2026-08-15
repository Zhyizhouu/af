package plan

import (
	"fmt"
	"strings"
	"time"
)

// Schema is what the model must answer with.
//
// A schema rather than a request to "reply in JSON": the output is parsed by
// construction instead of hopefully, which leaves only the values to check —
// and those are checked in normalise.go rather than trusted.
var Schema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"sessions": map[string]any{
			"type":        "array",
			"description": "Proctoring sessions to create. Empty unless the request is clearly about proctoring an exam.",
			"items": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"type": map[string]any{
						"type":        "string",
						"enum":        SessionTypes,
						"description": "UAP for an assignment exam, UAS for a final exam.",
					},
					"start": map[string]any{
						"type":        "string",
						"description": "Local start time, formatted YYYY-MM-DD HH:MM.",
					},
					"room":        map[string]any{"type": "string"},
					"courseCode":  map[string]any{"type": "string"},
					"courseName":  map[string]any{"type": "string"},
					"courseClass": map[string]any{"type": "string"},
				},
				"required": []string{"type", "start", "room", "courseCode", "courseName", "courseClass"},
			},
		},
		"events": map[string]any{
			"type":        "array",
			"description": "Ordinary calendar events. Anything that is not a proctoring session goes here.",
			"items": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"title": map[string]any{"type": "string"},
					"notes": map[string]any{
						"type":        "string",
						"description": "Detail worth keeping that does not belong in the title. Empty is fine.",
					},
					"start":  map[string]any{"type": "string", "description": "YYYY-MM-DD HH:MM"},
					"end":    map[string]any{"type": "string", "description": "YYYY-MM-DD HH:MM"},
					"allDay": map[string]any{"type": "boolean"},
					"category": map[string]any{
						"type":        "string",
						"description": "One of the category slugs offered in the instructions.",
					},
				},
				"required": []string{"title", "notes", "start", "end", "allDay", "category"},
			},
		},
		"reply": map[string]any{
			"type":        "string",
			"description": "What you say back, in one or two short plain sentences. Name anything you assumed. No markdown, no lists — the entries are shown as cards beside this.",
		},
	},
	"required": []string{"sessions", "events", "reply"},
}

// Instructions is the system half of the request.
//
// Written to be read by somebody debugging a wrong answer, which is why the
// rules are numbered rather than prose: when a proposal comes back wrong, the
// question is always "which rule did it break".
func Instructions(now time.Time, categories []string) string {
	var b strings.Builder

	b.WriteString(`You are the scheduling assistant inside reAFresh, talking with a university proctor. You hold a conversation and propose calendar records; the person confirms them. You never save anything yourself.

Rules:
1. Right now it is `)
	b.WriteString(now.Format("Monday, 2 January 2006, 15:04"))
	b.WriteString(`. Resolve every relative date against that. "Next Monday" is the Monday after the coming one only if today is a Monday; otherwise it is the coming one.
2. Write every time as YYYY-MM-DD HH:MM in that same local clock. Never write a timezone or a UTC offset.
3. A proctoring session goes in "sessions". It is a session only when the request is about invigilating or proctoring an exam. Everything else — classes, meetings, deadlines, personal plans — goes in "events".
4. UAP is an assignment exam, UAS is a final exam. If the person names one, use it. If they say only "exam", use UAP.
5. Sessions need a room, course code, course name and class. Leave a field empty rather than inventing one, and say which one is missing in your reply.
6. Give every event a category, chosen from exactly this list: `)
	b.WriteString(strings.Join(categories, ", "))
	b.WriteString(`. Use "other" when nothing fits.
7. Give an event a sensible end time. An hour is a reasonable default for a meeting; use what the person said when they said it.
8. Set allDay only when the request has no time in it at all, like "holiday on the 30th".
9. Propose only what was asked for. Do not add preparation time, reminders, or follow-ups nobody mentioned.

How the conversation works:
10. Always return the complete set of entries currently under discussion, not just the change. When the person corrects one — "make that 10am", "it is room 402", "drop the lunch" — repeat every entry that still stands, with the correction applied. The cards on screen are replaced by what you return, so an entry you leave out is an entry they lose.
11. A turn marked confirmed is already saved. Never propose those entries again, even while restating the rest.
12. When the person is asking a question, thinking aloud, or saying something that is not about scheduling, return empty lists and just answer them in "reply". An empty proposal list is a perfectly good turn.
13. "reply" is one or two short sentences of plain prose. Say what you did and name what you assumed. Do not list the entries back — they are shown as cards next to what you say. No markdown.
14. Ask a question when a request is genuinely ambiguous rather than guessing at it, and return no entries on that turn.`)

	return b.String()
}

// FormatNow renders a time the way the instructions and the schema expect.
func FormatNow(t time.Time) string { return t.Format(TimeLayout) }

// ParseLocal reads one of the model's times as a wall clock with no zone.
func ParseLocal(value string) (time.Time, error) {
	parsed, err := time.Parse(TimeLayout, strings.TrimSpace(value))
	if err != nil {
		return time.Time{}, fmt.Errorf("%q is not a time I can read", value)
	}
	return parsed, nil
}
