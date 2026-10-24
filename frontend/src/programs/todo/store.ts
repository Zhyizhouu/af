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

/**
 * Moves an open item to `toDay` at `toIndex` among that day's open items
 * (counted with the item itself removed, so it is the index the item ends up
 * at), then renumbers `sortOrder` 0..n-1 on the target day and, when the day
 * changed, on the source day. Only rows whose day or order changed are
 * written, each with a bumped `updatedAt` so the move syncs. Checked items
 * are archived in place and never move.
 */
export async function moveTodo(id: string, toDay: string, toIndex: number): Promise<void> {
  const table = db().todoItems;
  await db().transaction('rw', table, async () => {
    const item = await table.get(id);
    if (!item || item.deleted || item.checked) return;

    const openOn = async (day: string) => (await listTodosForDay(day)).filter((row) => !row.checked && row.id !== id);
    const target = await openOn(toDay);
    const at = Math.max(0, Math.min(Math.trunc(toIndex), target.length));
    const placed = [...target.slice(0, at), item, ...target.slice(at)];

    const now = Date.now();
    const changed: TodoItemRow[] = [];
    placed.forEach((row, index) => {
      if (row.day !== toDay || row.sortOrder !== index) changed.push({ ...row, day: toDay, sortOrder: index, updatedAt: now });
    });
    if (item.day !== toDay) {
      (await openOn(item.day)).forEach((row, index) => {
        if (row.sortOrder !== index) changed.push({ ...row, sortOrder: index, updatedAt: now });
      });
    }
    if (changed.length > 0) await table.bulkPut(changed);
  });
}
