import { useCallback, useEffect, useState } from 'react';
import { AFHint, AFPanel } from '../../../components/AF';
import { useSession } from '../../../app/session';
import { listHabits, readDay, toggleHabit, todayKey } from '../../habits/store';
import { dayLabel } from '../../habits/time';
import { toneColor } from '../../../data/tones';
import type { HabitRow } from '../../../data/db';

export function HabitsWidget() {
  const { revision, requestSync } = useSession();
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const today = todayKey();

  const reload = useCallback(async () => {
    setHabits(await listHabits());
    setDone(new Set((await readDay(today))?.completed ?? []));
  }, [today]);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  return (
    <AFPanel label={`Habits ${dayLabel(today, today).toLowerCase()}`} count={`${done.size}/${habits.length}`}>
      {habits.length === 0 ? (
        <AFHint>No habits yet. Add one in Habits.</AFHint>
      ) : (
        <ul className="dash__habits">
          {habits.map((habit) => {
            const ticked = done.has(habit.id);
            return (
              <li key={habit.id}>
                <button
                  type="button"
                  className={`dash__habit${ticked ? ' is-done' : ''}`}
                  aria-pressed={ticked}
                  onClick={() =>
                    void (async () => {
                      await toggleHabit(habit.id, today);
                      await reload();
                      requestSync();
                    })()
                  }
                >
                  <span
                    className="dash__tick"
                    style={{
                      borderColor: toneColor(habit.toneIndex),
                      background: ticked ? toneColor(habit.toneIndex) : 'transparent',
                    }}
                  />
                  <span className="af-body">{habit.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </AFPanel>
  );
}
