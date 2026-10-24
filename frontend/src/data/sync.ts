import {
  Timestamp,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import type { Table } from 'dexie';
import { firestore } from './firebase';
import { readDashboardLayout } from '../programs/dashboard/layout';
import { jakartaDayKey } from '../programs/habits/time';
import {
  db,
  type AfDatabase,
  type AiConversationRow,
  type CalendarEventRow,
  type CategoryRow,
  type ChecklistItemRow,
  type HabitDayRow,
  type HabitRow,
  type ProctorSessionRow,
  type SettingsRow,
  type TaskPageIcon,
  type TaskPageRow,
  type TaskPropertyRow,
  type TaskPropertyType,
  type TodoItemRow,
} from './db';

/**
 * Two-way sync between the local Dexie tables and Firestore.
 *
 * A port of `lib/sync/sync_service.dart`, and deliberately a faithful one: it
 * reads and writes the *same documents* the Flutter app does, under
 * `users/{uid}`. While both apps exist they have to agree on every field name
 * and every shape, or one will quietly delete what the other wrote.
 *
 * Reconciliation is last-write-wins on `updatedAt` with ties going to remote,
 * so two devices converge instead of pushing the same record back and forth.
 * Tombstones rather than deletes, so a deletion on one device propagates
 * instead of being resurrected by the other.
 */

const millis = (value: unknown): number => {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return 0;
};

/** True when the local copy is strictly newer. Ties go to remote. */
const localWins = (localUpdatedAt: number, remote: DocumentData): boolean =>
  localUpdatedAt > millis(remote.updatedAt);

const stamp = (ms: number) => Timestamp.fromMillis(ms);

const userCollection = (uid: string, name: string) =>
  collection(firestore(), 'users', uid, name);

const BATCH_LIMIT = 400;
const BATCH_BYTES = 9_000_000;
const MAX_DOCUMENT_BYTES = 900_000;
const PULL_OVERLAP_MS = 60_000;
const FULL_READ_MS = 24 * 60 * 60 * 1000;

interface SyncTable<Row> {
  toArray(): Promise<Row[]>;
  where(index: 'updatedAt'): { above(value: number): { toArray(): Promise<Row[]> } };
  bulkGet(keys: string[]): Promise<(Row | undefined)[]>;
  bulkPut(rows: Row[]): Promise<unknown>;
}

interface PendingWrite {
  id: string;
  data: DocumentData;
  bytes: number;
}

const pushableSize = (name: string, id: string, data: DocumentData): number | null => {
  let finite = true;
  const json = JSON.stringify(data, function (this: Record<string, unknown>, key, value) {
    const raw = this[key];
    if (raw instanceof Timestamp && !Number.isFinite(raw.toMillis())) finite = false;
    return value;
  });
  if (!finite) {
    console.warn(`sync: skipped ${name}/${id}, a timestamp is not a finite time`);
    return null;
  }
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > MAX_DOCUMENT_BYTES) {
    console.warn(`sync: skipped ${name}/${id}, document is ${bytes} bytes`);
    return null;
  }
  return bytes;
};

/**
 * One pass over one collection.
 *
 * Every table here is keyed by its own id, which is also the document id, so a
 * put covers insert and update alike. (The Flutter build needs a `syncId`
 * indirection for sessions and checklist items because Hive keys are
 * per-device auto-increment integers; IndexedDB lets the record's own id be
 * the key, so the two meet at the same document either way.)
 */
async function syncCollection<Row extends { updatedAt: number }>(
  database: AfDatabase,
  uid: string,
  name: string,
  table: SyncTable<Row>,
  toDocument: (row: Row) => DocumentData,
  fromDocument: (id: string, data: DocumentData) => Row,
  keyOf: (row: Row) => string = (row) => (row as unknown as { id: string }).id,
): Promise<void> {
  const mark = await database.syncMarks.get(name);
  const pushedAt = Date.now();
  const incremental =
    mark !== undefined && mark.syncedAt > 0 && pushedAt - mark.fullAt <= FULL_READ_MS;
  const rows =
    mark && incremental
      ? await table.where('updatedAt').above(mark.pushedAt).toArray()
      : await table.toArray();

  const reference = userCollection(uid, name);
  const remote = await getDocs(
    mark && incremental
      ? query(reference, where('syncedAt', '>', stamp(mark.syncedAt - PULL_OVERLAP_MS)))
      : reference,
  );
  const remoteDocs = new Map(remote.docs.map((snapshot) => [snapshot.id, snapshot.data()]));

  const writes: PendingWrite[] = [];
  for (const row of rows) {
    const id = keyOf(row);
    const data = remoteDocs.get(id);
    if (data && !localWins(row.updatedAt, data)) continue;
    const document = toDocument(row);
    const bytes = pushableSize(name, id, document);
    if (bytes !== null) writes.push({ id, data: document, bytes });
  }

  const pulledIds = [...remoteDocs.keys()];
  let newest = mark?.syncedAt ?? 0;
  for (const data of remoteDocs.values()) newest = Math.max(newest, millis(data.syncedAt));
  if (pulledIds.length) {
    await database.transaction('rw', table as unknown as Table, async () => {
      const current = await table.bulkGet(pulledIds);
      const pulled: Row[] = [];
      pulledIds.forEach((id, index) => {
        const data = remoteDocs.get(id)!;
        const local = current[index];
        if (!local || millis(data.updatedAt) > local.updatedAt) pulled.push(fromDocument(id, data));
      });
      if (pulled.length) await table.bulkPut(pulled);
    });
  }

  const batches: PendingWrite[][] = [];
  let batchBytes = 0;
  for (const write of writes) {
    const last = batches[batches.length - 1];
    if (!last || last.length >= BATCH_LIMIT || batchBytes + write.bytes > BATCH_BYTES) {
      batches.push([write]);
      batchBytes = write.bytes;
    } else {
      last.push(write);
      batchBytes += write.bytes;
    }
  }
  for (const group of batches) {
    const batch = writeBatch(firestore());
    for (const { id, data } of group) {
      batch.set(doc(reference, id), { ...data, syncedAt: serverTimestamp() });
    }
    await batch.commit();
  }

  await database.syncMarks.put({
    name,
    syncedAt: newest,
    pushedAt,
    fullAt: incremental && mark ? mark.fullAt : Date.now(),
  });
}

const eventToDocument = (row: CalendarEventRow): DocumentData => ({
  title: row.title,
  notes: row.notes,
  start: stamp(row.start),
  end: stamp(row.end),
  allDay: row.allDay,
  category: row.category,
  createdAt: stamp(row.createdAt),
  updatedAt: stamp(row.updatedAt),
  deleted: row.deleted,
  reminderMinutes: row.reminderMinutes,
});

const eventFromDocument = (id: string, data: DocumentData): CalendarEventRow => ({
  id,
  title: String(data.title ?? ''),
  notes: String(data.notes ?? ''),
  start: millis(data.start),
  end: millis(data.end),
  allDay: Boolean(data.allDay),
  category: String(data.category ?? 'other'),
  createdAt: millis(data.createdAt),
  updatedAt: millis(data.updatedAt),
  deleted: Boolean(data.deleted),
  // Absent on a document written before this existed, or by the Flutter
  // build, which does not know about reminders at all.
  reminderMinutes: Number(data.reminderMinutes ?? 0),
});

const sessionToDocument = (row: ProctorSessionRow): DocumentData => ({
  type: row.type,
  dateTime: stamp(row.dateTime),
  room: row.room,
  courseCode: row.courseCode,
  courseName: row.courseName,
  courseClass: row.courseClass,
  status: row.status,
  createdAt: stamp(row.createdAt),
  updatedAt: stamp(row.updatedAt),
  deleted: row.deleted,
  reopened: row.reopened,
  reminderMinutes: row.reminderMinutes,
});

const sessionFromDocument = (id: string, data: DocumentData): ProctorSessionRow => ({
  id,
  type: String(data.type ?? 'UAP'),
  dateTime: millis(data.dateTime),
  room: String(data.room ?? ''),
  courseCode: String(data.courseCode ?? ''),
  courseName: String(data.courseName ?? ''),
  courseClass: String(data.courseClass ?? ''),
  status: String(data.status ?? 'active'),
  createdAt: millis(data.createdAt),
  updatedAt: millis(data.updatedAt),
  deleted: Boolean(data.deleted),
  reopened: Boolean(data.reopened),
  // Absent on a document written before this existed, or by the Flutter
  // build, which does not know about reminders at all.
  reminderMinutes: Number(data.reminderMinutes ?? 0),
});

const conversationToDocument = (row: AiConversationRow): DocumentData => ({
  title: row.title,
  turns: row.turns,
  createdAt: stamp(row.createdAt),
  updatedAt: stamp(row.updatedAt),
  deleted: row.deleted,
});

const conversationFromDocument = (id: string, data: DocumentData): AiConversationRow => ({
  id,
  title: String(data.title ?? 'Untitled'),
  turns: Array.isArray(data.turns) ? (data.turns as unknown[]).map(String) : [],
  createdAt: millis(data.createdAt),
  updatedAt: millis(data.updatedAt),
  deleted: Boolean(data.deleted),
});

const itemToDocument = (row: ChecklistItemRow): DocumentData => ({
  sessionId: row.sessionId,
  label: row.label,
  section: row.section,
  isChecked: row.isChecked,
  sortOrder: row.sortOrder,
  updatedAt: stamp(row.updatedAt),
  deleted: row.deleted,
});

const itemFromDocument = (id: string, data: DocumentData): ChecklistItemRow => ({
  id,
  sessionId: String(data.sessionId ?? ''),
  label: String(data.label ?? ''),
  section: String(data.section ?? ''),
  isChecked: Boolean(data.isChecked),
  sortOrder: Number(data.sortOrder ?? 0),
  updatedAt: millis(data.updatedAt),
  deleted: Boolean(data.deleted),
});

const categoryToDocument = (row: CategoryRow): DocumentData => ({
  label: row.label,
  toneIndex: row.toneIndex,
  createdAt: stamp(row.createdAt),
  updatedAt: stamp(row.updatedAt),
  deleted: row.deleted,
});

const categoryFromDocument = (id: string, data: DocumentData): CategoryRow => ({
  id,
  label: String(data.label ?? 'Untitled'),
  toneIndex: Number(data.toneIndex ?? 0),
  createdAt: millis(data.createdAt),
  updatedAt: millis(data.updatedAt),
  deleted: Boolean(data.deleted),
});

const habitToDocument = (row: HabitRow): DocumentData => ({
  name: row.name,
  toneIndex: row.toneIndex,
  sortOrder: row.sortOrder,
  createdAt: stamp(row.createdAt),
  updatedAt: stamp(row.updatedAt),
  deleted: row.deleted,
});

const habitFromDocument = (id: string, data: DocumentData): HabitRow => ({
  id,
  name: String(data.name ?? 'Untitled'),
  toneIndex: Number(data.toneIndex ?? 0),
  sortOrder: Number(data.sortOrder ?? 0),
  createdAt: millis(data.createdAt),
  updatedAt: millis(data.updatedAt),
  deleted: Boolean(data.deleted),
});

const taskPropertyTypes: readonly TaskPropertyType[] =
  ['text', 'number', 'select', 'multiSelect', 'status', 'date', 'checkbox', 'url'];

const taskPropertyToDocument = (row: TaskPropertyRow): DocumentData => ({
  name: row.name,
  type: row.type,
  options: row.options,
  sortOrder: row.sortOrder,
  createdAt: stamp(row.createdAt),
  updatedAt: stamp(row.updatedAt),
  deleted: row.deleted,
});

const taskPropertyFromDocument = (id: string, data: DocumentData): TaskPropertyRow => ({
  id,
  name: String(data.name ?? 'Untitled'),
  type: taskPropertyTypes.includes(data.type as TaskPropertyType)
    ? (data.type as TaskPropertyType)
    : 'text',
  options: Array.isArray(data.options)
    ? (data.options as unknown[]).map((raw) => {
        const option = raw as Record<string, unknown>;
        return {
          id: String(option?.id ?? crypto.randomUUID()),
          label: String(option?.label ?? ''),
          toneIndex: Number(option?.toneIndex ?? 0),
        };
      })
    : [],
  sortOrder: Number(data.sortOrder ?? 0),
  createdAt: millis(data.createdAt),
  updatedAt: millis(data.updatedAt),
  deleted: Boolean(data.deleted),
});

const taskPageToDocument = (row: TaskPageRow): DocumentData => ({
  title: row.title,
  icon: row.icon,
  values: row.values,
  // `?? ''` guards a page written to local storage before `body` existed —
  // Firestore's `set()` throws on an `undefined` field, which is what
  // `row.body` would be for one of those records otherwise.
  body: row.body ?? '',
  sortOrder: row.sortOrder,
  createdAt: stamp(row.createdAt),
  updatedAt: stamp(row.updatedAt),
  deleted: row.deleted,
});

const taskPageFromDocument = (id: string, data: DocumentData): TaskPageRow => ({
  id,
  title: String(data.title ?? 'Untitled'),
  icon:
    data.icon && typeof data.icon === 'object' ? (data.icon as TaskPageIcon) : null,
  values:
    data.values && typeof data.values === 'object'
      ? (data.values as Record<string, unknown>)
      : {},
  // Absent on a page written before the rich-text body existed.
  body: String(data.body ?? ''),
  sortOrder: Number(data.sortOrder ?? 0),
  createdAt: millis(data.createdAt),
  updatedAt: millis(data.updatedAt),
  deleted: Boolean(data.deleted),
});

const settingsToDocument = (row: SettingsRow): DocumentData => ({
  theme: row.theme,
  font: row.font,
  fullWidth: row.fullWidth,
  dashboard: row.dashboard,
  hiddenPrograms: row.hiddenPrograms,
  updatedAt: stamp(row.updatedAt),
});

const settingsFromDocument = (id: string, data: DocumentData): SettingsRow => ({
  id,
  theme: data.theme === 'light' || data.theme === 'dark' ? data.theme : 'system',
  font: data.font === 'times' || data.font === 'consolas' ? data.font : 'default',
  fullWidth: Boolean(data.fullWidth),
  // `dashboardWidgets` is the flat pre-rows shape; a document written by a
  // build from before this migrates on read rather than being dropped.
  dashboard: readDashboardLayout(data.dashboard ?? data.dashboardWidgets),
  hiddenPrograms: Array.isArray(data.hiddenPrograms) ? (data.hiddenPrograms as unknown[]).map(String) : [],
  updatedAt: millis(data.updatedAt),
});

const todoItemToDocument = (row: TodoItemRow): DocumentData => ({
  text: row.text,
  day: row.day,
  checked: row.checked,
  doneAt: row.doneAt === null ? null : stamp(row.doneAt),
  sortOrder: row.sortOrder,
  createdAt: stamp(row.createdAt),
  updatedAt: stamp(row.updatedAt),
  deleted: row.deleted,
});

const todoItemFromDocument = (id: string, data: DocumentData): TodoItemRow => ({
  id,
  text: String(data.text ?? ''),
  day: typeof data.day === 'string' ? data.day : jakartaDayKey(),
  checked: Boolean(data.checked),
  doneAt: data.doneAt ? millis(data.doneAt) : null,
  sortOrder: Number(data.sortOrder ?? 0),
  createdAt: millis(data.createdAt),
  updatedAt: millis(data.updatedAt),
  deleted: Boolean(data.deleted),
});

/**
 * Day records, keyed `YYYY-MM-DD` in Jakarta.
 *
 * The one collection with no tombstones — a day is never deleted, only emptied
 * — so the pull has nothing to skip.
 */
const syncHabitDays = (database: AfDatabase, uid: string): Promise<void> =>
  syncCollection<HabitDayRow>(
    database,
    uid,
    'habitDays',
    database.habitDays,
    (row) => ({ completed: row.completed, updatedAt: stamp(row.updatedAt) }),
    (day, data) => ({
      day,
      completed: Array.isArray(data.completed) ? (data.completed as unknown[]).map(String) : [],
      updatedAt: millis(data.updatedAt),
    }),
    (row) => row.day,
  );

/**
 * Reconciles everything.
 *
 * Order matters in three places: sessions before their checklist items, and
 * categories before events and task properties before task pages for the
 * same reason — an event's colour resolves through its category, and a
 * page's option values resolve through its property's option list, so
 * pulling the dependent collection first would show everything unresolved
 * until the next pass. The category/event ordering is inherited from the
 * Flutter build; task properties/pages are new but follow the same rule.
 */
export async function syncAll(uid: string): Promise<void> {
  const database = db();
  const failed: string[] = [];

  const run = async (name: string, task: () => Promise<void>) => {
    try {
      await task();
    } catch (error) {
      console.error(`sync: ${name} failed`, error);
      failed.push(`${name} (${error instanceof Error ? error.message : String(error)})`);
    }
  };

  await run('sessions', () =>
    syncCollection(database, uid, 'sessions', database.proctorSessions, sessionToDocument, sessionFromDocument),
  );
  await run('checklistItems', () =>
    syncCollection(database, uid, 'checklistItems', database.checklistItems, itemToDocument, itemFromDocument),
  );
  await run('categories', () =>
    syncCollection(database, uid, 'categories', database.categories, categoryToDocument, categoryFromDocument),
  );
  await run('events', () =>
    syncCollection(database, uid, 'events', database.calendarEvents, eventToDocument, eventFromDocument),
  );
  await run('habits', () =>
    syncCollection(database, uid, 'habits', database.habits, habitToDocument, habitFromDocument),
  );
  await run('habitDays', () => syncHabitDays(database, uid));
  await run('taskProperties', () =>
    syncCollection(database, uid, 'taskProperties', database.taskProperties, taskPropertyToDocument, taskPropertyFromDocument),
  );
  await run('taskPages', () =>
    syncCollection(database, uid, 'taskPages', database.taskPages, taskPageToDocument, taskPageFromDocument),
  );
  await run('aiConversations', () =>
    syncCollection(database, uid, 'aiConversations', database.aiConversations, conversationToDocument, conversationFromDocument),
  );
  await run('settings', () =>
    syncCollection(database, uid, 'settings', database.settings, settingsToDocument, settingsFromDocument),
  );
  await run('todoItems', () =>
    syncCollection(database, uid, 'todoItems', database.todoItems, todoItemToDocument, todoItemFromDocument),
  );

  if (failed.length) throw new Error(`Sync failed for ${failed.join('; ')}`);
}
