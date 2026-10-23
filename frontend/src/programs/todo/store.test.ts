import { beforeEach, describe, expect, it } from 'vitest';
import { db, openScope } from '../../data/db';
import { jakartaDayKey } from '../habits/time';
import { addTodo, deleteTodo, listTodosForDay, listTodosInRange, toggleTodo } from './store';

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
});
