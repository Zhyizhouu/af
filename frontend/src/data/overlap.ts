import { dayFromKey, jakartaOffsetMs } from '../programs/habits/time';
import { readUpcomingEvents, type AgendaEntry } from './agenda';
import type { TodoItemRow } from './db';
import { normalizeTime } from './todoTime';

const DAY_MS = 24 * 60 * 60 * 1000;
/** The span given to an entry with no duration, so it has a block to draw. */
export const NOMINAL_MS = 30 * 60 * 1000;

const startOf = (day: string): number => dayFromKey(day).getTime() - jakartaOffsetMs;

/** The instant of a Jakarta wall-clock `time` (`HH:MM`) on a Jakarta `day`. */
export function todoInstantOrNull(day: string, time: string): Date | null {
  const valid = normalizeTime(time);
  if (!valid) return null;
  const [hours, minutes] = valid.split(':').map(Number);
  const at = startOf(day) + ((hours ?? 0) * 60 + (minutes ?? 0)) * 60 * 1000;
  return Number.isNaN(at) ? null : new Date(at);
}

export function todoInstant(day: string, time: string): Date {
  return todoInstantOrNull(day, time) ?? new Date(startOf(day));
}

/** When an entry stops occupying time. A proctor session has no duration, so
 *  it is given the same nominal half hour the Calendar draws. */
export const entryEnd = (entry: AgendaEntry): number =>
  Math.max(entry.end.getTime(), entry.start.getTime() + NOMINAL_MS);

/** For each live, timed to-do, the timed entries running at its time, by start.
 *  To-dos with nothing running are left out. */
export function findOverlaps(
  todos: readonly TodoItemRow[],
  entries: readonly AgendaEntry[],
): Map<string, AgendaEntry[]> {
  const found = new Map<string, AgendaEntry[]>();
  const timed = entries.filter((entry) => !entry.allDay).sort((a, b) => a.start.getTime() - b.start.getTime());
  for (const todo of todos) {
    if (todo.deleted || !todo.time) continue;
    const instant = todoInstantOrNull(todo.day, todo.time);
    if (!instant) continue;
    const at = instant.getTime();
    const hits = timed.filter((entry) => entry.start.getTime() <= at && at < entryEnd(entry));
    if (hits.length > 0) found.set(todo.id, hits);
  }
  return found;
}

/** Events and sessions touching the Jakarta days `fromDay` to `toDay`
 *  inclusive, including ones that began up to a day earlier and run into it. */
export async function readEntriesForDays(fromDay: string, toDay: string): Promise<AgendaEntry[]> {
  const from = startOf(fromDay);
  const to = startOf(toDay) + DAY_MS;
  const entries = await readUpcomingEvents(from - DAY_MS, to);
  return entries.filter((entry) => entry.start.getTime() < to && entryEnd(entry) > from);
}
