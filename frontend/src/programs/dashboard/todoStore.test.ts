import { beforeEach, describe, expect, it } from 'vitest';
import { db, openScope } from '../../data/db';
import { addTodo, deleteTodo, listTodos, toggleTodo } from './todoStore';

beforeEach(async () => {
  await openScope(`test-${Math.random().toString(36).slice(2)}`);
});

describe('todoStore', () => {
  it('adds items in creation order and ignores blank text', async () => {
    await addTodo('Buy milk');
    await addTodo('  ');
    await addTodo('Walk the dog');

    const items = await listTodos();
    expect(items.map((item) => item.text)).toEqual(['Buy milk', 'Walk the dog']);
    expect(items.every((item) => !item.checked)).toBe(true);
  });

  it('toggles only the targeted item', async () => {
    await addTodo('Buy milk');
    await addTodo('Walk the dog');
    const [first, second] = await listTodos();

    await toggleTodo(first!.id);

    const reloaded = await listTodos();
    expect(reloaded.find((item) => item.id === first!.id)!.checked).toBe(true);
    expect(reloaded.find((item) => item.id === second!.id)!.checked).toBe(false);
  });

  it('tombstones on delete rather than removing the row', async () => {
    await addTodo('Buy milk');
    const [item] = await listTodos();

    await deleteTodo(item!.id);

    expect(await listTodos()).toHaveLength(0);
    expect((await db().todoItems.get(item!.id))?.deleted).toBe(true);
  });
});
