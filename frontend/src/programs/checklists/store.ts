import { db, type ChecklistItemRow, type ProctorSessionRow } from '../../data/db';
import { templateFor } from './template';

/**
 * Proctor sessions and their checklists.
 *
 * A session is created with its checklist already seeded from the template, so
 * there is no state where a session exists with nothing to tick.
 */

/**
 * How long after a session starts it is swept into the archive.
 *
 * Measured from **start**, the only timestamp a session carries — so a long UAS
 * beginning at 08:00 archives at 12:00 regardless of when it actually ended.
 * A manual reopen sets `reopened` and is exempt, which is the escape hatch for
 * exactly that case.
 */
export const archiveAfterMs = 4 * 60 * 60 * 1000;

export async function createSession(input: {
  type: string;
  dateTime: Date;
  room: string;
  courseCode: string;
  courseName: string;
  courseClass: string;
}): Promise<ProctorSessionRow> {
  const now = Date.now();
  const session: ProctorSessionRow = {
    id: crypto.randomUUID(),
    type: input.type.toUpperCase(),
    dateTime: input.dateTime.getTime(),
    room: input.room,
    courseCode: input.courseCode,
    courseName: input.courseName,
    courseClass: input.courseClass,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    deleted: false,
    reopened: false,
  };

  await db().proctorSessions.put(session);
  await db().checklistItems.bulkPut(
    templateFor(session.type).map((item, index) => ({
      id: crypto.randomUUID(),
      sessionId: session.id,
      label: item.label,
      section: item.section,
      isChecked: false,
      sortOrder: index,
      updatedAt: now,
      deleted: false,
    })),
  );

  return session;
}

/**
 * Sessions of one status, newest first, after running the archive sweep.
 *
 * The sweep runs on read rather than on a timer: there is no background worker
 * in a browser tab, and the only moment the answer matters is when somebody is
 * looking at the list.
 */
export async function listSessions(status: 'active' | 'archived'): Promise<ProctorSessionRow[]> {
  await archiveStale();
  const rows = await db()
    .proctorSessions.filter((row) => !row.deleted && row.status === status)
    .toArray();
  return rows.sort((a, b) => b.dateTime - a.dateTime);
}

export async function archiveStale(now: Date = new Date()): Promise<void> {
  const cutoff = now.getTime() - archiveAfterMs;
  const stale = await db()
    .proctorSessions.filter(
      (row) =>
        !row.deleted && row.status === 'active' && !row.reopened && row.dateTime < cutoff,
    )
    .toArray();

  if (stale.length === 0) return;
  await db().proctorSessions.bulkPut(
    stale.map((row) => ({ ...row, status: 'archived', updatedAt: Date.now() })),
  );
}

export const getSession = (id: string) => db().proctorSessions.get(id);

export async function setSessionStatus(
  id: string,
  status: 'active' | 'archived',
): Promise<void> {
  const session = await db().proctorSessions.get(id);
  if (!session) return;
  await db().proctorSessions.put({
    ...session,
    status,
    // Reopening exempts it from the sweep, or it would archive itself again on
    // the next read and nothing would appear to have happened.
    reopened: status === 'active' ? true : session.reopened,
    updatedAt: Date.now(),
  });
}

/**
 * Tombstones the session and cascades to its items under one timestamp.
 *
 * One timestamp so the whole deletion reconciles as a single event: a cascade
 * spread across several milliseconds can interleave with another device's write
 * and leave orphaned items behind.
 */
export async function deleteSession(id: string): Promise<void> {
  const now = Date.now();
  const session = await db().proctorSessions.get(id);
  if (!session || session.deleted) return;

  const items = await db().checklistItems.where('sessionId').equals(id).toArray();

  await db().proctorSessions.put({ ...session, deleted: true, updatedAt: now });
  await db().checklistItems.bulkPut(
    items.map((item) => ({ ...item, deleted: true, updatedAt: now })),
  );
}

export async function listItems(sessionId: string): Promise<ChecklistItemRow[]> {
  const items = await db().checklistItems.where('sessionId').equals(sessionId).toArray();
  return items.filter((item) => !item.deleted).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function toggleItem(id: string): Promise<void> {
  const item = await db().checklistItems.get(id);
  if (!item) return;
  await db().checklistItems.put({
    ...item,
    isChecked: !item.isChecked,
    updatedAt: Date.now(),
  });
}

/** Items grouped by section, in template order, sections in first-seen order. */
export function bySection(items: ChecklistItemRow[]): [string, ChecklistItemRow[]][] {
  const groups = new Map<string, ChecklistItemRow[]>();
  for (const item of items) {
    const group = groups.get(item.section);
    if (group) group.push(item);
    else groups.set(item.section, [item]);
  }
  return [...groups.entries()];
}

export const sessionLabel = (session: ProctorSessionRow): string =>
  [session.courseCode, session.courseName, session.courseClass].filter(Boolean).join(' · ');
