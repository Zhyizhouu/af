import { db, type CategoryRow } from '../../data/db';

/**
 * What an event *is*. Colour follows from the classification rather than being
 * chosen per event, so two "Work" events can never disagree.
 */

export interface EventCategory {
  /** Stored on the event and synced. The identity — never a position. */
  slug: string;
  label: string;
  toneIndex: number;
  builtIn: boolean;
}

export const builtInCategories: readonly EventCategory[] = [
  { slug: 'study', label: 'Study', toneIndex: 1, builtIn: true },
  { slug: 'work', label: 'Work', toneIndex: 2, builtIn: true },
  { slug: 'university', label: 'University', toneIndex: 3, builtIn: true },
  { slug: 'self', label: 'Self', toneIndex: 4, builtIn: true },
  { slug: 'health', label: 'Health', toneIndex: 5, builtIn: true },
  { slug: 'social', label: 'Social', toneIndex: 6, builtIn: true },
  { slug: 'other', label: 'Other', toneIndex: 0, builtIn: true },
];

/** For events whose category was deleted or never set. */
export const fallbackCategory: EventCategory = {
  slug: 'other',
  label: 'Other',
  toneIndex: 0,
  builtIn: true,
};

export async function listCategories(): Promise<EventCategory[]> {
  const custom = await db().categories.filter((row) => !row.deleted).toArray();
  return [
    ...builtInCategories,
    ...custom.map((row) => ({
      slug: row.id,
      label: row.label,
      toneIndex: row.toneIndex,
      builtIn: false,
    })),
  ];
}

export const categoryBySlug = (
  categories: EventCategory[],
  slug: string,
): EventCategory => categories.find((c) => c.slug === slug) ?? fallbackCategory;

export async function saveCategory(
  label: string,
  toneIndex: number,
  id?: string,
): Promise<CategoryRow> {
  const now = Date.now();
  const existing = id ? await db().categories.get(id) : undefined;
  const row: CategoryRow = {
    id: id ?? crypto.randomUUID(),
    label: label.trim() || 'Untitled',
    toneIndex,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deleted: false,
  };
  await db().categories.put(row);
  return row;
}

export async function deleteCategory(id: string): Promise<void> {
  const existing = await db().categories.get(id);
  if (!existing || existing.deleted) return;
  await db().categories.put({ ...existing, deleted: true, updatedAt: Date.now() });
}
