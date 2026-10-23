import { db, type TodoItemRow } from '../../data/db';
import { jakartaDayKey } from '../habits/time';

/** The to-do list: plain per-day checklists, deliberately separate from Task
 *  Tracker. This is for "add a thing, check it off," not for typed properties
 *  and views. A checked item stays on its day as that day's archive. */

const byOrder = (a: TodoItemRow, b: TodoItemRow) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt;

/** Live items on one Jakarta day, in list order. */
export async function listTodosForDay(day: string): Promise<TodoItemRow[]> {
  const rows = await db().todoItems.where('day').equals(day).filter((row) => !row.deleted).toArray();
  return rows.sort(byOrder);
}

/** Live items from `fromDay` to `toDay`, both inclusive. */
export async function listTodosInRange(fromDay: string, toDay: string): Promise<TodoItemRow[]> {
  const rows = await db()
    .todoItems.where('day')
    .between(fromDay, toDay, true, true)
    .filter((row) => !row.deleted)
    .toArray();
  return rows.sort(byOrder);
}

/** Appends an item to a day, today by default. Blank text is ignored. */
export async function addTodo(text: string, day: string = jakartaDayKey()): Promise<void> {
  if (!text.trim()) return;
  const now = Date.now();
  await db().todoItems.put({
    id: crypto.randomUUID(),
    text: text.trim(),
    day,
    checked: false,
    doneAt: null,
    sortOrder: await db().todoItems.where('day').equals(day).count(),
    createdAt: now,
    updatedAt: now,
    deleted: false,
  });
}

/** Checks an item off (archiving it) or restores it, stamping `doneAt`. */
export async function toggleTodo(id: string): Promise<void> {
  const existing = await db().todoItems.get(id);
  if (!existing) return;
  const now = Date.now();
  const checked = !existing.checked;
  await db().todoItems.put({ ...existing, checked, doneAt: checked ? now : null, updatedAt: now });
}

/** Tombstones an item rather than removing the row, so the delete syncs. */
export async function deleteTodo(id: string): Promise<void> {
  const existing = await db().todoItems.get(id);
  if (!existing || existing.deleted) return;
  await db().todoItems.put({ ...existing, deleted: true, updatedAt: Date.now() });
}
