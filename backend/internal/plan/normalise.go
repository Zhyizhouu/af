package plan

import (
	"slices"
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
func Normalise(
	p Plan,
	categories []string,
	now time.Time,
	known map[string]bool,
	knownHabits map[string]bool,
) Plan {
	allowed := make(map[string]bool, len(categories))
	for _, slug := range categories {
		allowed[strings.TrimSpace(slug)] = true
	}

	// Empty slices rather than nil: both marshal differently, and a required
	// array arriving as null is the kind of thing a client only discovers in
	// production. This one copes either way; the next one might not.
	out := Plan{
		Reply:      strings.TrimSpace(p.Reply),
		Sessions:   []Session{},
		Events:     []Event{},
		Removals:   []string{},
		QRCodes:    []QR{},
		HabitTicks: []HabitTick{},
	}

	// A tick names a habit this same request supplied, for the reason removals
	// do: an invented id marks the wrong habit, and the person confirming sees
	// a name the client resolved rather than one the model wrote. One mark per
	// habit per day — the last one wins, because "tick it, no, untick it" in a
	// single answer is the model changing its mind mid-sentence, not two marks.
	ticked := make(map[string]int, len(p.HabitTicks))
	for _, tick := range p.HabitTicks {
		id := strings.TrimSpace(tick.HabitID)
		day := strings.TrimSpace(tick.Day)
		if id == "" || !knownHabits[id] {
			continue
		}
		// A day key, not an instant. Anything else is dropped rather than
		// guessed at: marking the wrong day is as wrong as the wrong habit.
		if _, err := time.Parse("2006-01-02", day); err != nil {
			continue
		}

		key := id + "|" + day
		if at, seen := ticked[key]; seen {
			out.HabitTicks[at].Done = tick.Done
			continue
		}
		if len(out.HabitTicks) >= MaxProposals {
			break
		}
		ticked[key] = len(out.HabitTicks)
		out.HabitTicks = append(out.HabitTicks, HabitTick{
			HabitID: id, Day: day, Done: tick.Done,
		})
	}

	// Deletion is the one thing here that destroys something, so a removal is
	// only ever an id this same request supplied. A hallucinated id is not
	// repaired or matched to the nearest entry — it is dropped, because the
	// failure mode of guessing is deleting the wrong thing.
	seen := make(map[string]bool, len(p.Removals))
	for _, id := range p.Removals {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] || !known[id] {
			continue
		}
		seen[id] = true
		out.Removals = append(out.Removals, id)
		if len(out.Removals) >= MaxProposals {
			break
		}
	}

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

	// A QR is generated rather than confirmed, so nothing downstream is going
	// to look at it before it renders. Whatever is wrong with it has to be
	// caught here or it reaches the person as a broken picture.
	for _, code := range p.QRCodes {
		if len(out.QRCodes) >= MaxQRCodes {
			break
		}
		if cleaned, ok := cleanQR(code); ok {
			out.QRCodes = append(out.QRCodes, cleaned)
		}
	}

	// A chat cannot show an empty turn, and one is reachable two ways: a model
	// that answered with proposals and no prose, or one whose every proposal
	// was just dropped above. The second is the one worth wording carefully —
	// saying nothing there would read as the assistant ignoring the request.
	if out.Reply == "" {
		switch {
		case !out.IsEmpty():
			out.Reply = "Here is what I have. Check it before you confirm."
		case len(p.Sessions)+len(p.Events)+len(p.Removals)+len(p.HabitTicks) > 0:
			out.Reply = "I could not make sense of the changes I came up with. " +
				"Try naming the date and time directly."
		default:
			out.Reply = "I did not find anything to schedule in that."
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

// cleanQR makes a proposed code renderable, or drops it.
//
// Nothing here is repaired optimistically. A code encoding the wrong thing
// scans as the wrong thing, and a person who has already put it on a poster has
// no way of knowing — so anything questionable is refused rather than guessed
// at. The one exception is the correction level, which affects only how much
// damage the code survives.
func cleanQR(q QR) (QR, bool) {
	// Not TrimSpace'd into oblivion: leading and trailing whitespace in a URL
	// is a mistake, but the text itself is encoded verbatim otherwise.
	q.Text = strings.TrimSpace(q.Text)
	if q.Text == "" {
		return QR{}, false
	}
	// Version 40 at level L tops out around 2,953 bytes, and every lower
	// combination is smaller. Past this there is no code to make.
	if len(q.Text) > MaxQRBytes {
		return QR{}, false
	}

	q.Label = strings.TrimSpace(q.Label)
	if q.Label == "" {
		q.Label = "QR code"
	}

	q.ECC = strings.ToUpper(strings.TrimSpace(q.ECC))
	if !slices.Contains(ECCLevels, q.ECC) {
		q.ECC = "M"
	}
	// A logo covers the middle of the code, which is damage; only the highest
	// correction level reliably survives it. The model is told this too, and
	// this is what happens when it does not listen.
	if q.UseLogo {
		q.ECC = "H"
	}

	return q, true
}

// plausible rejects dates far enough from now to be a misread year rather than
// a plan. Five years back covers backfilling last semester; two forward covers
// any timetable anybody is actually writing.
func plausible(t, now time.Time) bool {
	return t.After(now.AddDate(-5, 0, 0)) && t.Before(now.AddDate(2, 0, 0))
}
