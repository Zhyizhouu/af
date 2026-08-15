import Dexie, { type EntityTable } from 'dexie';

/**
 * Local storage, scoped to whoever is signed in.
 *
 * Dexie/IndexedDB in place of Hive, but the shape carries over exactly: one
 * database per account, named `af__<uid>` (or `af` when signed out), so two
 * accounts on one browser never share a store. Records keep `updatedAt` for
 * last-write-wins and `deleted` as a tombstone, because the Firestore sync on
 * the other side of this is unchanged — the documents under `users/{uid}` are
 * the same ones the Flutter build wrote, and both must be able to read them.
 */

export interface CalendarEventRow {
  id: string;
  title: string;
  notes: string;
  start: number;
  end: number;
  allDay: boolean;
  category: string;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
}

export interface ProctorSessionRow {
  id: string;
  type: string;
  dateTime: number;
  room: string;
  courseCode: string;
  courseName: string;
  courseClass: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  /**
   * Exempts a manually reopened session from the four-hour archive sweep.
   *
   * Nothing in the React app reads it yet, and it is carried anyway: the
   * Flutter app writes it to the same documents, and a field this side drops
   * on write is a field that vanishes the next time this side syncs.
   */
  reopened: boolean;
}

export interface ChecklistItemRow {
  /** The item's own sync id, and the Firestore document id. */
  id: string;
  /** The parent session's id. Sessions are keyed by their sync id here, so
   *  this is a direct reference — the Flutter build needs a lookup because its
   *  Hive keys are per-device integers. */
  sessionId: string;
  label: string;
  section: string;
  isChecked: boolean;
  sortOrder: number;
  updatedAt: number;
  deleted: boolean;
}

export interface CategoryRow {
  id: string;
  label: string;
  toneIndex: number;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
}

export interface HabitRow {
  id: string;
  name: string;
  toneIndex: number;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
}

/**
 * One record per *day*, holding the ids completed on it.
 *
 * Not one per habit per day: that would be `habits × days` records where this
 * is at most 365 a year, and only for days actually ticked. The day is also the
 * right last-write-wins unit — two devices ticking different habits on the same
 * day is the only conflict, and it is a rare one.
 *
 * Keyed `YYYY-MM-DD` in **Jakarta**, never in the device's zone. See
 * `programs/habits/time.ts`.
 */
export interface HabitDayRow {
  day: string;
  completed: string[];
  updatedAt: number;
}

export interface AiConversationRow {
  id: string;
  title: string;
  /** One JSON object per message, oldest first. See `programs/ai/message.ts`. */
  turns: string[];
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
}

export class AfDatabase extends Dexie {
  calendarEvents!: EntityTable<CalendarEventRow, 'id'>;
  proctorSessions!: EntityTable<ProctorSessionRow, 'id'>;
  checklistItems!: EntityTable<ChecklistItemRow, 'id'>;
  categories!: EntityTable<CategoryRow, 'id'>;
  habits!: EntityTable<HabitRow, 'id'>;
  habitDays!: EntityTable<HabitDayRow, 'day'>;
  aiConversations!: EntityTable<AiConversationRow, 'id'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      calendarEvents: 'id, start, updatedAt, deleted',
      proctorSessions: 'id, dateTime, status, updatedAt, deleted',
      aiConversations: 'id, updatedAt, deleted',
    });
    this.version(2).stores({
      checklistItems: 'id, sessionId, updatedAt, deleted',
      categories: 'id, updatedAt, deleted',
      habits: 'id, sortOrder, updatedAt, deleted',
      habitDays: 'day, updatedAt',
    });
  }
}

export const localScope = 'local';

export const databaseName = (scope: string) =>
  scope === localScope ? 'af' : `af__${scope}`;

let current: AfDatabase | null = null;
let currentScope = localScope;

export function db(): AfDatabase {
  if (!current) current = new AfDatabase(databaseName(currentScope));
  return current;
}

export function scope(): string {
  return currentScope;
}

/**
 * Swaps to another account's database.
 *
 * Signing out swaps to the local scope rather than deleting anything, exactly
 * as the Flutter build did — so signing back in finds everything where it was.
 */
export async function openScope(next: string): Promise<void> {
  if (current && currentScope === next) return;
  const previous = current;
  currentScope = next;
  current = new AfDatabase(databaseName(next));
  await current.open();
  // Closed only after the new one is open, so nothing reading mid-swap finds a
  // closed database.
  previous?.close();
}
