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
  /** Minutes before `start` to show a reminder notification. 0 is off —
   *  there is no such thing as a reminder due at the event's own start. */
  reminderMinutes: number;
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
  /** Minutes before `dateTime` to show a reminder notification. 0 is off. */
  reminderMinutes: number;
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

export type TaskPropertyType =
  | 'text' | 'number' | 'select' | 'multiSelect' | 'status' | 'date' | 'checkbox' | 'url';

export interface TaskPropertyOption {
  id: string;
  label: string;
  /** Index into the shared tone palette (data/tones.ts) — same convention as
   *  CategoryRow.toneIndex / HabitRow.toneIndex. */
  toneIndex: number;
}

export interface TaskPropertyRow {
  id: string;
  name: string;
  /** Fixed at creation. Changing it later would leave every existing page's
   *  value for it meaningless, so the editor never offers to. */
  type: TaskPropertyType;
  /** Only meaningful for select/multiSelect/status; empty otherwise. */
  options: TaskPropertyOption[];
  /** Column order in the table. */
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
}

export interface TaskPageIcon {
  kind: 'preset' | 'upload';
  /** The glyph string for 'preset', the data: URI for 'upload'. */
  value: string;
}

export interface TaskPageRow {
  id: string;
  title: string;
  icon: TaskPageIcon | null;
  /**
   * Keyed by TaskPropertyRow.id. Shape depends on the property's type at
   * write time: text/url → string; number → number|null; date → number|null
   * (epoch ms); checkbox → boolean; select/status → string|null (an option
   * id); multiSelect → string[] (option ids). Not a discriminated type — the
   * contract lives in programs/tasks/store.ts, the same way
   * AiConversationRow.turns' shape lives in programs/ai/message.ts rather
   * than here. A value whose property or option has since been deleted is
   * left in place rather than cleaned up; every reader looks properties and
   * options up by id and renders a dash when the lookup misses.
   */
  values: Record<string, unknown>;
  /** Sanitized HTML from the page's rich-text body editor. `''` for a page
   *  written before this existed, or one whose body was never touched. */
  body: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
}

/**
 * One widget's place on the dashboard.
 *
 * `basis` is a percentage of its own row's width, and a row's placements
 * always sum to 100 — the invariant that makes every reachable arrangement a
 * valid one, so there is no such thing as a half-filled row or an orphaned
 * column. `height` is null by default: a widget is as tall as its content,
 * and every card in a row stretches to match the tallest, which is what
 * keeps rows from going ragged without constraining anybody to preset
 * sizes. A number pins it, and the widget scrolls inside that height.
 */
export interface DashboardPlacement {
  id: string;
  basis: number;
  height: number | null;
}

export interface DashboardLayout {
  rows: { widgets: DashboardPlacement[] }[];
  /** Ids removed from the grid, still offered by "Add widgets". */
  hidden: string[];
}

/** One synced row, fixed id `'app'` — per-account preferences that used to
 *  have nowhere to live. `tokens.css` has anticipated this since the theme
 *  tokens were written: "the theme is an explicit choice stored in
 *  settings." */
export interface SettingsRow {
  id: string;
  theme: 'system' | 'light' | 'dark';
  /** Overrides `--af-sans` only — the mono stack keeps carrying machinery
   *  regardless of font choice. */
  font: 'default' | 'times' | 'consolas';
  /** Lets every program's page fill the window instead of sitting in the
   *  shared `--af-page-width` reading column. Applies app-wide, so no screen
   *  can end up wider than its neighbours — the rule `.page` exists for. */
  fullWidth: boolean;
  /** Rows of columns, the same shape Notion's own block layout takes — see
   *  `programs/dashboard/layout.ts` for every operation on it. */
  dashboard: DashboardLayout;
  /** Program slugs hidden from the nav bar and split picker — see Profile's
   *  "Displayed Applications" section and `app/programs.ts`'s
   *  `visiblePrograms`. Deliberately unrelated to `dashboard.hidden`. */
  hiddenPrograms: string[];
  updatedAt: number;
}

export interface TodoItemRow {
  id: string;
  text: string;
  checked: boolean;
  sortOrder: number;
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
  taskProperties!: EntityTable<TaskPropertyRow, 'id'>;
  taskPages!: EntityTable<TaskPageRow, 'id'>;
  settings!: EntityTable<SettingsRow, 'id'>;
  todoItems!: EntityTable<TodoItemRow, 'id'>;

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
    this.version(3).stores({
      taskProperties: 'id, sortOrder, updatedAt, deleted',
      taskPages: 'id, sortOrder, updatedAt, deleted',
    });
    this.version(4).stores({
      settings: 'id, updatedAt',
      todoItems: 'id, sortOrder, updatedAt, deleted',
    });
  }
}

/** The one settings row, before anything has ever been saved. */
export const defaultSettings = (): SettingsRow => ({
  id: 'app',
  theme: 'system',
  font: 'default',
  fullWidth: false,
  dashboard: { rows: [], hidden: [] },
  hiddenPrograms: [],
  updatedAt: 0,
});

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
