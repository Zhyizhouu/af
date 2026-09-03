import { db, type CalendarEventRow, type ProctorSessionRow, type TaskPageRow, type TaskPropertyRow } from './db';

/**
 * The merged agenda: calendar events and proctor sessions in one list.
 *
 * A port of `AgendaEntry` — the Calendar shows both, the dashboard shows both,
 * and the assistant reads both, so the merge lives here rather than in any of
 * them.
 */

export type AgendaKind = 'event' | 'session' | 'task';

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

/**
 * One entry per (page, date-property) pair — a page with two date properties
 * set shows up twice, each under its own property name as the subtitle,
 * because each is a distinct commitment the page is making. `finished` is
 * resolved by the caller, which has the full property list on hand.
 */
export const entryFromTaskPage = (page: TaskPageRow, property: TaskPropertyRow, finished: boolean): AgendaEntry => {
  const when = new Date(page.values[property.id] as number);
  return {
    kind: 'task',
    id: `${page.id}:${property.id}`,
    title: page.title,
    subtitle: property.name,
    start: when,
    end: when,
    allDay: true,
    category: '',
    finished,
    reminderMinutes: 0,
  };
};

/** True when the page's Status-type property (if it has one) resolves to an
 *  option labelled "Done" — the same word Task Tracker's own seeded default
 *  uses (`programs/tasks/store.ts`'s `seedDefaultProperties`). */
const isPageDone = (page: TaskPageRow, properties: TaskPropertyRow[]): boolean => {
  const status = properties.find((property) => property.type === 'status');
  if (!status) return false;
  const option = status.options.find((candidate) => candidate.id === page.values[status.id]);
  return option?.label.trim().toLowerCase() === 'done';
};

export async function readAgenda(): Promise<AgendaEntry[]> {
  const [events, sessions, properties, pages] = await Promise.all([
    db().calendarEvents.filter((row) => !row.deleted).toArray(),
    db().proctorSessions.filter((row) => !row.deleted).toArray(),
    db().taskProperties.filter((row) => !row.deleted).toArray(),
    db().taskPages.filter((row) => !row.deleted).toArray(),
  ]);

  const dateProperties = properties.filter((property) => property.type === 'date');
  const taskEntries: AgendaEntry[] = [];
  for (const page of pages) {
    const finished = isPageDone(page, properties);
    for (const property of dateProperties) {
      if (typeof page.values[property.id] !== 'number') continue;
      taskEntries.push(entryFromTaskPage(page, property, finished));
    }
  }

  return [...events.map(entryFromEvent), ...sessions.map(entryFromSession), ...taskEntries].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
}

export async function readSessionsById(): Promise<Map<string, ProctorSessionRow>> {
  const sessions = await db().proctorSessions.filter((row) => !row.deleted).toArray();
  return new Map(sessions.map((row) => [row.id, row]));
}
