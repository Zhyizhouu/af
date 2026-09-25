import { useCallback, useEffect, useState } from 'react';
import { cn } from 'cn';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { useSession } from '../../app/session';
import type { HabitRow } from '../../data/db';
import { categoryTones, toneColor } from '../../data/tones';
import { segmentColors, trendColor, trendLabel, trendOf, trendSoftColor } from '../dashboard/widgets/trend';
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
 * Days are cut at midnight **Jakarta**, not in the browser's zone (see
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

  const chronological = [...completion].reverse();
  const fractions = chronological.map((day) => day.fraction);
  const kinds = segmentColors(fractions);
  const trend = trendOf(fractions);
  const avgPct = Math.round(
    (completion.reduce((sum, day) => sum + day.fraction, 0) / Math.max(completion.length, 1)) * 100,
  );
  const trendKindColor = trendColor(trend.kind);
  const trendSoft = trendSoftColor(trend.kind);
  const chipLabel = trendLabel(trend.kind, trend.deltaPts, rangeLength[range] <= 7 ? 7 : 30, avgPct);

  return (
    <div className="page px-4! py-4! md:px-8! md:py-6! font-sans text-foreground">
      <div className="flex items-center gap-2">
        <span className="page__spacer" />
        <Button variant="gradient" className="max-md:h-11" onClick={() => setEditing('new')}>
          <Plus size={16} aria-hidden />
          New habit
        </Button>
      </div>

      <div className="surface-3d rounded-2xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[15px] font-semibold">{dayLabel(today, today)}</span>
          <span className="text-xs text-muted-foreground">
            {done.size}/{habits.length}
          </span>
        </div>

        {habits.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No habits yet. Add one to start counting.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {habits.map((habit) => {
              const ticked = done.has(habit.id);
              return (
                <li key={habit.id} className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                    style={{ background: toneColor(habit.toneIndex) }}
                  />
                  <Checkbox
                    checked={ticked}
                    onCheckedChange={() => void after(() => toggleHabit(habit.id, today))}
                    aria-label={`${ticked ? 'Untick' : 'Tick'} ${habit.name}`}
                  />
                  <span className={cn('min-w-0 flex-1 text-sm', ticked && 'text-muted-foreground line-through')}>
                    {habit.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${habit.name}`}
                    onClick={() => setEditing(habit)}
                  >
                    <Pencil size={14} aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="surface-3d rounded-2xl p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[15px] font-semibold">Completion</span>
            {habits.length > 0 && (
              <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 text-xs font-medium">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: trendKindColor, boxShadow: `0 0 8px ${trendSoft}` }}
                />
                <span style={{ color: trendKindColor }}>{chipLabel}</span>
              </span>
            )}
          </div>
          <span role="group" aria-label="Range" className="inline-flex gap-0.5 rounded-[10px] border border-white/[0.07] bg-[#050506] p-[3px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]">
            {ranges.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={range === option}
                className={cn(
                  'h-7 rounded-[7px] px-2.5 text-xs font-medium transition-colors',
                  range === option ? 'glow-active text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setRange(option)}
              >
                {rangeShort[option]}
              </button>
            ))}
          </span>
        </div>

        {habits.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Add a habit and this fills in.</p>
        ) : (
          <>
            <div
              className="inset-field flex h-[260px] items-end gap-[2px] overflow-hidden rounded-xl p-2"
              role="img"
              aria-label={`Completion over ${rangeLength[range]} days`}
            >
              {chronological.map((day, index) => (
                <span
                  key={day.day}
                  className="min-w-px flex-1 rounded-t-sm transition-[height] duration-200 ease-out"
                  style={{
                    height: `${Math.max(day.fraction * 100, 2)}%`,
                    background: trendColor(kinds[index] ?? 'flat'),
                  }}
                  title={`${day.day} — ${Math.round(day.fraction * 100)}%`}
                />
              ))}
            </div>
            <p className="mt-2 text-[13px] text-muted-foreground">
              {avgPct}% over the last {rangeLength[range]} days
            </p>
          </>
        )}
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="surface-3d rounded-2xl">
          <HabitEditor
            habit={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSave={(name, tone) =>
              void after(async () => {
                await saveHabit(name, tone, editing === 'new' ? undefined : editing!.id);
                setEditing(null);
              })
            }
            onDelete={
              editing === 'new' || editing === null
                ? undefined
                : () =>
                    void after(async () => {
                      await deleteHabit(editing.id);
                      setEditing(null);
                    })
            }
          />
        </DialogContent>
      </Dialog>
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
    <>
      <DialogHeader>
        <DialogTitle>{habit ? 'Edit habit' : 'New habit'}</DialogTitle>
      </DialogHeader>

      <label className="text-xs font-medium text-muted-foreground" htmlFor="habit-name">
        Name
      </label>
      <Input
        id="habit-name"
        className="inset-field rounded-[10px]"
        value={name}
        autoFocus
        onChange={(event) => setName(event.target.value)}
      />

      <span className="text-xs font-medium text-muted-foreground">Colour</span>
      <div className="flex flex-wrap gap-2">
        {categoryTones.map((option, index) => (
          <button
            key={option.name}
            type="button"
            className={cn(
              'h-6 w-6 rounded-md border-2 border-transparent',
              tone === index && 'border-white',
            )}
            style={{ background: toneColor(index) }}
            aria-label={option.name}
            aria-pressed={tone === index}
            onClick={() => setTone(index)}
          />
        ))}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {onDelete && (
          <Button variant="ghost" className="text-destructive" onClick={onDelete}>
            Delete
          </Button>
        )}
        <Button variant="gradient" disabled={!name.trim()} onClick={() => onSave(name, tone)}>
          Save
        </Button>
      </div>
    </>
  );
}
