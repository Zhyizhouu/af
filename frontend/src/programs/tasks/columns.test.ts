import { describe, expect, it } from 'vitest';
import type { TaskPropertyRow, TaskPropertyType } from '../../data/db';
import { actionsColumnWidth, fitColumnWidths, minColumnWidth, titleColumnKey } from './columns';

const property = (id: string, type: TaskPropertyType): TaskPropertyRow => ({
  id,
  name: id,
  type,
  options: [],
  sortOrder: 0,
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
});

const total = (widths: Record<string, number>) =>
  Object.values(widths).reduce((sum, width) => sum + width, 0);

describe('fitColumnWidths', () => {
  it('fills the available width, leaving room for the actions column', () => {
    const widths = fitColumnWidths([property('status', 'status'), property('notes', 'text')], 1000);

    // Rounding can cost a pixel or two; the point is it fills the row rather
    // than leaving a gap or overflowing into a scrollbar.
    expect(total(widths)).toBeGreaterThan(1000 - actionsColumnWidth - 4);
    expect(total(widths)).toBeLessThanOrEqual(1000 - actionsColumnWidth + 4);
  });

  it('gives a text column more room than a checkbox', () => {
    const widths = fitColumnWidths([property('notes', 'text'), property('done', 'checkbox')], 1200);
    expect(widths.notes!).toBeGreaterThan(widths.done!);
  });

  it('gives the page title the most room of all', () => {
    const widths = fitColumnWidths([property('notes', 'text'), property('due', 'date')], 1200);
    expect(widths[titleColumnKey]!).toBeGreaterThan(widths.notes!);
  });

  it('would rather overflow than squeeze a column past reading width', () => {
    const many = Array.from({ length: 10 }, (_, index) => property(`p${index}`, 'checkbox'));
    const widths = fitColumnWidths(many, 300);

    expect(Object.values(widths).every((width) => width >= minColumnWidth)).toBe(true);
    // Overflowing is the deliberate outcome: the table scrolls rather than
    // becoming unreadable.
    expect(total(widths)).toBeGreaterThan(300);
  });

  it('handles a table with no properties at all', () => {
    const widths = fitColumnWidths([], 800);
    expect(Object.keys(widths)).toEqual([titleColumnKey]);
  });
});
