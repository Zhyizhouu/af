import {
  Timestamp,
  collection,
  doc,
  getDocs,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { firestore } from './firebase';
import {
  db,
  type AiConversationRow,
  type CalendarEventRow,
  type CategoryRow,
  type ChecklistItemRow,
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

/**
 * One pass over one collection.
 *
 * Every table here is keyed by its own id, which is also the document id, so a
 * put covers insert and update alike. (The Flutter build needs a `syncId`
 * indirection for sessions and checklist items because Hive keys are
 * per-device auto-increment integers; IndexedDB lets the record's own id be
 * the key, so the two meet at the same document either way.)
 */
async function syncCollection<Row extends { id: string; updatedAt: number }>(
  uid: string,
  name: string,
  rows: Row[],
  toDocument: (row: Row) => DocumentData,
  fromDocument: (id: string, data: DocumentData) => Row,
  put: (row: Row) => Promise<unknown>,
): Promise<void> {
  const remote = await getDocs(userCollection(uid, name));
  const remoteDocs = new Map(remote.docs.map((snapshot) => [snapshot.id, snapshot.data()]));

  const batch = writeBatch(firestore());
  for (const row of rows) {
    const data = remoteDocs.get(row.id);
    if (!data || localWins(row.updatedAt, data)) {
      batch.set(doc(userCollection(uid, name), row.id), toDocument(row));
    }
  }

  const localById = new Map(rows.map((row) => [row.id, row]));
  for (const [id, data] of remoteDocs) {
    const local = localById.get(id);
    if (!local || !localWins(local.updatedAt, data)) {
      await put(fromDocument(id, data));
    }
  }

  await batch.commit();
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
  dashboardWidgets: row.dashboardWidgets,
  hiddenPrograms: row.hiddenPrograms,
  updatedAt: stamp(row.updatedAt),
});

const settingsFromDocument = (id: string, data: DocumentData): SettingsRow => ({
  id,
  theme: data.theme === 'light' || data.theme === 'dark' ? data.theme : 'system',
  font: data.font === 'times' || data.font === 'consolas' ? data.font : 'default',
  dashboardWidgets: Array.isArray(data.dashboardWidgets)
    ? (data.dashboardWidgets as unknown[]).map((raw) => {
        const widget = raw as Record<string, unknown>;
        return {
          id: String(widget?.id ?? ''),
          hidden: Boolean(widget?.hidden),
          width: Number(widget?.width ?? 6),
          height: Number(widget?.height ?? 260),
        };
      })
    : [],
  hiddenPrograms: Array.isArray(data.hiddenPrograms) ? (data.hiddenPrograms as unknown[]).map(String) : [],
  updatedAt: millis(data.updatedAt),
});

const todoItemToDocument = (row: TodoItemRow): DocumentData => ({
  text: row.text,
  checked: row.checked,
  sortOrder: row.sortOrder,
  createdAt: stamp(row.createdAt),
  updatedAt: stamp(row.updatedAt),
  deleted: row.deleted,
});

const todoItemFromDocument = (id: string, data: DocumentData): TodoItemRow => ({
  id,
  text: String(data.text ?? ''),
  checked: Boolean(data.checked),
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
async function syncHabitDays(uid: string): Promise<void> {
  const remote = await getDocs(userCollection(uid, 'habitDays'));
  const remoteDocs = new Map(remote.docs.map((snapshot) => [snapshot.id, snapshot.data()]));

  const batch = writeBatch(firestore());
  const local = await db().habitDays.toArray();

  for (const row of local) {
    const data = remoteDocs.get(row.day);
    if (!data || localWins(row.updatedAt, data)) {
      batch.set(doc(userCollection(uid, 'habitDays'), row.day), {
        completed: row.completed,
        updatedAt: stamp(row.updatedAt),
      });
    }
  }

  const localByDay = new Map(local.map((row) => [row.day, row]));
  for (const [day, data] of remoteDocs) {
    const mine = localByDay.get(day);
    if (!mine || !localWins(mine.updatedAt, data)) {
      await db().habitDays.put({
        day,
        completed: Array.isArray(data.completed)
          ? (data.completed as unknown[]).map(String)
          : [],
        updatedAt: millis(data.updatedAt),
      });
    }
  }

  await batch.commit();
}

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
  await syncCollection(
    uid,
    'sessions',
    await db().proctorSessions.toArray(),
    sessionToDocument,
    sessionFromDocument,
    (row) => db().proctorSessions.put(row),
  );

  await syncCollection(
    uid,
    'checklistItems',
    await db().checklistItems.toArray(),
    itemToDocument,
    itemFromDocument,
    (row) => db().checklistItems.put(row),
  );

  await syncCollection(
    uid,
    'categories',
    await db().categories.toArray(),
    categoryToDocument,
    categoryFromDocument,
    (row) => db().categories.put(row),
  );

  await syncCollection(
    uid,
    'events',
    await db().calendarEvents.toArray(),
    eventToDocument,
    eventFromDocument,
    (row) => db().calendarEvents.put(row),
  );

  await syncCollection(
    uid,
    'habits',
    await db().habits.toArray(),
    habitToDocument,
    habitFromDocument,
    (row) => db().habits.put(row),
  );

  await syncHabitDays(uid);

  await syncCollection(
    uid,
    'taskProperties',
    await db().taskProperties.toArray(),
    taskPropertyToDocument,
    taskPropertyFromDocument,
    (row) => db().taskProperties.put(row),
  );

  await syncCollection(
    uid,
    'taskPages',
    await db().taskPages.toArray(),
    taskPageToDocument,
    taskPageFromDocument,
    (row) => db().taskPages.put(row),
  );

  await syncCollection(
    uid,
    'aiConversations',
    await db().aiConversations.toArray(),
    conversationToDocument,
    conversationFromDocument,
    (row) => db().aiConversations.put(row),
  );

  await syncCollection(
    uid,
    'settings',
    await db().settings.toArray(),
    settingsToDocument,
    settingsFromDocument,
    (row) => db().settings.put(row),
  );

  await syncCollection(
    uid,
    'todoItems',
    await db().todoItems.toArray(),
    todoItemToDocument,
    todoItemFromDocument,
    (row) => db().todoItems.put(row),
  );
}
