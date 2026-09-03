import { beforeEach, describe, expect, it } from 'vitest';
import { db, openScope } from '../../data/db';
import {
  addOption,
  createPage,
  deleteOption,
  deletePage,
  deleteProperty,
  listPages,
  listProperties,
  matchesFilters,
  moveOption,
  recolorOption,
  renameOption,
  reorderOption,
  reorderProperty,
  savePageField,
  savePageValue,
  saveProperty,
  seedDefaultProperties,
  type PropertyFilter,
} from './store';

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
      'Not started', 'In progress', 'In Correction', 'Done',
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

  it('filters a select value by an included set', async () => {
    const property = await saveProperty({ name: 'Status', type: 'select' });
    await addOption(property.id, 'Done');
    const { options } = (await listProperties())[0]!;
    const page = await createPage('Task');
    await savePageValue(page.id, property.id, options[0]!.id);
    const [reloaded] = await listPages();

    const included: PropertyFilter = {
      kind: 'options',
      propertyId: property.id,
      included: new Set([options[0]!.id]),
    };
    const excluded: PropertyFilter = {
      kind: 'options',
      propertyId: property.id,
      included: new Set(['something-else']),
    };

    expect(matchesFilters(reloaded!, [included])).toBe(true);
    expect(matchesFilters(reloaded!, [excluded])).toBe(false);
  });

  it('filters a multiSelect value when any id overlaps the included set', async () => {
    const property = await saveProperty({ name: 'Tags', type: 'multiSelect' });
    await addOption(property.id, 'Urgent');
    await addOption(property.id, 'Bug');
    const { options } = (await listProperties())[0]!;
    const page = await createPage('Task');
    await savePageValue(page.id, property.id, [options[1]!.id]);
    const [reloaded] = await listPages();

    const filter: PropertyFilter = {
      kind: 'options',
      propertyId: property.id,
      included: new Set([options[0]!.id, options[1]!.id]),
    };
    expect(matchesFilters(reloaded!, [filter])).toBe(true);
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
      { kind: 'options', propertyId: status.id, included: new Set([doneId]) },
      { kind: 'checkbox', propertyId: blocked.id, want: true },
    ];
    expect(matchesFilters(reloaded!, filters)).toBe(true);

    const failing: PropertyFilter[] = [
      { kind: 'options', propertyId: status.id, included: new Set([doneId]) },
      { kind: 'checkbox', propertyId: blocked.id, want: false },
    ];
    expect(matchesFilters(reloaded!, failing)).toBe(false);
  });
});
