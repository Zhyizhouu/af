package plan_test

import (
	"strings"
	"testing"
	"time"

	"github.com/Zhyizhouu/af/backend/internal/plan"
)

// A tick marks stored data, so it gets the same guard a removal gets: the id
// has to be one this request supplied. The failure mode of guessing is marking
// the wrong habit, which is quieter than deleting the wrong entry and therefore
// easier to miss.
func TestHabitTicks(t *testing.T) {
	now := time.Date(2026, 8, 15, 9, 0, 0, 0, time.UTC)
	today := "2026-08-15"
	known := plan.Request{Habits: []plan.Habit{
		{ID: "h1", Name: "Read", Done: false},
		{ID: "h2", Name: "Run", Done: true},
	}}.KnownHabitIDs()

	normalise := func(ticks []plan.HabitTick) []plan.HabitTick {
		return plan.Normalise(
			plan.Plan{HabitTicks: ticks}, nil, now, nil, known).HabitTicks
	}

	t.Run("a known habit on a valid day is kept", func(t *testing.T) {
		got := normalise([]plan.HabitTick{{HabitID: " h1 ", Day: today, Done: true}})
		if len(got) != 1 || got[0].HabitID != "h1" || !got[0].Done {
			t.Fatalf("got %+v", got)
		}
	})

	t.Run("an invented habit id is dropped", func(t *testing.T) {
		if got := normalise([]plan.HabitTick{
			{HabitID: "nope", Day: today, Done: true},
		}); len(got) != 0 {
			t.Fatalf("kept a tick for a habit that does not exist: %+v", got)
		}
	})

	// A day key, not an instant. Marking the wrong day is as wrong as marking
	// the wrong habit, so a malformed one is dropped rather than guessed at.
	t.Run("a malformed day is dropped", func(t *testing.T) {
		for _, day := range []string{"", "today", "15/08/2026", "2026-08-15T09:00"} {
			if got := normalise([]plan.HabitTick{
				{HabitID: "h1", Day: day, Done: true},
			}); len(got) != 0 {
				t.Errorf("day %q survived: %+v", day, got)
			}
		}
	})

	// "tick it, no, untick it" inside one answer is the model changing its mind
	// mid-sentence, not two marks. The last word wins.
	t.Run("the same habit twice on a day collapses to the last", func(t *testing.T) {
		got := normalise([]plan.HabitTick{
			{HabitID: "h1", Day: today, Done: true},
			{HabitID: "h1", Day: today, Done: false},
		})
		if len(got) != 1 {
			t.Fatalf("expected one mark, got %+v", got)
		}
		if got[0].Done {
			t.Error("the earlier tick won; the last one should")
		}
	})

	t.Run("the same habit on different days is two marks", func(t *testing.T) {
		if got := normalise([]plan.HabitTick{
			{HabitID: "h1", Day: today, Done: true},
			{HabitID: "h1", Day: "2026-08-14", Done: true},
		}); len(got) != 2 {
			t.Fatalf("expected two marks, got %+v", got)
		}
	})

	t.Run("ticks are capped", func(t *testing.T) {
		many := make([]plan.HabitTick, 0, plan.MaxProposals+10)
		for i := 0; i < plan.MaxProposals+10; i++ {
			// Distinct days so nothing collapses — this is testing the cap.
			many = append(many, plan.HabitTick{
				HabitID: "h1",
				Day:     now.AddDate(0, 0, -i).Format("2006-01-02"),
				Done:    true,
			})
		}
		if got := normalise(many); len(got) > plan.MaxProposals {
			t.Fatalf("kept %d ticks, cap is %d", len(got), plan.MaxProposals)
		}
	})

	// A turn that only ticks a habit still touches stored data, so it has to go
	// behind the confirm gate rather than being carried out silently.
	t.Run("a tick needs confirming and is not empty", func(t *testing.T) {
		p := plan.Plan{HabitTicks: []plan.HabitTick{{HabitID: "h1", Day: today, Done: true}}}
		if p.IsEmpty() {
			t.Error("a turn that ticks a habit is not an empty turn")
		}
		if !p.NeedsConfirming() {
			t.Error("a tick writes to stored data and must be gated")
		}
	})
}

// Saying "none" is not the same as saying nothing: silence reads to the model
// as habits simply not having been mentioned, which is how a request to tick
// one ends up answered with a remark about the calendar.
func TestRenderHabits(t *testing.T) {
	t.Run("no habits says so", func(t *testing.T) {
		if !strings.Contains(plan.RenderHabits(nil, "2026-08-15"), "not tracking") {
			t.Errorf("render = %q", plan.RenderHabits(nil, "2026-08-15"))
		}
	})

	t.Run("habits are rendered with ids the model can copy", func(t *testing.T) {
		rendered := plan.RenderHabits([]plan.Habit{
			{ID: "h1", Name: "Read", Done: false},
			{ID: "h2", Name: "Run", Done: true},
		}, "2026-08-15")

		for _, want := range []string{"[h1]", "Read", "not done", "[h2]", "Run", "done", "2026-08-15"} {
			if !strings.Contains(rendered, want) {
				t.Errorf("missing %q in:\n%s", want, rendered)
			}
		}
	})
}
