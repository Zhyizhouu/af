import { db, type CalendarEventRow } from '../../data/db';

/** Midnight on the same day — the key entries are bucketed by. */
export const dayKey = (value: Date): Date =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

export const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const daysInMonth = (year: number, month: number): number =>
  new Date(year, month + 1, 0).getDate();

export type CalendarView = 'year' | 'month' | 'week' | 'threeDay' | 'day';

export const viewLabels: Record<CalendarView, { label: string; short: string }> = {
  year: { label: 'Year', short: 'Y' },
  month: { label: 'Month', short: 'M' },
  week: { label: 'Week', short: 'W' },
  threeDay: { label: '3 Day', short: '3D' },
  day: { label: 'Day', short: 'D' },
};

/** Whether a view lays days against a time axis rather than as a date grid. */
export const isTimeGrid = (view: CalendarView): boolean =>
  view === 'day' || view === 'threeDay' || view === 'week';

/** The inclusive span of days a view shows around an anchor. */
export function visibleRange(view: CalendarView, anchor: Date): { start: Date; end: Date } {
  const day = dayKey(anchor);
  switch (view) {
    case 'day':
      return { start: day, end: day };
    case 'threeDay':
      return { start: day, end: addDays(day, 2) };
    case 'week': {
      const monday = addDays(day, -((day.getDay() + 6) % 7));
      return { start: monday, end: addDays(monday, 6) };
    }
    case 'month':
      return {
        start: new Date(day.getFullYear(), day.getMonth(), 1),
        end: new Date(day.getFullYear(), day.getMonth(), daysInMonth(day.getFullYear(), day.getMonth())),
      };
    case 'year':
      return { start: new Date(day.getFullYear(), 0, 1), end: new Date(day.getFullYear(), 11, 31) };
  }
}

export function addDays(day: Date, count: number): Date {
  const next = new Date(day);
  next.setDate(next.getDate() + count);
  return next;
}

/** Moves the anchor one page in the view's own unit. */
export function stepAnchor(view: CalendarView, anchor: Date, direction: number): Date {
  switch (view) {
    case 'day':
      return addDays(anchor, direction);
    case 'threeDay':
      return addDays(anchor, 3 * direction);
    case 'week':
      return addDays(anchor, 7 * direction);
    case 'month': {
      const target = new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
      // Clamped so paging off the 31st does not skip a month.
      const day = Math.min(anchor.getDate(), daysInMonth(target.getFullYear(), target.getMonth()));
      return new Date(target.getFullYear(), target.getMonth(), day);
    }
    case 'year': {
      const year = anchor.getFullYear() + direction;
      const day = Math.min(anchor.getDate(), daysInMonth(year, anchor.getMonth()));
      return new Date(year, anchor.getMonth(), day);
    }
  }
}

export async function saveEvent(input: {
  id?: string;
  title: string;
  start: Date;
  end: Date;
  notes?: string;
  allDay?: boolean;
  category?: string;
  reminderMinutes?: number;
}): Promise<CalendarEventRow> {
  const now = Date.now();
  const existing = input.id ? await db().calendarEvents.get(input.id) : undefined;

  const row: CalendarEventRow = {
    id: input.id ?? crypto.randomUUID(),
    title: input.title,
    notes: input.notes ?? '',
    start: input.start.getTime(),
    end: input.end.getTime(),
    allDay: input.allDay ?? false,
    category: input.category ?? 'other',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deleted: false,
    reminderMinutes: input.reminderMinutes ?? existing?.reminderMinutes ?? 0,
  };

  await db().calendarEvents.put(row);
  return row;
}

export async function deleteEvent(id: string): Promise<void> {
  const existing = await db().calendarEvents.get(id);
  if (!existing || existing.deleted) return;
  await db().calendarEvents.put({ ...existing, deleted: true, updatedAt: Date.now() });
}

/**
 * Lays overlapping entries out in columns.
 *
 * Entries that share time are clustered, and every entry in a cluster is given
 * the same number of columns — so blocks line up in a grid rather than
 * staggering, which is what makes a busy morning readable at a glance.
 */
export interface Placed<T> {
  entry: T;
  column: number;
  columns: number;
}

export function packColumns<T>(
  entries: T[],
  startOf: (entry: T) => number,
  endOf: (entry: T) => number,
): Placed<T>[] {
  // A proctor session is a point in time, so its end equals its start. Given
  // its true end, such an entry frees its column the instant it claims it and
  // the next one lands on top of it — so every entry occupies at least a
  // sliver, for placement purposes only.
  const occupiedUntil = (entry: T) => Math.max(endOf(entry), startOf(entry) + 1);

  const sorted = [...entries].sort((a, b) => startOf(a) - startOf(b) || endOf(a) - endOf(b));
  const placed: Placed<T>[] = [];

  let cluster: T[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const columnEnds: number[] = [];
    const assigned = cluster.map((entry) => {
      let column = columnEnds.findIndex((end) => end <= startOf(entry));
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(0);
      }
      columnEnds[column] = occupiedUntil(entry);
      return { entry, column };
    });
    for (const item of assigned) {
      placed.push({ ...item, columns: columnEnds.length });
    }
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const entry of sorted) {
    if (cluster.length > 0 && startOf(entry) >= clusterEnd) flush();
    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, occupiedUntil(entry));
  }
  flush();

  return placed;
}
