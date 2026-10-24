import { beforeEach, describe, expect, it } from 'vitest';
import { db, openScope } from '../../data/db';
import { jakartaDayKey } from '../habits/time';
import { addTodo, deleteTodo, listTodosForDay, listTodosInRange, moveTodo, toggleTodo } from './store';

const day = '2026-03-10';

beforeEach(async () => {
  await openScope(`test-${Math.random().toString(36).slice(2)}`);
});

describe('todo store', () => {
  it('adds items in creation order and ignores blank text', async () => {
    await addTodo('Buy milk', day);
    await addTodo('  ', day);
    await addTodo('Walk the dog', day);

    const items = await listTodosForDay(day);
    expect(items.map((item) => item.text)).toEqual(['Buy milk', 'Walk the dog']);
    expect(items.every((item) => !item.checked)).toBe(true);
  });

  it('toggles only the targeted item', async () => {
    await addTodo('Buy milk', day);
    await addTodo('Walk the dog', day);
    const [first, second] = await listTodosForDay(day);

    await toggleTodo(first!.id);

    const reloaded = await listTodosForDay(day);
    expect(reloaded.find((item) => item.id === first!.id)!.checked).toBe(true);
    expect(reloaded.find((item) => item.id === second!.id)!.checked).toBe(false);
  });

  it('tombstones on delete rather than removing the row', async () => {
    await addTodo('Buy milk', day);
    const [item] = await listTodosForDay(day);

    await deleteTodo(item!.id);

    expect(await listTodosForDay(day)).toHaveLength(0);
    expect((await db().todoItems.get(item!.id))?.deleted).toBe(true);
  });

  it('keeps items on different days apart', async () => {
    await addTodo('Monday thing', '2026-03-09');
    await addTodo('Tuesday thing', '2026-03-10');

    expect((await listTodosForDay('2026-03-09')).map((item) => item.text)).toEqual(['Monday thing']);
    expect((await listTodosForDay('2026-03-10')).map((item) => item.text)).toEqual(['Tuesday thing']);
  });

  it('sets doneAt when checked and clears it when unchecked', async () => {
    await addTodo('Buy milk', day);
    const [item] = await listTodosForDay(day);
    expect(item!.doneAt).toBeNull();

    await toggleTodo(item!.id);
    const checked = await db().todoItems.get(item!.id);
    expect(checked!.checked).toBe(true);
    expect(checked!.doneAt).toEqual(expect.any(Number));

    await toggleTodo(item!.id);
    const restored = await db().todoItems.get(item!.id);
    expect(restored!.checked).toBe(false);
    expect(restored!.doneAt).toBeNull();
  });

  it('lists a range inclusive on both ends', async () => {
    for (const d of ['2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11']) await addTodo(d, d);

    const items = await listTodosInRange('2026-03-09', '2026-03-10');

    expect(items.map((item) => item.text).sort()).toEqual(['2026-03-09', '2026-03-10']);
  });

  it('defaults a new item to the current Jakarta day', async () => {
    await addTodo('Today thing');

    const [item] = await listTodosForDay(jakartaDayKey());
    expect(item!.text).toBe('Today thing');
    expect(item!.day).toBe(jakartaDayKey());
  });

  describe('moveTodo', () => {
    const other = '2026-03-11';
    const texts = async (key: string) => (await listTodosForDay(key)).map((item) => item.text);
    const idOf = async (key: string, text: string) => (await listTodosForDay(key)).find((item) => item.text === text)!.id;
    const orders = async (key: string) => (await listTodosForDay(key)).map((item) => item.sortOrder);

    beforeEach(async () => {
      for (const text of ['A', 'B', 'C']) await addTodo(text, day);
      for (const text of ['X', 'Y']) await addTodo(text, other);
    });

    it('reorders within a day', async () => {
      await moveTodo(await idOf(day, 'A'), day, 2);
      expect(await texts(day)).toEqual(['B', 'C', 'A']);
      await moveTodo(await idOf(day, 'A'), day, 0);
      expect(await texts(day)).toEqual(['A', 'B', 'C']);
    });

    it('moves to the start of another day', async () => {
      await moveTodo(await idOf(day, 'B'), other, 0);
      expect(await texts(other)).toEqual(['B', 'X', 'Y']);
      expect(await texts(day)).toEqual(['A', 'C']);
    });

    it('moves to the end of another day, clamping a large index', async () => {
      await moveTodo(await idOf(day, 'A'), other, Number.MAX_SAFE_INTEGER);
      expect(await texts(other)).toEqual(['X', 'Y', 'A']);
      expect((await db().todoItems.get(await idOf(other, 'A')))!.day).toBe(other);
    });

    it('renumbers the source and target days contiguously', async () => {
      await moveTodo(await idOf(day, 'A'), other, 1);
      expect(await orders(day)).toEqual([0, 1]);
      expect(await orders(other)).toEqual([0, 1, 2]);
    });

    it('bumps updatedAt only on rows whose day or order changed', async () => {
      await db().todoItems.toCollection().modify({ updatedAt: 1 });

      await moveTodo(await idOf(day, 'C'), day, 1);

      const rows = await db().todoItems.toArray();
      const stamp = (text: string) => rows.find((row) => row.text === text)!.updatedAt;
      expect(stamp('C')).toBeGreaterThan(1);
      expect(stamp('B')).toBeGreaterThan(1);
      expect(stamp('A')).toBe(1);
      expect(stamp('X')).toBe(1);
      expect(stamp('Y')).toBe(1);
    });

    it('is a no-op when dropped on its own position', async () => {
      await db().todoItems.toCollection().modify({ updatedAt: 1 });

      await moveTodo(await idOf(day, 'B'), day, 1);

      expect(await texts(day)).toEqual(['A', 'B', 'C']);
      expect((await db().todoItems.toArray()).every((row) => row.updatedAt === 1)).toBe(true);
    });

    it('leaves checked items on their day and ignores them as targets', async () => {
      await toggleTodo(await idOf(day, 'B'));
      const archivedId = await idOf(day, 'B');

      await moveTodo(archivedId, other, 0);
      expect((await db().todoItems.get(archivedId))!.day).toBe(day);

      await moveTodo(await idOf(day, 'C'), day, 0);
      expect((await listTodosForDay(day)).filter((item) => !item.checked).map((item) => item.text)).toEqual(['C', 'A']);
      expect((await db().todoItems.get(archivedId))!.day).toBe(day);
    });
  });
});
