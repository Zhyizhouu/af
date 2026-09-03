import { db, type CalendarEventRow, type ProctorSessionRow } from './db';

/**
 * The merged agenda: calendar events and proctor sessions in one list.
 *
 * A port of `AgendaEntry` — the Calendar shows both, the dashboard shows both,
 * and the assistant reads both, so the merge lives here rather than in any of
 * them.
 */

export type AgendaKind = 'event' | 'session';

export interface AgendaEntry {
  kind: AgendaKind;
  id: string;
  title: string;
  subtitle: string;
  start: Date;
  end: Date;
  allDay: boolean;
  category: string;
  finished: boolean;
  /** Minutes before `start` to remind, 0 for none. */
  reminderMinutes: number;
}

export const entryFromEvent = (row: CalendarEventRow): AgendaEntry => ({
  kind: 'event',
  id: row.id,
  title: row.title,
  subtitle: row.notes,
  start: new Date(row.start),
  end: new Date(row.end),
  allDay: row.allDay,
  category: row.category,
  finished: false,
  reminderMinutes: row.reminderMinutes,
});

export const entryFromSession = (row: ProctorSessionRow): AgendaEntry => ({
  kind: 'session',
  id: row.id,
  title: `${row.type} · Room ${row.room}`,
  subtitle: [row.courseCode, row.courseName, row.courseClass].filter(Boolean).join(' · '),
  start: new Date(row.dateTime),
  // Proctor sessions carry no duration; treat them as a point in time.
  end: new Date(row.dateTime),
  allDay: false,
  category: '',
  finished: row.status === 'archived',
  reminderMinutes: row.reminderMinutes,
});

export async function readAgenda(): Promise<AgendaEntry[]> {
  const [events, sessions] = await Promise.all([
    db().calendarEvents.filter((row) => !row.deleted).toArray(),
    db().proctorSessions.filter((row) => !row.deleted).toArray(),
  ]);

  return [...events.map(entryFromEvent), ...sessions.map(entryFromSession)].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
}

export async function readSessionsById(): Promise<Map<string, ProctorSessionRow>> {
  const sessions = await db().proctorSessions.filter((row) => !row.deleted).toArray();
  return new Map(sessions.map((row) => [row.id, row]));
}
