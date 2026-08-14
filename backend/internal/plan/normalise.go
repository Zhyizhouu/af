package plan

import (
	"strings"
	"time"
)

// Normalise makes a model's answer safe to show somebody.
//
// Everything here is a thing a language model actually does: an end time
// before its start, a category it invented, a date in the wrong year, forty
// copies of the same meeting. None of it is caught by the schema, which only
// guarantees the shape.
//
// Nothing is repaired silently where repairing would change intent — a
// proposal that cannot be made sensible is dropped, because a wrong entry
// somebody confirms without reading is worse than a missing one they notice.
func Normalise(p Plan, categories []string, now time.Time) Plan {
	allowed := make(map[string]bool, len(categories))
	for _, slug := range categories {
		allowed[strings.TrimSpace(slug)] = true
	}

	out := Plan{Note: strings.TrimSpace(p.Note)}

	for _, session := range p.Sessions {
		if len(out.Sessions)+len(out.Events) >= MaxProposals {
			break
		}
		if cleaned, ok := cleanSession(session, now); ok {
			out.Sessions = append(out.Sessions, cleaned)
		}
	}

	for _, event := range p.Events {
		if len(out.Sessions)+len(out.Events) >= MaxProposals {
			break
		}
		if cleaned, ok := cleanEvent(event, allowed, now); ok {
			out.Events = append(out.Events, cleaned)
		}
	}

	return out
}

func cleanSession(s Session, now time.Time) (Session, bool) {
	s.Type = strings.ToUpper(strings.TrimSpace(s.Type))
	if s.Type != "UAP" && s.Type != "UAS" {
		// The schema constrains this to an enum, so reaching here means the
		// answer did not honour its own schema. Refusing beats guessing which
		// exam somebody is invigilating.
		return Session{}, false
	}

	start, err := ParseLocal(s.Start)
	if err != nil || !plausible(start, now) {
		return Session{}, false
	}
	s.Start = start.Format(TimeLayout)

	s.Room = strings.TrimSpace(s.Room)
	s.CourseCode = strings.ToUpper(strings.TrimSpace(s.CourseCode))
	s.CourseName = strings.TrimSpace(s.CourseName)
	s.CourseClass = strings.ToUpper(strings.TrimSpace(s.CourseClass))

	// A session with no course at all is not a session anybody asked for; it
	// is the model filling in a shape.
	if s.CourseCode == "" && s.CourseName == "" {
		return Session{}, false
	}
	return s, true
}

func cleanEvent(e Event, allowed map[string]bool, now time.Time) (Event, bool) {
	e.Title = strings.TrimSpace(e.Title)
	if e.Title == "" {
		return Event{}, false
	}
	e.Notes = strings.TrimSpace(e.Notes)

	start, err := ParseLocal(e.Start)
	if err != nil || !plausible(start, now) {
		return Event{}, false
	}

	end, err := ParseLocal(e.End)
	// An end before its start is the commonest arithmetic slip, and an hour is
	// what the instructions ask for by default — so this is repaired rather
	// than dropped. The time is a guess either way; the event is not.
	if err != nil || !end.After(start) {
		end = start.Add(time.Hour)
	}
	// A meeting the model thinks runs for three weeks has misread a date.
	if end.Sub(start) > 30*24*time.Hour {
		return Event{}, false
	}

	e.Start = start.Format(TimeLayout)
	e.End = end.Format(TimeLayout)

	e.Category = strings.TrimSpace(strings.ToLower(e.Category))
	if !allowed[e.Category] {
		// Falling back rather than dropping: the wrong colour is a much
		// smaller problem than a missing event, and it is one tap to fix.
		e.Category = "other"
	}
	return e, true
}

// plausible rejects dates far enough from now to be a misread year rather than
// a plan. Five years back covers backfilling last semester; two forward covers
// any timetable anybody is actually writing.
func plausible(t, now time.Time) bool {
	return t.After(now.AddDate(-5, 0, 0)) && t.Before(now.AddDate(2, 0, 0))
}
