import { describe, expect, it } from 'vitest';
import {
  autoArrange,
  fromLegacy,
  hideWidget,
  moveWidget,
  readDashboardLayout,
  resizeAt,
  seed,
  setHeight,
  showWidget,
  visibleIds,
} from './layout';

/**
 * The invariants, not the arithmetic: a row's widths always sum to 100 and
 * no row is ever empty. Hold those and no drag can produce a broken layout,
 * which is what lets the interaction itself stay unconstrained.
 */
const sums = (layout: { rows: { widgets: { basis: number }[] }[] }) =>
  layout.rows.map((row) => Math.round(row.widgets.reduce((total, widget) => total + widget.basis, 0)));

describe('seed', () => {
  it('lays widgets out two to a row by default', () => {
    const layout = seed(['a', 'b', 'c']);
    expect(layout.rows).toHaveLength(2);
    expect(layout.rows[0]!.widgets.map((w) => w.id)).toEqual(['a', 'b']);
    expect(layout.rows[1]!.widgets.map((w) => w.id)).toEqual(['c']);
    expect(sums(layout)).toEqual([100, 100]);
  });

  it('starts every widget content-driven rather than pinned', () => {
    expect(seed(['a']).rows[0]!.widgets[0]!.height).toBeNull();
  });
});

describe('autoArrange', () => {
  const app = (id: string, rank: number) => ({ id, app: true, rank });
  const panel = (id: string, rank: number) => ({ id, app: false, rank });

  it('puts the launcher dock first, then panels two to a row in rank order', () => {
    const layout = autoArrange([
      panel('completion', 6),
      app('app:calendar', 1),
      panel('today', 1),
      app('app:tasks', 2),
      panel('upNext', 2),
    ]);

    expect(layout.rows.map((row) => row.widgets.map((w) => w.id))).toEqual([
      ['app:calendar', 'app:tasks'],
      ['today', 'upNext'],
      ['completion'],
    ]);
    expect(sums(layout)).toEqual([100, 100, 100]);
  });

  it('releases every pinned height', () => {
    const pinned = [panel('today', 1), panel('upNext', 2)];
    const layout = autoArrange(pinned);
    expect(layout.rows.flatMap((row) => row.widgets).every((w) => w.height === null)).toBe(true);
  });

  it('splits a launcher dock evenly rather than lopsidedly', () => {
    const many = Array.from({ length: 10 }, (_, index) => app(`app:${index}`, index));
    const layout = autoArrange(many);

    // Ten launchers become 5 + 5, never 8 + 2.
    expect(layout.rows.map((row) => row.widgets.length)).toEqual([5, 5]);
  });

  it('keeps hidden widgets hidden', () => {
    const layout = autoArrange([panel('today', 1)], ['todo']);
    expect(layout.hidden).toEqual(['todo']);
    expect(visibleIds(layout)).toEqual(['today']);
  });

  it('handles an empty dashboard without inventing rows', () => {
    expect(autoArrange([])).toEqual({ rows: [], hidden: [] });
  });
});

describe('moveWidget', () => {
  it('joins an existing row as a column, splitting it evenly', () => {
    const layout = moveWidget(seed(['a', 'b', 'c']), 'c', { kind: 'column', row: 0, index: 2 });

    expect(layout.rows).toHaveLength(1);
    expect(layout.rows[0]!.widgets.map((w) => w.id)).toEqual(['a', 'b', 'c']);
    expect(sums(layout)).toEqual([100]);
  });

  it('inserts as a row of its own', () => {
    const layout = moveWidget(seed(['a', 'b']), 'b', { kind: 'row', index: 0 });

    expect(layout.rows.map((row) => row.widgets.map((w) => w.id))).toEqual([['b'], ['a']]);
    expect(sums(layout)).toEqual([100, 100]);
  });

  it('drops a row that its last widget left, rather than leaving it empty', () => {
    const layout = moveWidget(seed(['a', 'b', 'c']), 'c', { kind: 'column', row: 0, index: 0 });

    expect(layout.rows).toHaveLength(1);
    expect(layout.rows[0]!.widgets.map((w) => w.id)).toEqual(['c', 'a', 'b']);
  });

  it('reorders within a row without duplicating or losing the widget', () => {
    const layout = moveWidget(seed(['a', 'b'], 2), 'a', { kind: 'column', row: 0, index: 1 });

    expect(visibleIds(layout).sort()).toEqual(['a', 'b']);
    expect(layout.rows[0]!.widgets.map((w) => w.id)).toEqual(['b', 'a']);
    expect(sums(layout)).toEqual([100]);
  });

  it('keeps a pinned height through the move', () => {
    const pinned = setHeight(seed(['a', 'b']), 'a', 320);
    const layout = moveWidget(pinned, 'a', { kind: 'row', index: 0 });

    expect(layout.rows[0]!.widgets[0]!.height).toBe(320);
  });
});

describe('hideWidget / showWidget', () => {
  it('takes a widget off the grid and offers it back', () => {
    const hiddenLayout = hideWidget(seed(['a', 'b']), 'a');
    expect(visibleIds(hiddenLayout)).toEqual(['b']);
    expect(hiddenLayout.hidden).toEqual(['a']);
    expect(sums(hiddenLayout)).toEqual([100]);

    const restored = showWidget(hiddenLayout, 'a');
    expect(visibleIds(restored).sort()).toEqual(['a', 'b']);
    expect(restored.hidden).toEqual([]);
  });
});

describe('resizeAt', () => {
  it('trades width between the pair either side of the divider only', () => {
    const layout = resizeAt(seed(['a', 'b', 'c'], 3), 0, 0, 50);
    const [a, b, c] = layout.rows[0]!.widgets;

    expect(Math.round(a!.basis)).toBe(50);
    // a + b was 66.6; a took 50, so b keeps the remainder.
    expect(Math.round(a!.basis + b!.basis)).toBe(67);
    // c never moved.
    expect(Math.round(c!.basis)).toBe(33);
  });

  it('refuses to collapse either side past a usable minimum', () => {
    const layout = resizeAt(seed(['a', 'b']), 0, 0, 400);
    const [a, b] = layout.rows[0]!.widgets;

    expect(a!.basis).toBeLessThanOrEqual(90);
    expect(b!.basis).toBeGreaterThanOrEqual(10);
    expect(sums(layout)).toEqual([100]);
  });
});

describe('readDashboardLayout', () => {
  it('migrates the flat 12-column shape into rows', () => {
    const layout = readDashboardLayout([
      { id: 'a', hidden: false, width: 6 },
      { id: 'b', hidden: false, width: 6 },
      { id: 'c', hidden: false, width: 12 },
      { id: 'd', hidden: true, width: 6 },
    ]);

    expect(layout.rows.map((row) => row.widgets.map((w) => w.id))).toEqual([['a', 'b'], ['c']]);
    expect(layout.hidden).toEqual(['d']);
    expect(sums(layout)).toEqual([100, 100]);
  });

  it('drops legacy pixel heights, leaving widgets content-driven', () => {
    const layout = fromLegacy([{ id: 'a', hidden: false, width: 12 }]);
    expect(layout.rows[0]!.widgets[0]!.height).toBeNull();
  });

  it('reads the rows shape back unchanged', () => {
    const original = setHeight(seed(['a', 'b']), 'b', 200);
    const round = readDashboardLayout(original);

    expect(round.rows.map((row) => row.widgets.map((w) => w.id))).toEqual([['a', 'b']]);
    expect(round.rows[0]!.widgets[1]!.height).toBe(200);
  });

  it('answers with an empty layout for anything it cannot read', () => {
    expect(readDashboardLayout(undefined)).toEqual({ rows: [], hidden: [] });
    expect(readDashboardLayout('nonsense')).toEqual({ rows: [], hidden: [] });
  });
});
