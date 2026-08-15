import { db, type CategoryRow } from '../../data/db';

/**
 * What an event *is*. Colour follows from the classification rather than being
 * chosen per event, so two "Work" events can never disagree.
 */

/**
 * A theme-aware colour pair.
 *
 * Categories reference a tone by **index**, never a raw colour, so every one
 * stays legible on both themes — a stored white is invisible on a white panel.
 * Append only, never reorder: the index is what is stored, so moving one
 * recolours every category that referenced it.
 */
export interface CategoryTone {
  name: string;
  light: string;
  dark: string;
}

export const categoryTones: readonly CategoryTone[] = [
  { name: 'Blue', light: '#3b49ff', dark: '#5d69ff' },
  { name: 'Green', light: '#2f8f4e', dark: '#4fbf74' },
  { name: 'Orange', light: '#c2621c', dark: '#e8883f' },
  // "Yellow" as a legible amber — pure yellow fails against a white panel.
  { name: 'Yellow', light: '#a37a00', dark: '#e0b830' },
  // "White" as a neutral: slate on light, near-white on dark.
  { name: 'Neutral', light: '#64748b', dark: '#e2e5ea' },
  { name: 'Rose', light: '#c02b5b', dark: '#f06a94' },
  { name: 'Violet', light: '#6d28d9', dark: '#a78bfa' },
  { name: 'Teal', light: '#0f766e', dark: '#2dd4bf' },
  { name: 'Cyan', light: '#0369a1', dark: '#38bdf8' },
  { name: 'Brown', light: '#7c4a21', dark: '#c08552' },
];

export const toneAt = (index: number): CategoryTone =>
  categoryTones[Math.min(Math.max(index, 0), categoryTones.length - 1)]!;

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

/**
 * The colour to paint a category, resolved against the active theme.
 *
 * Read off the document rather than passed down, because the theme is a CSS
 * variable and this has to agree with it at the moment of painting.
 */
export function toneColor(index: number): string {
  const tone = toneAt(index);
  const explicit = document.documentElement.dataset.theme;
  const dark =
    explicit === 'dark' ||
    (!explicit && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  return dark ? tone.dark : tone.light;
}

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
