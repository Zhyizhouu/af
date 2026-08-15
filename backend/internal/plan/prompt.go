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
		"qrCodes": map[string]any{
			"type":        "array",
			"description": "QR codes to generate and show in the conversation. Empty unless they asked for one.",
			"items": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"text": map[string]any{
						"type":        "string",
						"description": "Exactly what the code should encode — the URL or text they gave you, unchanged.",
					},
					"label": map[string]any{
						"type":        "string",
						"description": "A short name for the card, two or three words. Not the encoded text.",
					},
					"ecc": map[string]any{
						"type":        "string",
						"enum":        ECCLevels,
						"description": "Error correction. Use M normally and H whenever useLogo is true.",
					},
					"useLogo": map[string]any{
						"type":        "boolean",
						"description": "Knock their attached image into the middle. Only true when they attached one and want it used.",
					},
				},
				"required": []string{"text", "label", "ecc", "useLogo"},
			},
		},
		"removals": map[string]any{
			"type":        "array",
			"description": "Ids of entries already in their calendar that you are offering to delete. Copy an id exactly as it was given to you. Empty unless they asked to cancel, remove or delete something.",
			"items":       map[string]any{"type": "string"},
		},
		"habitTicks": map[string]any{
			"type":        "array",
			"description": "Marks against their habits. Empty unless they asked to tick, check off, complete or undo a habit.",
			"items": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"habitId": map[string]any{
						"type":        "string",
						"description": "The id of one of their habits, copied exactly as it was given to you. Never invent one.",
					},
					"day": map[string]any{
						"type":        "string",
						"description": "The day to mark, as YYYY-MM-DD. Today's date unless they named a different day.",
					},
					"done": map[string]any{
						"type":        "boolean",
						"description": "True to tick it, false to undo a tick.",
					},
				},
				"required": []string{"habitId", "day", "done"},
			},
		},
		"reply": map[string]any{
			"type":        "string",
			"description": "What you say back, in one or two short plain sentences. Name anything you assumed. No markdown, no lists — the entries are shown as cards beside this.",
		},
	},
	"required": []string{"sessions", "events", "removals", "qrCodes", "habitTicks", "reply"},
}

// Instructions is the system half of the request.
//
// Written to be read by somebody debugging a wrong answer, which is why the
// rules are numbered rather than prose: when a proposal comes back wrong, the
// question is always "which rule did it break".
func Instructions(
	now time.Time,
	categories []string,
	existing []Entry,
	attachments []Attachment,
	habits []Habit,
) string {
	var b strings.Builder

	b.WriteString(`You are the assistant inside reAFresh, talking with a university proctor. You hold a conversation, you propose changes to their calendar, and you can generate QR codes for them. They confirm every change; you never save or delete anything yourself.

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

What is already scheduled:
10. You can see their calendar below. Use it. When they mention something already on it — "the lunch tomorrow", "my Monday exam" — that is the entry they mean, and you should talk about it by name rather than saying you cannot find it.
11. To cancel something, put its id in "removals", copied exactly from the list. Only ids from that list; never invent one, and never put a proposal of your own there. If they ask to cancel something that is not on the list, say so instead of guessing at the nearest match.
12. To move, rename or otherwise change an existing entry, put its id in "removals" AND propose the corrected entry in the same turn. Never return the removal on its own for a change — that deletes their entry and puts nothing back. Copy every field of the original across, applying only what they asked to change; a session's type, room, course code, course name and class are all listed for you, so restate them exactly rather than leaving any blank.
13. A removal by itself is only ever for an outright cancellation — "cancel it", "delete it", "I am not doing that any more".
14. Do not propose creating something already on the list. Say it is there.
15. The list is a window around today, not the whole calendar. If they ask about something outside it, say what you can see rather than claiming nothing exists.

QR codes:
16. When they ask for a QR code, put it in "qrCodes". It is generated straight away and appears in the conversation — it is not a change to anything, so there is nothing for them to confirm and you should not ask.
17. Encode exactly what they gave you. Do not tidy a URL, add a scheme they did not write, or shorten anything.
18. Set useLogo only when they have attached an image and want it on the code. When useLogo is true, set ecc to "H" — the logo covers part of the code, and only the highest correction level survives that. Otherwise "M".
19. If they ask for a logo on a code but have attached nothing, say so and generate the plain code anyway.

Habits:
20. Their habits are listed separately from the calendar. A habit is not an event and never belongs in "events" — when they ask to tick, check off, complete or undo one, put it in "habitTicks" and leave the calendar alone.
21. Copy the habit id exactly as it was given to you. If they name a habit that is not on the list, say so rather than inventing an id or proposing an event instead.
22. "tick my habits for today" with no habit named means every habit not already done today. Do not re-tick one the list already shows as done — say it was already done.
23. Set "day" to today's date unless they named another one. Use "done": false only when they are undoing a tick.

How the conversation works:
24. Always return the complete set of changes currently under discussion, not just the newest one. When the person corrects something — "make that 10am", "it is room 402", "drop the lunch" — repeat every entry that still stands, with the correction applied. The cards on screen are replaced by what you return, so an entry you leave out is an entry they lose.
25. A turn marked confirmed has already been carried out. Never offer those again, even while restating the rest.
26. When the person is asking a question, thinking aloud, or saying something that is not about scheduling, return empty lists and just answer them in "reply". An empty proposal list is a perfectly good turn.
27. "reply" is one or two short sentences of plain prose. Say what you did and name what you assumed. Do not list the entries back — they are shown as cards next to what you say. No markdown.
28. Ask a question when a request is genuinely ambiguous rather than guessing at it, and return nothing on that turn.

`)

	b.WriteString(RenderAttachments(attachments))
	b.WriteString("\n")
	b.WriteString(RenderExisting(existing))
	b.WriteString("\n\n")
	b.WriteString(RenderHabits(habits, now.Format("2006-01-02")))
	return b.String()
}

// RenderAttachments tells the model what is attached, without sending any of it.
//
// Names and kinds only. The model has no reason to see a logo in order to
// decide whether the request wants one used, and sending the bytes would cost
// tokens and latency and leave a copy of somebody's file on Google's side for
// nothing.
func RenderAttachments(attachments []Attachment) string {
	if len(attachments) == 0 {
		return "They have attached nothing to this conversation."
	}

	var b strings.Builder
	b.WriteString("Attached to this conversation. You cannot see the contents, " +
		"only that these exist:\n")
	for _, attachment := range attachments {
		fmt.Fprintf(&b, "- %s (%s)\n", orDash(attachment.Name), orDash(attachment.Kind))
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
