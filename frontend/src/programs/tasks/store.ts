import {
  db,
  type TaskPageIcon,
  type TaskPageRow,
  type TaskPropertyOption,
  type TaskPropertyRow,
  type TaskPropertyType,
} from '../../data/db';
import { categoryTones } from '../../data/tones';

/**
 * Task Tracker: user-defined typed properties (columns) and the pages (rows)
 * that carry values for them.
 */

/** A custom-uploaded icon's cap — same figure the AI assistant already uses
 *  for attachments, for the same reason: it lives inline in a synced
 *  document, so it has to stay small regardless of what Firestore itself
 *  allows. Declared locally rather than imported from the AI program, which
 *  has no other cross-program coupling to add here. */
export const maxIconBytes = 96 * 1024;

// ---- properties ----

/** Seeds a starting schema once, ever — a user who deletes every property is
 *  never re-seeded, since this only checks whether any row (including
 *  tombstones) has ever existed. */
export async function seedDefaultProperties(): Promise<void> {
  if ((await db().taskProperties.count()) > 0) return;
  const now = Date.now();

  const status: TaskPropertyRow = {
    id: crypto.randomUUID(),
    name: 'Status',
    type: 'status',
    options: [
      { id: crypto.randomUUID(), label: 'Not started', toneIndex: 4 },
      { id: crypto.randomUUID(), label: 'In progress', toneIndex: 0 },
      { id: crypto.randomUUID(), label: 'In Correction', toneIndex: 3 },
      { id: crypto.randomUUID(), label: 'Done', toneIndex: 1 },
    ],
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };

  const priority: TaskPropertyRow = {
    id: crypto.randomUUID(),
    name: 'Priority',
    type: 'select',
    options: [
      { id: crypto.randomUUID(), label: 'High', toneIndex: 5 },
      { id: crypto.randomUUID(), label: 'Medium', toneIndex: 3 },
      { id: crypto.randomUUID(), label: 'Low', toneIndex: 4 },
    ],
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };

  await db().taskProperties.bulkPut([status, priority]);
}

/** Active properties, in column order. */
export async function listProperties(): Promise<TaskPropertyRow[]> {
  const rows = await db().taskProperties.filter((row) => !row.deleted).toArray();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}

/**
 * Creates or renames a property. `type` is only honoured on create — an
 * update always keeps the existing type, enforcing at the data layer that a
 * property's type never changes after creation (see TaskPropertyRow.type).
 */
export async function saveProperty(input: {
  id?: string;
  name: string;
  type: TaskPropertyType;
}): Promise<TaskPropertyRow> {
  const now = Date.now();
  const existing = input.id ? await db().taskProperties.get(input.id) : undefined;
  const count = existing ? 0 : await db().taskProperties.count();

  const row: TaskPropertyRow = {
    id: input.id ?? crypto.randomUUID(),
    name: input.name.trim() || 'Untitled',
    type: existing?.type ?? input.type,
    options: existing?.options ?? [],
    sortOrder: existing?.sortOrder ?? count,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deleted: false,
  };
  await db().taskProperties.put(row);
  return row;
}

export async function deleteProperty(id: string): Promise<void> {
  const existing = await db().taskProperties.get(id);
  if (!existing || existing.deleted) return;
  await db().taskProperties.put({ ...existing, deleted: true, updatedAt: Date.now() });
}

/** Swaps sort order with the adjacent property. A no-op at either end. */
export async function reorderProperty(id: string, direction: -1 | 1): Promise<void> {
  const ordered = await listProperties();
  const index = ordered.findIndex((row) => row.id === id);
  const swapIndex = index + direction;
  if (index === -1 || swapIndex < 0 || swapIndex >= ordered.length) return;

  const a = ordered[index]!;
  const b = ordered[swapIndex]!;
  const now = Date.now();
  await db().taskProperties.bulkPut([
    { ...a, sortOrder: b.sortOrder, updatedAt: now },
    { ...b, sortOrder: a.sortOrder, updatedAt: now },
  ]);
}

// ---- options (embedded in the owning property) ----

const nextToneIndex = (options: readonly TaskPropertyOption[]): number =>
  options.length % categoryTones.length;

async function updateOption(
  propertyId: string,
  optionId: string,
  update: (option: TaskPropertyOption) => TaskPropertyOption,
): Promise<void> {
  const property = await db().taskProperties.get(propertyId);
  if (!property) return;
  await db().taskProperties.put({
    ...property,
    options: property.options.map((option) => (option.id === optionId ? update(option) : option)),
    updatedAt: Date.now(),
  });
}

export async function addOption(propertyId: string, label: string): Promise<void> {
  const property = await db().taskProperties.get(propertyId);
  if (!property) return;
  const option: TaskPropertyOption = {
    id: crypto.randomUUID(),
    label: label.trim() || 'Untitled',
    toneIndex: nextToneIndex(property.options),
  };
  await db().taskProperties.put({
    ...property,
    options: [...property.options, option],
    updatedAt: Date.now(),
  });
}

export async function renameOption(propertyId: string, optionId: string, label: string): Promise<void> {
  await updateOption(propertyId, optionId, (option) => ({
    ...option,
    label: label.trim() || 'Untitled',
  }));
}

export async function recolorOption(
  propertyId: string,
  optionId: string,
  toneIndex: number,
): Promise<void> {
  await updateOption(propertyId, optionId, (option) => ({ ...option, toneIndex }));
}

/** No cascade into any page's values — an orphaned option id is looked up
 *  and skipped wherever values are rendered, never cleaned up eagerly. */
export async function deleteOption(propertyId: string, optionId: string): Promise<void> {
  const property = await db().taskProperties.get(propertyId);
  if (!property) return;
  await db().taskProperties.put({
    ...property,
    options: property.options.filter((option) => option.id !== optionId),
    updatedAt: Date.now(),
  });
}

export async function reorderOption(
  propertyId: string,
  optionId: string,
  direction: -1 | 1,
): Promise<void> {
  const property = await db().taskProperties.get(propertyId);
  if (!property) return;
  const index = property.options.findIndex((option) => option.id === optionId);
  const swapIndex = index + direction;
  if (index === -1 || swapIndex < 0 || swapIndex >= property.options.length) return;

  const options = [...property.options];
  [options[index], options[swapIndex]] = [options[swapIndex]!, options[index]!];
  await db().taskProperties.put({ ...property, options, updatedAt: Date.now() });
}

// ---- pages ----

/** Active pages, in creation order. There is no manual row-reorder — only
 *  properties (columns) get explicit reordering; a page's position is fixed
 *  once created. */
export async function listPages(): Promise<TaskPageRow[]> {
  const rows = await db().taskPages.filter((row) => !row.deleted).toArray();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}

export async function createPage(title?: string): Promise<TaskPageRow> {
  const now = Date.now();
  const row: TaskPageRow = {
    id: crypto.randomUUID(),
    title: title?.trim() || 'Untitled',
    icon: null,
    values: {},
    sortOrder: await db().taskPages.count(),
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };
  await db().taskPages.put(row);
  return row;
}

export async function savePageField(
  id: string,
  patch: { title?: string; icon?: TaskPageIcon | null },
): Promise<void> {
  const page = await db().taskPages.get(id);
  if (!page) return;
  await db().taskPages.put({
    ...page,
    ...(patch.title !== undefined ? { title: patch.title.trim() || 'Untitled' } : {}),
    ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
    updatedAt: Date.now(),
  });
}

/** The one write path for every cell/detail-panel edit, regardless of the
 *  property's type — the caller supplies the right-shaped value per the
 *  contract documented on TaskPageRow.values. */
export async function savePageValue(
  pageId: string,
  propertyId: string,
  value: unknown,
): Promise<void> {
  const page = await db().taskPages.get(pageId);
  if (!page) return;
  await db().taskPages.put({
    ...page,
    values: { ...page.values, [propertyId]: value },
    updatedAt: Date.now(),
  });
}

export async function deletePage(id: string): Promise<void> {
  const existing = await db().taskPages.get(id);
  if (!existing || existing.deleted) return;
  await db().taskPages.put({ ...existing, deleted: true, updatedAt: Date.now() });
}

// ---- filters ----

export type PropertyFilter =
  | { kind: 'options'; propertyId: string; included: Set<string> }
  | { kind: 'contains'; propertyId: string; text: string }
  | { kind: 'checkbox'; propertyId: string; want: boolean };

/**
 * AND across every active filter clause (at most one clause per property).
 * A select/status value is a single option id; a multiSelect value is an
 * array of them — `options` clauses branch on the value's own shape rather
 * than needing the property's type passed in, since the two never collide
 * (a select value is never an array, a multiSelect value always is).
 */
export function matchesFilters(page: TaskPageRow, filters: readonly PropertyFilter[]): boolean {
  return filters.every((filter) => {
    const value = page.values[filter.propertyId];
    switch (filter.kind) {
      case 'options':
        if (Array.isArray(value)) {
          return (value as unknown[]).some((id) => filter.included.has(String(id)));
        }
        return typeof value === 'string' && filter.included.has(value);
      case 'contains':
        return typeof value === 'string' && value.toLowerCase().includes(filter.text.toLowerCase());
      case 'checkbox':
        return Boolean(value) === filter.want;
    }
  });
}
