import { useCallback, useEffect, useState } from 'react';
import { AFButton, AFEmptyState, AFHint, AFPanel } from '../../components/AF';
import { useSession } from '../../app/session';
import type { HabitRow } from '../../data/db';
import { categoryTones, toneColor } from '../calendar/categories';
import {
  completionOver,
  deleteHabit,
  listHabits,
  readDay,
  rangeLength,
  saveHabit,
  toggleHabit,
  type Completion,
  type Range,
} from './store';
import { dayLabel, jakartaDayKey, msUntilJakartaMidnight } from './time';
import './habits.css';

const ranges: Range[] = ['year', 'month', 'week', 'threeDay', 'day'];
const rangeShort: Record<Range, string> = {
  year: 'Y',
  month: 'M',
  week: 'W',
  threeDay: '3D',
  day: 'D',
};

/**
 * reAFresh · Habits.
 *
 * Days are cut at midnight **Jakarta**, not in the browser's zone — see
 * `time.ts`. The label on a row is derived from its key rather than stored, so
 * a record written yesterday reads as "Yesterday" today and as its date
 * tomorrow, without anything being renamed in storage.
 */
export function HabitsScreen() {
  const { revision, requestSync } = useSession();

  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [today, setToday] = useState(() => jakartaDayKey());
  const [done, setDone] = useState<Set<string>>(new Set());
  const [range, setRange] = useState<Range>('week');
  const [completion, setCompletion] = useState<Completion[]>([]);
  const [editing, setEditing] = useState<HabitRow | 'new' | null>(null);

  const reload = useCallback(async () => {
    const list = await listHabits();
    setHabits(list);
    setDone(new Set((await readDay(today))?.completed ?? []));
    setCompletion(await completionOver(range));
  }, [today, range]);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  /**
   * Rolls the day over on the boundary rather than polling for it.
   *
   * A timer that sleeps until midnight costs nothing and lands on it exactly;
   * a one-minute poll is both wasteful and up to a minute late, which is
   * visible when the label under your cursor is still saying "Today".
   */
  useEffect(() => {
    const timer = setTimeout(() => setToday(jakartaDayKey()), msUntilJakartaMidnight() + 500);
    return () => clearTimeout(timer);
  }, [today]);

  const after = useCallback(
    async (action: () => Promise<unknown>) => {
      await action();
      await reload();
      requestSync();
    },
    [reload, requestSync],
  );

  return (
    <div className="page hab">
      <header className="page__head">
        <span className="af-brand">reAFresh · Habits</span>
        <span className="page__spacer" />
        <AFButton label="New habit" onClick={() => setEditing('new')} />
      </header>

      <AFPanel label={dayLabel(today, today)} count={`${done.size}/${habits.length}`}>
        {habits.length === 0 ? (
          <AFEmptyState glyph="◈" message={'No habits yet.\nAdd one to start counting.'} />
        ) : (
          <ul className="hab__list">
            {habits.map((habit) => {
              const ticked = done.has(habit.id);
              return (
                <li key={habit.id}>
                  <div className="hab__row">
                    <button
                      type="button"
                      className={`hab__tick${ticked ? ' is-done' : ''}`}
                      style={{ borderColor: toneColor(habit.toneIndex), background: ticked ? toneColor(habit.toneIndex) : 'transparent' }}
                      aria-pressed={ticked}
                      aria-label={`${ticked ? 'Untick' : 'Tick'} ${habit.name}`}
                      onClick={() => void after(() => toggleHabit(habit.id, today))}
                    />
                    <span className={`af-body${ticked ? ' hab__done' : ''}`}>{habit.name}</span>
                    <span className="hab__row-actions">
                      <AFButton label="Edit" variant="quiet" onClick={() => setEditing(habit)} />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </AFPanel>

      <AFPanel
        label="Completion"
        countSlot={
          <span className="hab__ranges">
            {ranges.map((option) => (
              <button
                key={option}
                type="button"
                className={`cal__view${range === option ? ' is-active' : ''}`}
                onClick={() => setRange(option)}
              >
                {rangeShort[option]}
              </button>
            ))}
          </span>
        }
      >
        {habits.length === 0 ? (
          <AFHint>Add a habit and this fills in.</AFHint>
        ) : (
          <>
            <div className="hab__chart" role="img" aria-label={`Completion over ${rangeLength[range]} days`}>
              {[...completion].reverse().map((day) => (
                <span
                  key={day.day}
                  className="hab__bar"
                  style={{ height: `${Math.max(day.fraction * 100, 2)}%` }}
                  title={`${day.day} — ${Math.round(day.fraction * 100)}%`}
                />
              ))}
            </div>
            <AFHint>
              {Math.round(
                (completion.reduce((sum, day) => sum + day.fraction, 0) /
                  Math.max(completion.length, 1)) *
                  100,
              )}
              % over the last {rangeLength[range]} days
            </AFHint>
          </>
        )}
      </AFPanel>

      {editing && (
        <HabitEditor
          habit={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={(name, tone) =>
            void after(async () => {
              await saveHabit(name, tone, editing === 'new' ? undefined : editing.id);
              setEditing(null);
            })
          }
          onDelete={
            editing === 'new'
              ? undefined
              : () =>
                  void after(async () => {
                    await deleteHabit(editing.id);
                    setEditing(null);
                  })
          }
        />
      )}
    </div>
  );
}

function HabitEditor({
  habit,
  onSave,
  onCancel,
  onDelete,
}: {
  habit: HabitRow | null;
  onSave: (name: string, toneIndex: number) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(habit?.name ?? '');
  const [tone, setTone] = useState(habit?.toneIndex ?? 1);

  return (
    <div className="cal__overlay" role="dialog" aria-label="Habit">
      <AFPanel label={habit ? 'Edit habit' : 'New habit'} className="cal__editor">
        <label className="af-panel-label" htmlFor="habit-name">Name</label>
        <input
          id="habit-name"
          className="af-input af-input--prose"
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />

        <span className="af-panel-label">Colour</span>
        <div className="hab__tones">
          {categoryTones.map((option, index) => (
            <button
              key={option.name}
              type="button"
              className={`hab__tone${tone === index ? ' is-active' : ''}`}
              style={{ background: toneColor(index) }}
              aria-label={option.name}
              onClick={() => setTone(index)}
            />
          ))}
        </div>

        <div className="cal__editor-actions">
          <AFButton label="Cancel" variant="quiet" onClick={onCancel} />
          {onDelete && <AFButton label="Delete" variant="ghost" onClick={onDelete} />}
          <AFButton label="Save" disabled={!name.trim()} onClick={() => onSave(name, tone)} />
        </div>
      </AFPanel>
    </div>
  );
}
