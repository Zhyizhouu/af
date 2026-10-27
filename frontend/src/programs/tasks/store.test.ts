import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, openScope } from '../../data/db';
import {
  addOption,
  createPage,
  deleteOption,
  deletePage,
  deleteProperty,
  fillTaskDefaults,
  listPages,
  listProperties,
  matchesFilters,
  migrateTaskProperties,
  moveOption,
  recolorOption,
  renameOption,
  reorderOption,
  reorderProperty,
  savePageField,
  savePageValue,
  saveProperty,
  seedDefaultProperties,
  syncTaskStatusFromTodos,
  type PropertyFilter,
} from './store';
import { statusPropertyOf } from './roles';
import { addTodo, deleteTodo, listStepsForTask, toggleTodo } from '../todo/store';

beforeEach(async () => {
  await openScope(`test-${Math.random().toString(36).slice(2)}`);
});

describe('seedDefaultProperties', () => {
  it('seeds Status and Priority on first use', async () => {
    await seedDefaultProperties();
    const properties = await listProperties();

    expect(properties.map((p) => p.name)).toEqual(['Status', 'Priority']);
    const status = properties.find((p) => p.name === 'Status')!;
    expect(status.type).toBe('status');
    expect(status.options.map((o) => o.label)).toEqual([
      'Not started', 'In progress', 'Quality Check', 'Done',
    ]);
    const priority = properties.find((p) => p.name === 'Priority')!;
    expect(priority.options.map((o) => o.label)).toEqual(['High', 'Medium', 'Low']);
  });

  it('never seeds twice, even after every property is deleted', async () => {
    await seedDefaultProperties();
    for (const property of await listProperties()) await deleteProperty(property.id);

    await seedDefaultProperties();

    expect(await listProperties()).toHaveLength(0);
  });

  it('mints stable ids for the seeded properties and their options', async () => {
    await seedDefaultProperties();
    const properties = await listProperties();

    const status = properties.find((p) => p.name === 'Status')!;
    expect(status.id).toBe('seed:status');
    expect(status.options.map((o) => o.id)).toEqual([
      'seed:status:not-started',
      'seed:status:in-progress',
      'seed:status:in-correction',
      'seed:status:done',
    ]);

    const priority = properties.find((p) => p.name === 'Priority')!;
    expect(priority.id).toBe('seed:priority');
    expect(priority.options.map((o) => o.id)).toEqual([
      'seed:priority:high',
      'seed:priority:medium',
      'seed:priority:low',
    ]);
  });

  it('does nothing when properties already exist', async () => {
    await saveProperty({ name: 'Custom', type: 'text' });
    await seedDefaultProperties();

    expect((await listProperties()).map((p) => p.name)).toEqual(['Custom']);
  });

  it('produces identical ids across two independent fresh databases', async () => {
    await openScope(`test-a-${Math.random().toString(36).slice(2)}`);
    await seedDefaultProperties();
    const first = await listProperties();

    await openScope(`test-b-${Math.random().toString(36).slice(2)}`);
    await seedDefaultProperties();
    const second = await listProperties();

    expect(second.map((p) => p.id)).toEqual(first.map((p) => p.id));
    expect(second.map((p) => p.options.map((o) => o.id))).toEqual(
      first.map((p) => p.options.map((o) => o.id)),
    );
  });
});

describe('saveProperty', () => {
  it('creates with the given type', async () => {
    const property = await saveProperty({ name: 'Effort', type: 'number' });
    expect(property.type).toBe('number');
    expect(property.name).toBe('Effort');
  });

  it('never changes type on update, even if a different one is passed', async () => {
    const created = await saveProperty({ name: 'Effort', type: 'number' });
    const updated = await saveProperty({ id: created.id, name: 'Effort (renamed)', type: 'text' });

    expect(updated.type).toBe('number');
    expect(updated.name).toBe('Effort (renamed)');
  });
});

describe('option CRUD', () => {
  async function selectProperty() {
    return saveProperty({ name: 'Priority', type: 'select' });
  }

  it('adds an option with a cycling tone index', async () => {
    const property = await selectProperty();
    await addOption(property.id, 'High');
    await addOption(property.id, 'Low');

    const [reloaded] = await listProperties();
    expect(reloaded!.options.map((o) => o.label)).toEqual(['High', 'Low']);
    expect(reloaded!.options[0]!.toneIndex).not.toBe(reloaded!.options[1]!.toneIndex);
  });

  it('renames and recolors only the targeted option', async () => {
    const property = await selectProperty();
    await addOption(property.id, 'High');
    await addOption(property.id, 'Low');
    const { options } = (await listProperties())[0]!;
    const [high, low] = options;

    await renameOption(property.id, high!.id, 'URGENT');
    await recolorOption(property.id, high!.id, 7);

    const [reloaded] = await listProperties();
    const renamed = reloaded!.options.find((o) => o.id === high!.id)!;
    const untouched = reloaded!.options.find((o) => o.id === low!.id)!;
    expect(renamed.label).toBe('URGENT');
    expect(renamed.toneIndex).toBe(7);
    expect(untouched.label).toBe('Low');
  });

  it('deletes an option without touching the others', async () => {
    const property = await selectProperty();
    await addOption(property.id, 'High');
    await addOption(property.id, 'Low');
    const { options } = (await listProperties())[0]!;

    await deleteOption(property.id, options[0]!.id);

    const [reloaded] = await listProperties();
    expect(reloaded!.options.map((o) => o.label)).toEqual(['Low']);
  });

  it('reorders adjacent options and no-ops at the boundary', async () => {
    const property = await selectProperty();
    await addOption(property.id, 'High');
    await addOption(property.id, 'Low');
    const { options } = (await listProperties())[0]!;

    await reorderOption(property.id, options[1]!.id, -1);
    let reloaded = (await listProperties())[0]!;
    expect(reloaded.options.map((o) => o.label)).toEqual(['Low', 'High']);

    // Already first: moving further left is a no-op.
    await reorderOption(property.id, reloaded.options[0]!.id, -1);
    reloaded = (await listProperties())[0]!;
    expect(reloaded.options.map((o) => o.label)).toEqual(['Low', 'High']);
  });
});

describe('moveOption', () => {
  async function threeOptions() {
    const property = await saveProperty({ name: 'Priority', type: 'select' });
    await addOption(property.id, 'High');
    await addOption(property.id, 'Medium');
    await addOption(property.id, 'Low');
    return (await listProperties())[0]!;
  }

  it('moves an option to an arbitrary index, not just an adjacent swap', async () => {
    const property = await threeOptions();
    const [high] = property.options;

    await moveOption(property.id, high!.id, 2);

    const reloaded = (await listProperties())[0]!;
    expect(reloaded.options.map((o) => o.label)).toEqual(['Medium', 'Low', 'High']);
  });

  it('clamps a target past the end rather than dropping the option', async () => {
    const property = await threeOptions();
    const [high] = property.options;

    await moveOption(property.id, high!.id, 99);

    const reloaded = (await listProperties())[0]!;
    expect(reloaded.options).toHaveLength(3);
    expect(reloaded.options.map((o) => o.label)).toEqual(['Medium', 'Low', 'High']);
  });
});

describe('reorderProperty', () => {
  it('swaps sort order with the adjacent property', async () => {
    await saveProperty({ name: 'A', type: 'text' });
    const b = await saveProperty({ name: 'B', type: 'text' });

    await reorderProperty(b.id, -1);

    expect((await listProperties()).map((p) => p.name)).toEqual(['B', 'A']);
  });

  it('no-ops past either end', async () => {
    const a = await saveProperty({ name: 'A', type: 'text' });
    await saveProperty({ name: 'B', type: 'text' });

    await reorderProperty(a.id, -1);

    expect((await listProperties()).map((p) => p.name)).toEqual(['A', 'B']);
  });
});

describe('migrateTaskProperties', () => {
  async function seedLegacy() {
    await seedDefaultProperties();
    const status = (await db().taskProperties.get('seed:status'))!;
    await db().taskProperties.put({
      ...status,
      options: status.options.map((o) =>
        o.id === 'seed:status:in-correction' ? { ...o, label: ' in correction ' } : o,
      ),
      updatedAt: 1,
    });
  }

  it('renames the legacy option, keeping its id and tone, and bumps updatedAt', async () => {
    await seedLegacy();

    await migrateTaskProperties();

    const status = (await db().taskProperties.get('seed:status'))!;
    const option = status.options.find((o) => o.id === 'seed:status:in-correction')!;
    expect(option).toEqual({ id: 'seed:status:in-correction', label: 'Quality Check', toneIndex: 3 });
    expect(status.updatedAt).toBeGreaterThan(1);
  });

  it('is idempotent and writes nothing when no option matches', async () => {
    await seedLegacy();
    await migrateTaskProperties();
    const first = await db().taskProperties.get('seed:status');

    await migrateTaskProperties();

    expect(await db().taskProperties.get('seed:status')).toEqual(first);
  });
});

describe('migrateTaskProperties once per scope', () => {
  it('does nothing on a second call even if an option is later named In Correction', async () => {
    await seedDefaultProperties();
    await migrateTaskProperties();
    const status = (await db().taskProperties.get('seed:status'))!;
    await renameOption('seed:status', 'seed:status:in-correction', 'In Correction');
    const renamed = (await db().taskProperties.get('seed:status'))!;
    expect(renamed.updatedAt).toBeGreaterThanOrEqual(status.updatedAt);

    await migrateTaskProperties();

    expect(await db().taskProperties.get('seed:status')).toEqual(renamed);
    expect(
      (await db().taskProperties.get('seed:status'))!.options.find((o) => o.id === 'seed:status:in-correction')!.label,
    ).toBe('In Correction');
  });

  it('still runs when storage is unavailable', async () => {
    await seedDefaultProperties();
    await renameOption('seed:status', 'seed:status:in-correction', 'In Correction');
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    await migrateTaskProperties();

    spy.mockRestore();
    set.mockRestore();
    const option = (await db().taskProperties.get('seed:status'))!.options.find(
      (o) => o.id === 'seed:status:in-correction',
    )!;
    expect(option.label).toBe('Quality Check');
  });
});

describe('createPage initial values', () => {
  it('merges initial values over the defaults in a single write', async () => {
    await seedDefaultProperties();
    const writes = vi.spyOn(db().taskPages, 'put');

    const page = await createPage('X', { 'seed:priority': 'seed:priority:high' });

    expect(writes).toHaveBeenCalledTimes(1);
    expect(page.values).toEqual({
      'seed:status': 'seed:status:not-started',
      'seed:priority': 'seed:priority:high',
    });
    expect((await db().taskPages.get(page.id))!.values).toEqual(page.values);
    writes.mockRestore();
  });
});

describe('createPage default priority', () => {
  it('sets both defaults from the seeded properties', async () => {
    await seedDefaultProperties();

    const page = await createPage('X');

    expect(page.values['seed:status']).toBe('seed:status:not-started');
    expect(page.values['seed:priority']).toBe('seed:priority:medium');
  });

  it('sets status only when there is no priority property', async () => {
    await seedDefaultProperties();
    await deleteProperty('seed:priority');

    const page = await createPage('X');

    expect(page.values).toEqual({ 'seed:status': 'seed:status:not-started' });
  });

  it('falls back to a select named priority, then the middle option', async () => {
    const priority = await saveProperty({ name: ' Priority ', type: 'select' });
    await addOption(priority.id, 'Urgent');
    await addOption(priority.id, 'Normal');
    await addOption(priority.id, 'Later');

    const page = await createPage('X');

    const options = (await listProperties())[0]!.options;
    expect(page.values[priority.id]).toBe(options[1]!.id);
  });
});

describe('fillTaskDefaults', () => {
  it('fills missing and dangling values, leaves set ones alone, bumps only changed rows', async () => {
    await seedDefaultProperties();
    const base = {
      icon: null,
      body: '',
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
      deleted: false,
    };
    await db().taskPages.bulkPut([
      { ...base, id: 'missing', title: 'm', values: {} },
      {
        ...base,
        id: 'dangling',
        title: 'd',
        values: { 'seed:status': 'gone', 'seed:priority': 'seed:priority:low' },
      },
      {
        ...base,
        id: 'set',
        title: 's',
        values: { 'seed:status': 'seed:status:done', 'seed:priority': 'seed:priority:high' },
      },
      { ...base, id: 'removed', title: 'r', values: {}, deleted: true },
    ]);

    await fillTaskDefaults();

    const get = async (id: string) => (await db().taskPages.get(id))!;
    expect((await get('missing')).values).toEqual({
      'seed:status': 'seed:status:not-started',
      'seed:priority': 'seed:priority:medium',
    });
    expect((await get('dangling')).values).toEqual({
      'seed:status': 'seed:status:not-started',
      'seed:priority': 'seed:priority:low',
    });
    expect((await get('set')).values).toEqual({
      'seed:status': 'seed:status:done',
      'seed:priority': 'seed:priority:high',
    });
    expect((await get('missing')).updatedAt).toBeGreaterThan(1);
    expect((await get('dangling')).updatedAt).toBeGreaterThan(1);
    expect((await get('set')).updatedAt).toBe(1);
    expect((await get('removed')).updatedAt).toBe(1);
    expect((await get('removed')).values).toEqual({});
  });
});

describe('fillTaskDefaults once per scope', () => {
  it('leaves a value orphaned after the first run alone', async () => {
    await seedDefaultProperties();
    const page = await createPage('P');
    await fillTaskDefaults();
    await savePageValue(page.id, 'seed:priority', 'gone');
    await savePageValue(page.id, 'seed:status', null);
    const before = (await db().taskPages.get(page.id))!;

    await fillTaskDefaults();

    expect(await db().taskPages.get(page.id)).toEqual(before);
  });

  it('does not use up the run while there are no properties to default from', async () => {
    const page = await createPage('P');
    await fillTaskDefaults();
    await seedDefaultProperties();

    await fillTaskDefaults();

    expect((await db().taskPages.get(page.id))!.values).toEqual({
      'seed:status': 'seed:status:not-started',
      'seed:priority': 'seed:priority:medium',
    });
  });
});

describe('createPage default status', () => {
  it('defaults to Not started when a status property is seeded', async () => {
    await seedDefaultProperties();

    const page = await createPage('X');

    expect(page.values['seed:status']).toBe('seed:status:not-started');
  });

  it('leaves values empty when no properties exist', async () => {
    const page = await createPage('Y');

    expect(page.values).toEqual({});
  });
});

describe('page CRUD', () => {
  it('creates, edits fields, sets values, and round-trips through db()', async () => {
    const property = await saveProperty({ name: 'Notes', type: 'text' });
    const page = await createPage('Ship it');

    await savePageField(page.id, { icon: { kind: 'preset', value: '★' } });
    await savePageValue(page.id, property.id, 'in review');

    const [reloaded] = await listPages();
    expect(reloaded!.title).toBe('Ship it');
    expect(reloaded!.icon).toEqual({ kind: 'preset', value: '★' });
    expect(reloaded!.values[property.id]).toBe('in review');

    const stored = await db().taskPages.get(page.id);
    expect(stored).toBeDefined();
  });

  it('tombstones on delete rather than removing the row', async () => {
    const page = await createPage('Gone soon');
    await deletePage(page.id);

    expect(await listPages()).toHaveLength(0);
    const stored = await db().taskPages.get(page.id);
    expect(stored?.deleted).toBe(true);
  });

  it('is unaffected by a value pointing at a property that no longer exists', async () => {
    const property = await saveProperty({ name: 'Temp', type: 'text' });
    const page = await createPage('Orphan test');
    await savePageValue(page.id, property.id, 'still here');
    await deleteProperty(property.id);

    const [reloaded] = await listPages();
    // The stale entry is left in place — nothing reads it once the property
    // is gone, and nothing throws for it still being there.
    expect(reloaded!.values[property.id]).toBe('still here');
    expect(await listProperties()).toHaveLength(0);
  });
});

describe('matchesFilters', () => {
  it('shows everything when there are no filters', async () => {
    const page = await createPage('Anything');
    expect(matchesFilters(page, [])).toBe(true);
  });

  it('hides a select value that is excluded and shows one that is not', async () => {
    const property = await saveProperty({ name: 'Status', type: 'select' });
    await addOption(property.id, 'Done');
    const { options } = (await listProperties())[0]!;
    const page = await createPage('Task');
    await savePageValue(page.id, property.id, options[0]!.id);
    const [reloaded] = await listPages();

    const hidden: PropertyFilter = {
      kind: 'options',
      propertyId: property.id,
      excluded: new Set([options[0]!.id]),
    };
    const shown: PropertyFilter = {
      kind: 'options',
      propertyId: property.id,
      excluded: new Set(['something-else']),
    };

    expect(matchesFilters(reloaded!, [hidden])).toBe(false);
    expect(matchesFilters(reloaded!, [shown])).toBe(true);
  });

  it('shows a page with no value while an options clause exists', async () => {
    const property = await saveProperty({ name: 'Status', type: 'select' });
    await addOption(property.id, 'Done');
    const { options } = (await listProperties())[0]!;
    const page = await createPage('Task');

    const filter: PropertyFilter = {
      kind: 'options',
      propertyId: property.id,
      excluded: new Set([options[0]!.id]),
    };
    expect(matchesFilters(page, [filter])).toBe(true);
  });

  it('hides a multiSelect value only when every id is excluded', async () => {
    const property = await saveProperty({ name: 'Tags', type: 'multiSelect' });
    await addOption(property.id, 'Urgent');
    await addOption(property.id, 'Bug');
    const { options } = (await listProperties())[0]!;
    const [urgent, bug] = [options[0]!.id, options[1]!.id];
    const page = await createPage('Task');
    const withIds = async (ids: string[]) => {
      await savePageValue(page.id, property.id, ids);
      return (await listPages())[0]!;
    };

    const bothOut: PropertyFilter = { kind: 'options', propertyId: property.id, excluded: new Set([urgent, bug]) };
    const oneOut: PropertyFilter = { kind: 'options', propertyId: property.id, excluded: new Set([urgent]) };

    expect(matchesFilters(await withIds([urgent, bug]), [bothOut])).toBe(false);
    expect(matchesFilters(await withIds([urgent, bug]), [oneOut])).toBe(true);
    expect(matchesFilters(await withIds([urgent]), [oneOut])).toBe(false);
    expect(matchesFilters(await withIds([]), [bothOut])).toBe(true);
  });

  it('filters text case-insensitively with "contains"', async () => {
    const property = await saveProperty({ name: 'Notes', type: 'text' });
    const page = await createPage('Task');
    await savePageValue(page.id, property.id, 'Needs REVIEW');
    const [reloaded] = await listPages();

    expect(
      matchesFilters(reloaded!, [{ kind: 'contains', propertyId: property.id, text: 'review' }]),
    ).toBe(true);
    expect(
      matchesFilters(reloaded!, [{ kind: 'contains', propertyId: property.id, text: 'nope' }]),
    ).toBe(false);
  });

  it('filters a checkbox in either direction', async () => {
    const property = await saveProperty({ name: 'Blocked', type: 'checkbox' });
    const page = await createPage('Task');
    await savePageValue(page.id, property.id, true);
    const [reloaded] = await listPages();

    expect(
      matchesFilters(reloaded!, [{ kind: 'checkbox', propertyId: property.id, want: true }]),
    ).toBe(true);
    expect(
      matchesFilters(reloaded!, [{ kind: 'checkbox', propertyId: property.id, want: false }]),
    ).toBe(false);
  });

  it('ANDs multiple clauses across different properties', async () => {
    const status = await saveProperty({ name: 'Status', type: 'select' });
    await addOption(status.id, 'Done');
    const blocked = await saveProperty({ name: 'Blocked', type: 'checkbox' });
    const [statusReloaded] = await listProperties();
    const doneId = statusReloaded!.options[0]!.id;

    const page = await createPage('Task');
    await savePageValue(page.id, status.id, doneId);
    await savePageValue(page.id, blocked.id, true);
    const [reloaded] = await listPages();

    const filters: PropertyFilter[] = [
      { kind: 'options', propertyId: status.id, excluded: new Set(['something-else']) },
      { kind: 'checkbox', propertyId: blocked.id, want: true },
    ];
    expect(matchesFilters(reloaded!, filters)).toBe(true);

    const failing: PropertyFilter[] = [
      { kind: 'options', propertyId: status.id, excluded: new Set(['something-else']) },
      { kind: 'checkbox', propertyId: blocked.id, want: false },
    ];
    expect(matchesFilters(reloaded!, failing)).toBe(false);
  });
});

describe('task to-do links', () => {
  const statusOf = async (taskId: string) => (await db().taskPages.get(taskId))!.values['seed:status'];
  const NOT_STARTED = 'seed:status:not-started';
  const IN_PROGRESS = 'seed:status:in-progress';
  const DONE = 'seed:status:done';

  async function setup() {
    await seedDefaultProperties();
    const task = await createPage('Task');
    const first = (await addTodo('one', '2026-03-10', { taskId: task.id }))!;
    const second = (await addTodo('two', '2026-03-11', { taskId: task.id }))!;
    return { task, first, second };
  }

  it('ticking one to-do moves the task to In progress, both to Done', async () => {
    const { task, first, second } = await setup();
    expect(await statusOf(task.id)).toBe(NOT_STARTED);

    await toggleTodo(first);
    expect(await statusOf(task.id)).toBe(IN_PROGRESS);

    await toggleTodo(second);
    expect(await statusOf(task.id)).toBe(DONE);
  });

  it('unticking steps the task back down', async () => {
    const { task, first, second } = await setup();
    await toggleTodo(first);
    await toggleTodo(second);

    await toggleTodo(first);
    expect(await statusOf(task.id)).toBe(IN_PROGRESS);

    await toggleTodo(second);
    expect(await statusOf(task.id)).toBe(NOT_STARTED);
  });

  it('deleting the last unchecked to-do completes the task', async () => {
    const { task, first, second } = await setup();
    await toggleTodo(first);

    await deleteTodo(second);

    expect(await statusOf(task.id)).toBe(DONE);
  });

  it('marking the task Done ticks the remaining open to-dos, and leaving Done keeps them ticked', async () => {
    const { task, first, second } = await setup();
    await toggleTodo(first);

    await savePageValue(task.id, 'seed:status', DONE);

    const todos = (await listStepsForTask(task.id)).map((step) => step.todo);
    expect(todos.every((row) => row.checked && typeof row.doneAt === 'number')).toBe(true);
    expect(todos.map((row) => row.id)).toEqual([first, second]);

    await savePageValue(task.id, 'seed:status', IN_PROGRESS);

    expect((await listStepsForTask(task.id)).every((step) => step.todo.checked)).toBe(true);
    expect(await statusOf(task.id)).toBe(IN_PROGRESS);
  });

  it('adding a step to a Done task with every other step ticked moves it to In progress', async () => {
    const { task, first, second } = await setup();
    await toggleTodo(first);
    await toggleTodo(second);
    expect(await statusOf(task.id)).toBe(DONE);

    await addTodo('three', '2026-03-12', { taskId: task.id });

    expect(await statusOf(task.id)).toBe(IN_PROGRESS);
  });

  it('picks the same status property for linking and for ticking, by sortOrder then createdAt', async () => {
    await seedDefaultProperties();
    const seeded = (await db().taskProperties.get('seed:status'))!;
    const done = { id: 'other:done', label: 'Done', toneIndex: 1 };
    const todo = { id: 'other:todo', label: 'Not started', toneIndex: 4 };
    await db().taskProperties.put({
      ...seeded,
      id: 'other:status',
      name: 'Other',
      options: [todo, done],
      sortOrder: -1,
      createdAt: 1,
    });
    expect(statusPropertyOf(await db().taskProperties.toArray())!.id).toBe('other:status');
    const task = await createPage('Task');
    const step = (await addTodo('one', '2026-03-10', { taskId: task.id }))!;

    await savePageValue(task.id, 'seed:status', DONE);
    expect((await db().todoItems.get(step))!.checked).toBe(false);

    await savePageValue(task.id, 'other:status', done.id);
    expect((await db().todoItems.get(step))!.checked).toBe(true);

    await toggleTodo(step);
    expect((await db().taskPages.get(task.id))!.values['other:status']).toBe(todo.id);
    expect((await db().taskPages.get(task.id))!.values['seed:status']).toBe(DONE);
  });

  it('statusPropertyOf ignores deleted and non-status properties and breaks ties by createdAt', async () => {
    await seedDefaultProperties();
    const [status, priority] = [await db().taskProperties.get('seed:status'), await db().taskProperties.get('seed:priority')];
    const rows = [
      { ...priority!, sortOrder: -5 },
      { ...status!, id: 'gone', sortOrder: -5, deleted: true },
      { ...status!, id: 'later', sortOrder: 2, createdAt: 9 },
      { ...status!, id: 'earlier', sortOrder: 2, createdAt: 3 },
    ];
    expect(statusPropertyOf(rows)!.id).toBe('earlier');
    expect(statusPropertyOf([priority!])).toBeUndefined();
  });

  it('deleting the task tombstones its to-dos and spares standalone ones', async () => {
    const { task, first, second } = await setup();
    const alone = (await addTodo('alone', '2026-03-10'))!;

    await deletePage(task.id);

    expect((await db().todoItems.get(first))!.deleted).toBe(true);
    expect((await db().todoItems.get(second))!.deleted).toBe(true);
    expect((await db().todoItems.get(alone))!.deleted).toBe(false);
  });

  it('does nothing for a task without to-dos', async () => {
    await seedDefaultProperties();
    const task = await createPage('Bare');
    const before = (await db().taskPages.get(task.id))!;

    await syncTaskStatusFromTodos(task.id);

    expect(await db().taskPages.get(task.id)).toEqual(before);
  });
});
