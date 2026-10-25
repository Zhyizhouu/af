import { beforeEach, describe, expect, it } from 'vitest';
import { db, openScope } from '../../data/db';
import { jakartaDayKey } from '../habits/time';
import {
  addTodo,
  deleteTodo,
  listTodosForDay,
  listStepsForTask,
  listTodosInRange,
  moveTodo,
  normalizeTime,
  orderForDisplay,
  setTodoTime,
  toggleTodo,
  withSteps,
} from './store';

const day = '2026-03-10';

beforeEach(async () => {
  await openScope(`test-${Math.random().toString(36).slice(2)}`);
});

const taskPage = (id: string, title: string, deleted = false) => ({
  id,
  title,
  icon: null,
  values: {},
  body: '',
  sortOrder: 0,
  createdAt: 1,
  updatedAt: 1,
  deleted,
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

  it('stores the taskId and returns the new id', async () => {
    const id = await addTodo('Step one', day, { taskId: 'task-1' });

    expect(id).toEqual(expect.any(String));
    expect((await db().todoItems.get(id!))!.taskId).toBe('task-1');
  });

  it('stores null for a standalone item and returns null for blank text', async () => {
    const id = await addTodo('Alone', day);

    expect((await db().todoItems.get(id!))!.taskId).toBeNull();
    expect(await addTodo('   ', day, { taskId: 'task-1' })).toBeNull();
  });

  it('lists the live steps of one task numbered by day, then time with untimed last, then creation', async () => {
    await db().taskPages.bulkPut([taskPage('task-1', 'T1'), taskPage('task-2', 'T2')]);
    await addTodo('late', '2026-03-12', { taskId: 'task-1' });
    await addTodo('untimed', '2026-03-10', { taskId: 'task-1' });
    await addTodo('timed late', '2026-03-10', { taskId: 'task-1', time: '15:00' });
    await addTodo('timed early', '2026-03-10', { taskId: 'task-1', time: '08:00' });
    await addTodo('other task', '2026-03-11', { taskId: 'task-2' });
    await addTodo('standalone', '2026-03-11');
    const gone = await addTodo('removed', '2026-03-11', { taskId: 'task-1' });
    await deleteTodo(gone!);

    const steps = await listStepsForTask('task-1');
    expect(steps.map((step) => step.todo.text)).toEqual(['timed early', 'timed late', 'untimed', 'late']);
    expect(steps.map((step) => step.task)).toEqual(
      [1, 2, 3, 4].map((index) => ({ id: 'task-1', title: 'T1', index, total: 4 })),
    );
    const viaSteps = await withSteps(steps.map((step) => step.todo));
    expect(viaSteps.map((step) => step.task!.index)).toEqual([1, 2, 3, 4]);
  });

  it('lists no steps for a missing or deleted task', async () => {
    await db().taskPages.put(taskPage('task-1', 'T1', true));
    await addTodo('step', day, { taskId: 'task-1' });
    expect(await listStepsForTask('task-1')).toEqual([]);
    expect(await listStepsForTask('nope')).toEqual([]);
  });

  it('toggles a standalone item without touching any task', async () => {
    await db().taskPages.put({
      id: 'task-1',
      title: 'T',
      icon: null,
      values: {},
      body: '',
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
      deleted: false,
    });
    const id = await addTodo('Alone', day);

    await toggleTodo(id!);

    expect((await db().todoItems.get(id!))!.checked).toBe(true);
    expect((await db().taskPages.get('task-1'))!.updatedAt).toBe(1);
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

  describe('times', () => {
    it('normalizeTime accepts 24h HH:MM only', () => {
      expect(normalizeTime('09:00')).toBe('09:00');
      expect(normalizeTime('23:59')).toBe('23:59');
      for (const bad of ['24:00', '9:00', '', null, 930]) expect(normalizeTime(bad)).toBeNull();
    });

    it('addTodo stores the time, and null when absent or invalid', async () => {
      const timed = await addTodo('Call', day, { time: '09:30' });
      const plain = await addTodo('Plain', day);
      const bad = await addTodo('Bad', day, { time: '25:00' });

      expect((await db().todoItems.get(timed!))!.time).toBe('09:30');
      expect((await db().todoItems.get(plain!))!.time).toBeNull();
      expect((await db().todoItems.get(bad!))!.time).toBeNull();
    });

    it('setTodoTime sets, clears and ignores invalid input', async () => {
      const id = (await addTodo('Call', day))!;

      await setTodoTime(id, '14:15');
      expect((await db().todoItems.get(id))!.time).toBe('14:15');

      await setTodoTime(id, 'nope');
      expect((await db().todoItems.get(id))!.time).toBeNull();

      await setTodoTime(id, '14:15');
      await setTodoTime(id, null);
      expect((await db().todoItems.get(id))!.time).toBeNull();
    });

    it('setTodoTime is a no-op when unchanged, missing or deleted', async () => {
      const id = (await addTodo('Call', day, { time: '08:00' }))!;
      await db().todoItems.update(id, { updatedAt: 1 });

      await setTodoTime(id, '08:00');
      expect((await db().todoItems.get(id))!.updatedAt).toBe(1);

      await setTodoTime(id, '09:00');
      expect((await db().todoItems.get(id))!.updatedAt).toBeGreaterThan(1);

      await deleteTodo(id);
      await db().todoItems.update(id, { updatedAt: 1 });
      await setTodoTime(id, '10:00');
      const row = (await db().todoItems.get(id))!;
      expect(row.time).toBe('09:00');
      expect(row.updatedAt).toBe(1);
      await expect(setTodoTime('missing', '10:00')).resolves.toBeUndefined();
    });

    it('orderForDisplay puts timed items first by time, then untimed by list order', async () => {
      await addTodo('plain 1', day);
      await addTodo('late', day, { time: '15:00' });
      await addTodo('plain 2', day);
      await addTodo('early', day, { time: '07:30' });

      const ordered = orderForDisplay(await listTodosForDay(day));

      expect(ordered.map((item) => item.text)).toEqual(['early', 'late', 'plain 1', 'plain 2']);
    });
  });

  describe('moveTodo with times', () => {
    const other = '2026-03-11';
    const texts = async (key: string) => (await listTodosForDay(key)).map((item) => item.text);
    const idOf = async (key: string, text: string) => (await listTodosForDay(key)).find((item) => item.text === text)!.id;

    it('moves a timed item to another day without renumbering it', async () => {
      await addTodo('A', day);
      const timed = (await addTodo('Meet', day, { time: '10:00' }))!;
      await addTodo('B', day);
      await addTodo('X', other);
      await db().todoItems.toCollection().modify({ updatedAt: 1 });
      const before = (await db().todoItems.get(timed))!;

      await moveTodo(timed, other, 0);

      const after = (await db().todoItems.get(timed))!;
      expect(after.day).toBe(other);
      expect(after.time).toBe('10:00');
      expect(after.sortOrder).toBe(before.sortOrder);
      expect(after.updatedAt).toBeGreaterThan(1);
      const rest = (await db().todoItems.toArray()).filter((row) => row.id !== timed);
      expect(rest.every((row) => row.updatedAt === 1)).toBe(true);
    });

    it('counts only open untimed items in the index', async () => {
      await addTodo('A', day);
      await addTodo('T', day, { time: '09:00' });
      await addTodo('B', day);
      await addTodo('C', day);

      await moveTodo(await idOf(day, 'C'), day, 1);

      const untimed = (await listTodosForDay(day)).filter((item) => !item.time);
      expect(untimed.map((item) => item.text)).toEqual(['A', 'C', 'B']);
      expect(untimed.map((item) => item.sortOrder)).toEqual([0, 1, 2]);
    });

    it('renumbers only untimed items on the source and target days', async () => {
      await addTodo('A', day);
      await addTodo('T', other, { time: '09:00' });
      await addTodo('X', other);

      await moveTodo(await idOf(day, 'A'), other, 0);

      expect(await texts(day)).toEqual([]);
      const untimed = (await listTodosForDay(other)).filter((item) => !item.time);
      expect(untimed.map((item) => [item.text, item.sortOrder])).toEqual([
        ['A', 0],
        ['X', 1],
      ]);
    });
  });

  describe('withSteps', () => {
    it('numbers steps by day, then time, then creation, with the total', async () => {
      await db().taskPages.put(taskPage('task-1', 'Write report'));
      const late = (await addTodo('late', '2026-03-12', { taskId: 'task-1' }))!;
      const untimed = (await addTodo('untimed', '2026-03-10', { taskId: 'task-1' }))!;
      const timed = (await addTodo('timed', '2026-03-10', { taskId: 'task-1', time: '16:00' }))!;
      const removed = (await addTodo('removed', '2026-03-10', { taskId: 'task-1' }))!;
      await deleteTodo(removed);

      const rows = await db().todoItems.bulkGet([late, untimed, timed]);
      const result = await withSteps(rows as never);

      const step = (id: string) => result.find((entry) => entry.todo.id === id)!.task;
      expect(step(timed)).toEqual({ id: 'task-1', title: 'Write report', index: 1, total: 3 });
      expect(step(untimed)).toEqual({ id: 'task-1', title: 'Write report', index: 2, total: 3 });
      expect(step(late)).toEqual({ id: 'task-1', title: 'Write report', index: 3, total: 3 });
    });

    it('gives null for standalone rows and for a deleted or missing task', async () => {
      await db().taskPages.put(taskPage('gone', 'Gone', true));
      const alone = (await addTodo('alone', day))!;
      const ofGone = (await addTodo('of gone', day, { taskId: 'gone' }))!;
      const orphan = (await addTodo('orphan', day, { taskId: 'nowhere' }))!;

      const rows = (await db().todoItems.bulkGet([alone, ofGone, orphan])) as never;
      const result = await withSteps(rows);

      expect(result.map((entry) => entry.task)).toEqual([null, null, null]);
      expect(await withSteps([])).toEqual([]);
    });
  });
});
