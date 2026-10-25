import {
  db,
  type TaskPageIcon,
  type TaskPageRow,
  type TaskPropertyOption,
  type TaskPropertyRow,
  type TaskPropertyType,
} from '../../data/db';
import { categoryTones } from '../../data/tones';
import { defaultPriorityOption, statusPropertyOf, statusRole } from './roles';

export { statusPropertyOf };

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

const seedOptionId = (propertySlug: string, label: string): string =>
  `seed:${propertySlug}:${label.toLowerCase().replace(/ /g, '-')}`;

/** Seeds a starting schema once, ever — a user who deletes every property is
 *  never re-seeded, since this only checks whether any row (including
 *  tombstones) has ever existed. */
export async function seedDefaultProperties(): Promise<void> {
  if ((await db().taskProperties.count()) > 0) return;
  const now = Date.now();

  const status: TaskPropertyRow = {
    id: 'seed:status',
    name: 'Status',
    type: 'status',
    options: [
      { id: seedOptionId('status', 'Not started'), label: 'Not started', toneIndex: 4 },
      { id: seedOptionId('status', 'In progress'), label: 'In progress', toneIndex: 0 },
      { id: seedOptionId('status', 'In Correction'), label: 'Quality Check', toneIndex: 3 },
      { id: seedOptionId('status', 'Done'), label: 'Done', toneIndex: 1 },
    ],
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };

  const priority: TaskPropertyRow = {
    id: 'seed:priority',
    name: 'Priority',
    type: 'select',
    options: [
      { id: seedOptionId('priority', 'High'), label: 'High', toneIndex: 5 },
      { id: seedOptionId('priority', 'Medium'), label: 'Medium', toneIndex: 3 },
      { id: seedOptionId('priority', 'Low'), label: 'Low', toneIndex: 4 },
    ],
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };

  await db().taskProperties.bulkPut([status, priority]);
}

const onceKey = (name: string): string => `af.tasks.${name}.v1:${db().name}`;

const hasRun = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

const markRun = (key: string): void => {
  try {
    localStorage.setItem(key, '1');
  } catch {
    return;
  }
};

/** Renames the legacy "In Correction" status option to "Quality Check" on
 *  every active status property, keeping its id and tone so existing page
 *  values keep resolving. Runs once per scope: a flag in localStorage stops
 *  every later call, and it writes nothing once no option matches. */
export async function migrateTaskProperties(): Promise<void> {
  const key = onceKey('migrated');
  if (hasRun(key)) return;
  const database = db();
  await database.transaction('rw', database.taskProperties, async () => {
    const now = Date.now();
    const changed: TaskPropertyRow[] = [];
    const rows = await database.taskProperties.filter((row) => !row.deleted && row.type === 'status').toArray();
    for (const row of rows) {
      if (!row.options.some(isLegacyCorrection)) continue;
      changed.push({
        ...row,
        options: row.options.map((option) =>
          isLegacyCorrection(option) ? { ...option, label: 'Quality Check' } : option,
        ),
        updatedAt: now,
      });
    }
    if (changed.length > 0) await database.taskProperties.bulkPut(changed);
  });
  markRun(key);
}

const isLegacyCorrection = (option: TaskPropertyOption): boolean =>
  option.label.trim().toLowerCase() === 'in correction';

/** Active properties, in column order. */
async function activeProperties(database: ReturnType<typeof db>): Promise<TaskPropertyRow[]> {
  const rows = await database.taskProperties.filter((row) => !row.deleted).toArray();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}

export const listProperties = (): Promise<TaskPropertyRow[]> => activeProperties(db());

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

/** Moves an option to an arbitrary index — what dragging an option chip in
 *  `PropertyPanel.tsx` needs; `reorderOption` above stays for the existing
 *  up/down buttons, which only ever need an adjacent swap. */
export async function moveOption(propertyId: string, optionId: string, toIndex: number): Promise<void> {
  const property = await db().taskProperties.get(propertyId);
  if (!property) return;
  const options = [...property.options];
  const from = options.findIndex((option) => option.id === optionId);
  if (from === -1) return;
  const [moved] = options.splice(from, 1);
  options.splice(Math.min(Math.max(toIndex, 0), options.length), 0, moved!);
  await db().taskProperties.put({ ...property, options, updatedAt: Date.now() });
}

// ---- pages ----

/** Active pages, in creation order. There is no manual row-reorder — only
 *  properties (columns) get explicit reordering; a page's position is fixed
 *  once created. */
export async function listPages(): Promise<TaskPageRow[]> {
  const rows = await db().taskPages.filter((row) => !row.deleted).toArray();
  // `?? ''` covers a page stored locally before `body` existed — without it,
  // `PageBody.tsx` would seed its editor with the literal string "undefined".
  return rows
    .map((row) => ({ ...row, body: row.body ?? '' }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}

/** The priority property: `seed:priority`, else the first select named
 *  "priority". Undefined once the user has deleted it. */
export function findPriorityProperty(
  properties: readonly TaskPropertyRow[],
): TaskPropertyRow | undefined {
  return (
    properties.find((property) => property.id === 'seed:priority') ??
    properties.find(
      (property) => property.type === 'select' && property.name.trim().toLowerCase() === 'priority',
    )
  );
}

/**
 * The option every page starts with, per property that has one: the first
 * status property defaults to "not started" (else its first option), and the
 * priority property (`seed:priority`, else the first select named "priority")
 * defaults to "medium" (else its middle option). Shared by `createPage` and
 * `fillTaskDefaults` so a new page and a backfilled one never disagree.
 */
export function defaultOptions(
  properties: readonly TaskPropertyRow[],
): { property: TaskPropertyRow; option: TaskPropertyOption }[] {
  const picked: { property: TaskPropertyRow; option: TaskPropertyOption }[] = [];

  const status = statusPropertyOf(properties);
  const statusOption =
    status?.options.find((option) => statusRole(status, option) === 'todo') ?? status?.options[0];
  if (status && statusOption) picked.push({ property: status, option: statusOption });

  const priority = findPriorityProperty(properties);
  const priorityOption = priority && defaultPriorityOption(priority);
  if (priority && priorityOption) picked.push({ property: priority, option: priorityOption });

  return picked;
}

/** `initialValues` are merged over the defaults, so a page is written once
 *  with everything it starts with. */
export async function createPage(
  title?: string,
  initialValues: Record<string, unknown> = {},
): Promise<TaskPageRow> {
  const now = Date.now();
  const values: Record<string, unknown> = {};
  for (const { property, option } of defaultOptions(await listProperties())) {
    values[property.id] = option.id;
  }
  Object.assign(values, initialValues);
  const row: TaskPageRow = {
    id: crypto.randomUUID(),
    title: title?.trim() || 'Untitled',
    icon: null,
    values,
    body: '',
    sortOrder: await db().taskPages.count(),
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };
  await db().taskPages.put(row);
  return row;
}

/**
 * The one-time backfill: gives every active page whose status or priority
 * value is missing, or points at an option that no longer exists, the same
 * default `createPage` would. Pages already holding a valid value are
 * untouched, and `updatedAt` moves only on pages that change. It runs once per
 * scope (and only once there are defaults to give), so a value cleared or
 * orphaned later stays unset, which the triage grid shows in its Unset
 * row and column.
 */
export async function fillTaskDefaults(): Promise<void> {
  const key = onceKey('backfilled');
  if (hasRun(key)) return;
  const database = db();
  let ran = false;
  await database.transaction('rw', database.taskProperties, database.taskPages, async () => {
    const defaults = defaultOptions(await activeProperties(database));
    if (defaults.length === 0) return;
    ran = true;
    const now = Date.now();
    const changed: TaskPageRow[] = [];
    const pages = await database.taskPages.filter((row) => !row.deleted).toArray();
    for (const page of pages) {
      let values = page.values;
      for (const { property, option } of defaults) {
        const current = values[property.id];
        if (typeof current === 'string' && property.options.some((o) => o.id === current)) continue;
        values = { ...values, [property.id]: option.id };
      }
      if (values !== page.values) changed.push({ ...page, values, updatedAt: now });
    }
    if (changed.length > 0) await database.taskPages.bulkPut(changed);
  });
  if (ran) markRun(key);
}

let sessionPrep: { scope: string; done: Promise<void> } | null = null;

/** Runs `migrateTaskProperties` then `fillTaskDefaults` once per session
 *  (per open database); every Task Tracker entry point awaits the same
 *  promise. A failed run is forgotten so the next load retries. */
export function prepareTaskData(): Promise<void> {
  const scope = db().name;
  if (!sessionPrep || sessionPrep.scope !== scope) {
    const done = migrateTaskProperties()
      .then(fillTaskDefaults)
      .catch((error) => {
        sessionPrep = null;
        throw error;
      });
    sessionPrep = { scope, done };
  }
  return sessionPrep.done;
}

export async function savePageField(
  id: string,
  patch: { title?: string; icon?: TaskPageIcon | null; body?: string },
): Promise<void> {
  const page = await db().taskPages.get(id);
  if (!page) return;
  await db().taskPages.put({
    ...page,
    ...(patch.title !== undefined ? { title: patch.title.trim() || 'Untitled' } : {}),
    ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
    ...(patch.body !== undefined ? { body: patch.body } : {}),
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
  const { taskPages, taskProperties, todoItems } = db();
  await db().transaction('rw', taskPages, taskProperties, todoItems, async () => {
    const page = await taskPages.get(pageId);
    if (!page) return;
    await taskPages.put({
      ...page,
      values: { ...page.values, [propertyId]: value },
      updatedAt: Date.now(),
    });
    const property = statusPropertyOf(await taskProperties.toArray());
    if (property?.id !== propertyId) return;
    const option = property.options.find((candidate) => candidate.id === value);
    if (statusRole(property, option) !== 'done') return;
    const now = Date.now();
    const open = await liveTodosOf(pageId).then((rows) => rows.filter((row) => !row.checked));
    if (open.length > 0) {
      await todoItems.bulkPut(open.map((row) => ({ ...row, checked: true, doneAt: now, updatedAt: now })));
    }
  });
}

const liveTodosOf = (taskId: string) =>
  db().todoItems.where('taskId').equals(taskId).filter((row) => !row.deleted).toArray();

/** Sets a task's status from its linked to-dos: all ticked is done, some is
 *  doing, none is todo. Does nothing without to-dos, a status property, or a
 *  matching option. Writes the page directly so it never ticks to-dos back. */
export async function syncTaskStatusFromTodos(taskId: string): Promise<void> {
  const page = await db().taskPages.get(taskId);
  if (!page || page.deleted) return;
  const property = statusPropertyOf(await db().taskProperties.toArray());
  if (!property) return;
  const todos = await liveTodosOf(taskId);
  if (todos.length === 0) return;
  const checked = todos.filter((row) => row.checked).length;
  const role = checked === todos.length ? 'done' : checked > 0 ? 'doing' : 'todo';
  const option = property.options.find((candidate) => statusRole(property, candidate) === role);
  if (!option || page.values[property.id] === option.id) return;
  await db().taskPages.put({
    ...page,
    values: { ...page.values, [property.id]: option.id },
    updatedAt: Date.now(),
  });
}

export async function deletePage(id: string): Promise<void> {
  const existing = await db().taskPages.get(id);
  if (!existing || existing.deleted) return;
  await db().transaction('rw', db().taskPages, db().todoItems, async () => {
    const now = Date.now();
    await db().taskPages.put({ ...existing, deleted: true, updatedAt: now });
    const todos = await liveTodosOf(id);
    if (todos.length > 0) await db().todoItems.bulkPut(todos.map((row) => ({ ...row, deleted: true, updatedAt: now })));
  });
}

// ---- filters ----

export type PropertyFilter =
  | { kind: 'options'; propertyId: string; excluded: Set<string> }
  | { kind: 'contains'; propertyId: string; text: string }
  | { kind: 'checkbox'; propertyId: string; want: boolean };

/**
 * AND across every active filter clause (at most one clause per property).
 * An `options` clause lists the option ids the user has unticked, so with no
 * clause every option is shown. A select/status value is a single option id,
 * hidden only when it is excluded; a multiSelect value is an array of them,
 * hidden only when it is non-empty and every id is excluded. A page with no
 * value ("Unset") always passes. `options` clauses branch on the value's own
 * shape rather than needing the property's type passed in, since the two
 * never collide (a select value is never an array, a multiSelect value
 * always is).
 */
export function matchesFilters(page: TaskPageRow, filters: readonly PropertyFilter[]): boolean {
  return filters.every((filter) => {
    const value = page.values[filter.propertyId];
    switch (filter.kind) {
      case 'options':
        if (Array.isArray(value)) {
          return value.length === 0 || (value as unknown[]).some((id) => !filter.excluded.has(String(id)));
        }
        return typeof value !== 'string' || !filter.excluded.has(value);
      case 'contains':
        return typeof value === 'string' && value.toLowerCase().includes(filter.text.toLowerCase());
      case 'checkbox':
        return Boolean(value) === filter.want;
    }
  });
}
