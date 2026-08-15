import { db, type HabitDayRow, type HabitRow } from '../../data/db';
import { jakartaDayKey, recentDayKeys } from './time';

/** Habits, in display order, tombstones excluded. */
export async function listHabits(): Promise<HabitRow[]> {
  const habits = await db().habits.filter((row) => !row.deleted).toArray();
  return habits.sort(
    // Same slot after a reorder race: fall back to creation, so the order is
    // never non-deterministic between two devices.
    (a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt,
  );
}

export async function saveHabit(
  name: string,
  toneIndex: number,
  id?: string,
): Promise<HabitRow> {
  const now = Date.now();
  const existing = id ? await db().habits.get(id) : undefined;
  const count = existing ? 0 : (await db().habits.count());

  const row: HabitRow = {
    id: id ?? crypto.randomUUID(),
    name: name.trim() || 'Untitled',
    toneIndex,
    sortOrder: existing?.sortOrder ?? count,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deleted: false,
  };
  await db().habits.put(row);
  return row;
}

/**
 * Tombstones the habit.
 *
 * Its marks are left in place on each day record rather than swept out of them:
 * a sweep would be a write to every day the habit was ever ticked, and the
 * reader filters against the live habit list anyway.
 */
export async function deleteHabit(id: string): Promise<void> {
  const existing = await db().habits.get(id);
  if (!existing || existing.deleted) return;
  await db().habits.put({ ...existing, deleted: true, updatedAt: Date.now() });
}

export const readDay = (day: string): Promise<HabitDayRow | undefined> =>
  db().habitDays.get(day);

export async function readDays(days: string[]): Promise<Map<string, HabitDayRow>> {
  const rows = await db().habitDays.bulkGet(days);
  return new Map(
    rows.filter((row): row is HabitDayRow => row !== undefined).map((row) => [row.day, row]),
  );
}

/** Ticks or unticks one habit on one day. */
export async function toggleHabit(habitId: string, day: string): Promise<void> {
  const existing = await db().habitDays.get(day);
  const completed = new Set(existing?.completed ?? []);
  if (completed.has(habitId)) completed.delete(habitId);
  else completed.add(habitId);

  await db().habitDays.put({
    day,
    completed: [...completed],
    updatedAt: Date.now(),
  });
}

export type Range = 'year' | 'month' | 'week' | 'threeDay' | 'day';

export const rangeLength: Record<Range, number> = {
  year: 365,
  month: 30,
  week: 7,
  threeDay: 3,
  day: 1,
};

export interface Completion {
  day: string;
  /** 0–1. Zero habits reads as zero rather than as a division by nothing. */
  fraction: number;
}

/**
 * Completion per day over a range.
 *
 * Marks belonging to deleted habits are filtered rather than counted — see
 * [deleteHabit] for why they are still in the record.
 */
export async function completionOver(
  range: Range,
  now: Date = new Date(),
): Promise<Completion[]> {
  const habits = await listHabits();
  const live = new Set(habits.map((habit) => habit.id));
  const days = recentDayKeys(rangeLength[range], now);
  const records = await readDays(days);

  return days.map((day) => {
    const ticked = (records.get(day)?.completed ?? []).filter((id) => live.has(id));
    return {
      day,
      fraction: habits.length === 0 ? 0 : ticked.length / habits.length,
    };
  });
}

export const todayKey = (now?: Date) => jakartaDayKey(now);

/**
 * The habits as the assistant is shown them: id, name, done today.
 *
 * Lives here rather than in the AI program because this file owns what a habit
 * is — the same reason `readAgenda` lives beside the calendar.
 */
export async function readHabitsForAssistant(
  now?: Date,
): Promise<{ id: string; name: string; done: boolean }[]> {
  const day = todayKey(now);
  const [habits, record] = await Promise.all([listHabits(), readDay(day)]);
  const done = new Set(record?.completed ?? []);
  return habits.map((habit) => ({
    id: habit.id,
    name: habit.name,
    done: done.has(habit.id),
  }));
}

/**
 * Sets a habit's mark to exactly `done`, rather than flipping it.
 *
 * [toggleHabit] is right for a checkbox, where the person can see the current
 * state. A confirmed proposal says what it wants the state to *be*, and by the
 * time it is confirmed the day record may have changed underneath it — so
 * applying a flip there could land on the opposite of what the card said.
 */
export async function setHabitDone(
  habitId: string,
  day: string,
  done: boolean,
): Promise<void> {
  const existing = await db().habitDays.get(day);
  const completed = new Set(existing?.completed ?? []);
  if (done) completed.add(habitId);
  else completed.delete(habitId);

  await db().habitDays.put({
    day,
    completed: [...completed],
    updatedAt: Date.now(),
  });
}
