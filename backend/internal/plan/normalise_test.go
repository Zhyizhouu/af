package plan_test

import (
	"testing"
	"time"

	"github.com/Zhyizhouu/af/backend/internal/plan"
)

var (
	now        = time.Date(2026, 8, 15, 9, 0, 0, 0, time.UTC)
	categories = []string{"study", "work", "university", "other"}
)

func stamp(t time.Time) string { return t.Format(plan.TimeLayout) }

// Normalise is the guard between a model's answer and somebody's calendar.
//
// Every case here is something a language model actually does. The schema only
// constrains shape — that a start is a string — so anything about whether the
// proposal makes sense has to be checked here, before a person is asked to
// confirm it. A wrong entry confirmed without reading is worse than a missing
// one that gets noticed.
func TestNormaliseRejectsNonsense(t *testing.T) {
	soon := stamp(now.Add(48 * time.Hour))

	t.Run("an invented category falls back rather than dropping the event", func(t *testing.T) {
		got := plan.Normalise(plan.Plan{
			Events: []plan.Event{{
				Title: "Dentist", Start: soon, End: stamp(now.Add(49 * time.Hour)),
				Category: "medical-appointments",
			}},
		}, categories, now)

		if len(got.Events) != 1 {
			t.Fatalf("expected the event kept, got %d", len(got.Events))
		}
		// The wrong colour is one tap to fix; a missing event is not.
		if got.Events[0].Category != "other" {
			t.Errorf("category = %q, want other", got.Events[0].Category)
		}
	})

	t.Run("an end before its start is repaired to an hour", func(t *testing.T) {
		got := plan.Normalise(plan.Plan{
			Events: []plan.Event{{
				Title: "Standup", Start: soon, End: stamp(now.Add(24 * time.Hour)),
				Category: "work",
			}},
		}, categories, now)

		if len(got.Events) != 1 {
			t.Fatalf("expected the event kept, got %d", len(got.Events))
		}
		start, _ := plan.ParseLocal(got.Events[0].Start)
		end, _ := plan.ParseLocal(got.Events[0].End)
		if end.Sub(start) != time.Hour {
			t.Errorf("duration = %v, want 1h", end.Sub(start))
		}
	})

	// A "meeting" the model thinks runs three weeks has misread a date, and
	// there is no sensible repair for that.
	t.Run("an absurdly long event is dropped", func(t *testing.T) {
		got := plan.Normalise(plan.Plan{
			Events: []plan.Event{{
				Title: "Project", Start: soon,
				End: stamp(now.AddDate(0, 6, 0)), Category: "work",
			}},
		}, categories, now)

		if len(got.Events) != 0 {
			t.Fatalf("expected it dropped, got %+v", got.Events)
		}
	})

	// The classic year slip: 2025 for 2026, or a date decades out.
	t.Run("a date nowhere near now is dropped", func(t *testing.T) {
		got := plan.Normalise(plan.Plan{
			Events: []plan.Event{
				{Title: "Ancient", Start: "1999-01-01 09:00", End: "1999-01-01 10:00", Category: "work"},
				{Title: "Distant", Start: "2099-01-01 09:00", End: "2099-01-01 10:00", Category: "work"},
				{Title: "Fine", Start: soon, End: stamp(now.Add(49 * time.Hour)), Category: "work"},
			},
		}, categories, now)

		if len(got.Events) != 1 || got.Events[0].Title != "Fine" {
			t.Fatalf("expected only the plausible event, got %+v", got.Events)
		}
	})

	t.Run("an event with no title is dropped", func(t *testing.T) {
		got := plan.Normalise(plan.Plan{
			Events: []plan.Event{{
				Title: "   ", Start: soon, End: stamp(now.Add(49 * time.Hour)),
				Category: "work",
			}},
		}, categories, now)

		if len(got.Events) != 0 {
			t.Fatalf("expected it dropped, got %+v", got.Events)
		}
	})

	// The schema pins this to an enum, so reaching here means the answer did
	// not honour its own schema. Guessing which exam somebody is invigilating
	// is not a repair worth making.
	t.Run("a session type outside the enum is dropped", func(t *testing.T) {
		got := plan.Normalise(plan.Plan{
			Sessions: []plan.Session{{
				Type: "MIDTERM", Start: soon, Room: "401",
				CourseCode: "COMP6047", CourseName: "Algorithm",
			}},
		}, categories, now)

		if len(got.Sessions) != 0 {
			t.Fatalf("expected it dropped, got %+v", got.Sessions)
		}
	})

	t.Run("a session with no course at all is dropped", func(t *testing.T) {
		got := plan.Normalise(plan.Plan{
			Sessions: []plan.Session{{Type: "UAP", Start: soon, Room: "401"}},
		}, categories, now)

		if len(got.Sessions) != 0 {
			t.Fatalf("expected it dropped, got %+v", got.Sessions)
		}
	})

	t.Run("session fields are tidied", func(t *testing.T) {
		got := plan.Normalise(plan.Plan{
			Sessions: []plan.Session{{
				Type: " uap ", Start: soon, Room: " 401 ",
				CourseCode: " comp6047 ", CourseName: " Algorithm ",
				CourseClass: " baa1 ",
			}},
		}, categories, now)

		if len(got.Sessions) != 1 {
			t.Fatalf("expected the session kept, got %d", len(got.Sessions))
		}
		s := got.Sessions[0]
		if s.Type != "UAP" || s.CourseCode != "COMP6047" ||
			s.CourseClass != "BAA1" || s.Room != "401" ||
			s.CourseName != "Algorithm" {
			t.Errorf("not tidied: %+v", s)
		}
	})

	// One sentence should not be able to fill a calendar.
	t.Run("the proposal count is capped", func(t *testing.T) {
		var flood []plan.Event
		for i := 0; i < 200; i++ {
			flood = append(flood, plan.Event{
				Title: "Spam", Start: soon, End: stamp(now.Add(49 * time.Hour)),
				Category: "work",
			})
		}

		got := plan.Normalise(plan.Plan{Events: flood}, categories, now)
		if len(got.Events) != plan.MaxProposals {
			t.Errorf("kept %d events, want the cap of %d",
				len(got.Events), plan.MaxProposals)
		}
	})

	t.Run("an empty answer stays empty and keeps its note", func(t *testing.T) {
		got := plan.Normalise(
			plan.Plan{Note: "  I could not find a date in that.  "},
			categories, now)

		if !got.IsEmpty() {
			t.Error("expected an empty plan")
		}
		if got.Note != "I could not find a date in that." {
			t.Errorf("note = %q", got.Note)
		}
	})
}

func TestRequestValidation(t *testing.T) {
	valid := plan.Request{
		Prompt:     "UAP Algoritma on Monday at 9 in room 401",
		Now:        stamp(now),
		Categories: categories,
	}
	if err := valid.Validate(); err != nil {
		t.Fatalf("expected valid, got %v", err)
	}

	for name, mutate := range map[string]func(plan.Request) plan.Request{
		"empty prompt":     func(r plan.Request) plan.Request { r.Prompt = "   "; return r },
		"no categories":    func(r plan.Request) plan.Request { r.Categories = nil; return r },
		"unreadable clock": func(r plan.Request) plan.Request { r.Now = "tomorrow"; return r },
		"overlong prompt":  func(r plan.Request) plan.Request { r.Prompt = string(make([]rune, 3000)); return r },
	} {
		if err := mutate(valid).Validate(); err == nil {
			t.Errorf("%s should be rejected", name)
		}
	}
}
