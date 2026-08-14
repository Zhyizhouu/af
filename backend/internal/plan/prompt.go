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
		"note": map[string]any{
			"type":        "string",
			"description": "One short sentence naming anything you assumed or could not work out. Empty if nothing.",
		},
	},
	"required": []string{"sessions", "events", "note"},
}

// Instructions is the system half of the request.
//
// Written to be read by somebody debugging a wrong answer, which is why the
// rules are numbered rather than prose: when a proposal comes back wrong, the
// question is always "which rule did it break".
func Instructions(now time.Time, categories []string) string {
	var b strings.Builder

	b.WriteString(`You turn a person's sentence into calendar records for a university proctor. Read what they wrote and propose entries.

Rules:
1. Right now it is `)
	b.WriteString(now.Format("Monday, 2 January 2006, 15:04"))
	b.WriteString(`. Resolve every relative date against that. "Next Monday" is the Monday after the coming one only if today is a Monday; otherwise it is the coming one.
2. Write every time as YYYY-MM-DD HH:MM in that same local clock. Never write a timezone or a UTC offset.
3. A proctoring session goes in "sessions". It is a session only when the request is about invigilating or proctoring an exam. Everything else — classes, meetings, deadlines, personal plans — goes in "events".
4. UAP is an assignment exam, UAS is a final exam. If the person names one, use it. If they say only "exam", use UAP.
5. Sessions need a room, course code, course name and class. Leave a field empty rather than inventing one, and say so in the note.
6. Give every event a category, chosen from exactly this list: `)
	b.WriteString(strings.Join(categories, ", "))
	b.WriteString(`. Use "other" when nothing fits.
7. Give an event a sensible end time. An hour is a reasonable default for a meeting; use what the person said when they said it.
8. Set allDay only when the request has no time in it at all, like "holiday on the 30th".
9. Propose only what was asked for. Do not add preparation time, reminders, or follow-ups nobody mentioned.
10. If the request is not about scheduling anything, return empty lists and say why in the note.
11. Keep the note to one short sentence, and only when there is something worth saying. Name what you assumed.`)

	if len(categories) > 0 {
		b.WriteString("\n\nThe request follows.")
	}
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
