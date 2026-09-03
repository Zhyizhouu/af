import { db, type TodoItemRow } from '../../data/db';

/** The dashboard's to-do widget — a plain checklist, deliberately separate
 *  from Task Tracker: this is for "add a thing, check it off," not for
 *  typed properties and views. */

export async function listTodos(): Promise<TodoItemRow[]> {
  const rows = await db().todoItems.filter((row) => !row.deleted).toArray();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}

export async function addTodo(text: string): Promise<void> {
  if (!text.trim()) return;
  const now = Date.now();
  await db().todoItems.put({
    id: crypto.randomUUID(),
    text: text.trim(),
    checked: false,
    sortOrder: await db().todoItems.count(),
    createdAt: now,
    updatedAt: now,
    deleted: false,
  });
}

export async function toggleTodo(id: string): Promise<void> {
  const existing = await db().todoItems.get(id);
  if (!existing) return;
  await db().todoItems.put({ ...existing, checked: !existing.checked, updatedAt: Date.now() });
}

export async function deleteTodo(id: string): Promise<void> {
  const existing = await db().todoItems.get(id);
  if (!existing || existing.deleted) return;
  await db().todoItems.put({ ...existing, deleted: true, updatedAt: Date.now() });
}
