import { db, type TodoItemRow } from '../../data/db';
import { jakartaDayKey } from '../habits/time';
import { normalizeTime } from '../../data/todoTime';
import { liveTodosOf, syncTaskStatusFromTodos } from '../tasks/store';

export { normalizeTime };

/** The to-do list: plain per-day checklists. This is for "add a thing, check
 *  it off," not for typed properties and views. A checked item stays on its
 *  day as that day's archive. An item can optionally be a step of a Task
 *  Tracker task (`taskId`), in which case ticking it drives that task's
 *  status. */

const byOrder = (a: TodoItemRow, b: TodoItemRow) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt;

const byTime = (a: TodoItemRow, b: TodoItemRow) => (a.time ?? '').localeCompare(b.time ?? '') || a.createdAt - b.createdAt;

/** Display order: timed items first by time, then untimed items by list order. */
export function orderForDisplay(rows: TodoItemRow[]): TodoItemRow[] {
  const timed = rows.filter((row) => row.time).sort(byTime);
  const untimed = rows.filter((row) => !row.time).sort(byOrder);
  return [...timed, ...untimed];
}

/** The drag index of each row of an `orderForDisplay` list: untimed rows count up from 0, and every timed row shares the index after them, so timed rows cannot be reordered. */
export function dragIndexes(rows: TodoItemRow[]): number[] {
  const untimed = rows.filter((row) => !row.time).length;
  let next = 0;
  return rows.map((row) => (row.time ? untimed : next++));
}

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

/** Appends an item to a day, today by default, and returns its id. Blank text
 *  is ignored (null). Pass `taskId` to make it a step of a Task Tracker task
 *  and `time` (`HH:MM`) to pin it to a time of day. */
export async function addTodo(
  text: string,
  day: string = jakartaDayKey(),
  options: { taskId?: string | null; time?: string | null } = {},
): Promise<string | null> {
  if (!text.trim()) return null;
  const now = Date.now();
  const id = crypto.randomUUID();
  await db().todoItems.put({
    id,
    text: text.trim(),
    day,
    checked: false,
    doneAt: null,
    sortOrder: await db().todoItems.where('day').equals(day).count(),
    createdAt: now,
    updatedAt: now,
    deleted: false,
    taskId: options.taskId ?? null,
    time: normalizeTime(options.time),
  });
  if (options.taskId) await syncTaskStatusFromTodos(options.taskId);
  return id;
}

/** Checks an item off (archiving it) or restores it, stamping `doneAt`. */
export async function toggleTodo(id: string): Promise<void> {
  const existing = await db().todoItems.get(id);
  if (!existing) return;
  const now = Date.now();
  const checked = !existing.checked;
  await db().todoItems.put({ ...existing, checked, doneAt: checked ? now : null, updatedAt: now });
  if (existing.taskId) await syncTaskStatusFromTodos(existing.taskId);
}

/** Sets or clears (null) an item's time. Invalid times clear it. */
export async function setTodoTime(id: string, time: string | null): Promise<void> {
  const existing = await db().todoItems.get(id);
  if (!existing || existing.deleted) return;
  const next = normalizeTime(time);
  if ((existing.time ?? null) === next) return;
  await db().todoItems.put({ ...existing, time: next, updatedAt: Date.now() });
}

/** Tombstones an item rather than removing the row, so the delete syncs. */
export async function deleteTodo(id: string): Promise<void> {
  const existing = await db().todoItems.get(id);
  if (!existing || existing.deleted) return;
  await db().todoItems.put({ ...existing, deleted: true, updatedAt: Date.now() });
  if (existing.taskId) await syncTaskStatusFromTodos(existing.taskId);
}

/**
 * Moves an open item to `toDay`. An untimed item lands at `toIndex` among
 * that day's open untimed items (counted with the item itself removed, so it
 * is the index the item ends up at), then `sortOrder` is renumbered 0..n-1
 * across the open untimed items of the target day and, when the day changed,
 * of the source day. A timed item only changes day, keeping its time and
 * order, and is never counted in an index. Only rows whose day or order
 * changed are written, each with a bumped `updatedAt` so the move syncs.
 * Checked items are archived in place and never move.
 */
export async function moveTodo(id: string, toDay: string, toIndex: number): Promise<void> {
  const table = db().todoItems;
  await db().transaction('rw', table, async () => {
    const item = await table.get(id);
    if (!item || item.deleted || item.checked) return;

    if (item.time) {
      if (item.day !== toDay) await table.put({ ...item, day: toDay, updatedAt: Date.now() });
      return;
    }

    const openOn = async (day: string) =>
      (await listTodosForDay(day)).filter((row) => !row.checked && !row.time && row.id !== id);
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

export interface TodoWithStep {
  todo: TodoItemRow;
  task: { id: string; title: string; index: number; total: number } | null;
}

const stepOrder = (a: TodoItemRow, b: TodoItemRow) =>
  a.day.localeCompare(b.day) ||
  Number(!a.time) - Number(!b.time) ||
  (a.time ?? '').localeCompare(b.time ?? '') ||
  a.createdAt - b.createdAt;

/** The live to-dos of one task as numbered steps, ordered by day, then time (untimed last), then creation; empty for a missing or deleted task. */
export async function listStepsForTask(taskId: string): Promise<TodoWithStep[]> {
  const page = await db().taskPages.get(taskId);
  if (!page || page.deleted) return [];
  const todos = (await liveTodosOf(taskId)).sort(stepOrder);
  return todos.map((todo, at) => ({ todo, task: { id: taskId, title: page.title, index: at + 1, total: todos.length } }));
}

/** Pairs each row with its task and its 1-based place among that task's live
 *  to-dos (by day, then time, then creation). Rows of a missing or deleted
 *  task, and standalone rows, get `task: null`. */
export async function withSteps(rows: TodoItemRow[]): Promise<TodoWithStep[]> {
  const ids = [...new Set(rows.flatMap((row) => (row.taskId ? [row.taskId] : [])))];
  const pages = await db().taskPages.bulkGet(ids);
  const steps = new Map<string, { title: string; ids: string[] }>();
  ids.forEach((taskId, i) => {
    const page = pages[i];
    if (page && !page.deleted) steps.set(taskId, { title: page.title, ids: [] });
  });
  for (const row of (await liveTodosOf(...steps.keys())).sort(stepOrder)) steps.get(row.taskId!)!.ids.push(row.id);
  return rows.map((todo) => {
    const step = todo.taskId ? steps.get(todo.taskId) : undefined;
    const at = step ? step.ids.indexOf(todo.id) : -1;
    return {
      todo,
      task: step && at >= 0 ? { id: todo.taskId!, title: step.title, index: at + 1, total: step.ids.length } : null,
    };
  });
}
