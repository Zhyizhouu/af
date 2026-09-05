import type { TaskPropertyRow, TaskPropertyType } from '../../data/db';

/** The page-title column's key in the stored width map. */
export const titleColumnKey = 'title';
export const actionsColumnWidth = 36;
export const minColumnWidth = 80;
export const defaultTitleWidth = 240;
export const defaultColumnWidth = 160;

/**
 * How much room a column earns, relative to the others.
 *
 * A checkbox needs a tick's width and a date needs a date's; giving every
 * column the same share is what leaves a table with a cramped Notes column
 * beside an acre of empty Checkbox. These are ratios, not pixels — the
 * actual widths fall out of whatever space the table has.
 */
const weights: Record<TaskPropertyType, number> = {
  text: 2,
  url: 1.8,
  multiSelect: 1.6,
  select: 1.2,
  status: 1.2,
  date: 1.1,
  number: 0.8,
  checkbox: 0.6,
};

/** The title carries the page's name — the one column always worth reading. */
const titleWeight = 2.6;

/**
 * Column widths that exactly fill `availableWidth`, weighted by what each
 * property type actually needs.
 *
 * Falls back to overflowing (and so to a scrollbar) rather than squeezing
 * anything below `minColumnWidth`: a table too narrow for its columns should
 * scroll, not become unreadable.
 */
export function fitColumnWidths(
  properties: readonly TaskPropertyRow[],
  availableWidth: number,
): Record<string, number> {
  const room = Math.max(0, availableWidth - actionsColumnWidth);
  const entries = [
    { key: titleColumnKey, weight: titleWeight },
    ...properties.map((property) => ({ key: property.id, weight: weights[property.type] ?? 1 })),
  ];
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return {};

  return Object.fromEntries(
    entries.map((entry) => [
      entry.key,
      Math.max(minColumnWidth, Math.round((room * entry.weight) / total)),
    ]),
  );
}
