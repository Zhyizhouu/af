import type { AgendaEntry } from '../../data/agenda';
import { db } from '../../data/db';
import { toneColor } from '../../data/tones';

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

/** The colour an agenda entry is drawn in, everywhere it appears. An event
 *  takes its category's tone; a proctor session or a Task Tracker due date
 *  has no category of its own and reads as one fixed orange. */
export const entryColour = (entry: AgendaEntry, categories: EventCategory[]): string =>
  entry.kind === 'event' ? toneColor(categoryBySlug(categories, entry.category).toneIndex) : '#fb923c';
