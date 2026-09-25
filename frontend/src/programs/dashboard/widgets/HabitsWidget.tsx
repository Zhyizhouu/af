import { useCallback, useEffect, useState } from 'react';
import { Checkbox } from '../../../components/ui/checkbox';
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
    <div className="flex h-full flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">{`Habits ${dayLabel(today, today).toLowerCase()}`}</h2>
        <span className="text-xs text-muted-foreground">
          {done.size}/{habits.length}
        </span>
      </div>

      {habits.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No habits yet. Add one in Habits.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {habits.map((habit) => {
            const ticked = done.has(habit.id);
            return (
              <li key={habit.id} className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: toneColor(habit.toneIndex) }} />
                <Checkbox
                  checked={ticked}
                  onCheckedChange={() =>
                    void (async () => {
                      await toggleHabit(habit.id, today);
                      await reload();
                      requestSync();
                    })()
                  }
                  aria-label={habit.name}
                />
                <span className="min-w-0 flex-1 truncate text-sm">{habit.name}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
