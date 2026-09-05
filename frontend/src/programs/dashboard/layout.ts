import type { DashboardLayout, DashboardPlacement } from '../../data/db';

/**
 * The dashboard's layout algebra: rows of columns, the same model Notion's
 * own blocks use.
 *
 * Every function here is pure and total — it takes a layout and returns a
 * new one, and never returns an invalid one. Two invariants do the work:
 * a row's `basis` values always sum to 100, and a row never sits empty. Hold
 * those and there is no arrangement a drag can reach that looks broken,
 * which is what lets the interaction itself stay completely unconstrained.
 */

/** Where a dragged widget would land, resolved from the pointer. */
export type DropTarget =
  /** A new row of its own, inserted at this index. */
  | { kind: 'row'; index: number }
  /** Into an existing row, as the column at this index. */
  | { kind: 'column'; row: number; index: number };

const minBasis = 10;

const place = (id: string, basis: number, height: number | null = null): DashboardPlacement => ({
  id,
  basis,
  height,
});

/** Spreads a row's widgets to sum to exactly 100, preserving their ratios. */
function rebalance(widgets: DashboardPlacement[]): DashboardPlacement[] {
  if (widgets.length === 0) return widgets;
  const total = widgets.reduce((sum, widget) => sum + widget.basis, 0);
  // A row whose bases somehow summed to nothing gets an even split rather
  // than a division by zero — the layout is never allowed to come back
  // invalid, whatever it was handed.
  if (total <= 0) return widgets.map((widget) => ({ ...widget, basis: 100 / widgets.length }));
  return widgets.map((widget) => ({ ...widget, basis: (widget.basis / total) * 100 }));
}

/** Drops empty rows and re-spreads every remaining one. */
export function normalize(layout: DashboardLayout): DashboardLayout {
  return {
    rows: layout.rows
      .filter((row) => row.widgets.length > 0)
      .map((row) => ({ widgets: rebalance(row.widgets) })),
    hidden: [...new Set(layout.hidden)],
  };
}

export const visibleIds = (layout: DashboardLayout): string[] =>
  layout.rows.flatMap((row) => row.widgets.map((widget) => widget.id));

export const findPlacement = (
  layout: DashboardLayout,
  id: string,
): DashboardPlacement | undefined =>
  layout.rows.flatMap((row) => row.widgets).find((widget) => widget.id === id);

/** Lifts a widget out, leaving the rest of its row to share the space. */
function without(layout: DashboardLayout, id: string): DashboardLayout {
  return {
    rows: layout.rows.map((row) => ({ widgets: row.widgets.filter((widget) => widget.id !== id) })),
    hidden: layout.hidden,
  };
}

/**
 * Moves a widget to wherever the pointer says, out of whatever row it was
 * in. Removing it first is what lets a widget be dragged within its own row
 * without a special case — by the time the target is applied, its old slot
 * no longer exists.
 */
export function moveWidget(
  layout: DashboardLayout,
  id: string,
  target: DropTarget,
): DashboardLayout {
  const existing = findPlacement(layout, id) ?? place(id, 100);
  const lifted = without(layout, id);
  // Which rows survive the lift matters to a row-kind target's index: a row
  // emptied by the lift shifts everything after it up by one.
  const surviving = lifted.rows.filter((row) => row.widgets.length > 0);
  const emptiedBefore = lifted.rows.filter(
    (row, index) => row.widgets.length === 0 && index < (target.kind === 'row' ? target.index : target.row),
  ).length;

  if (target.kind === 'row') {
    const index = Math.max(0, Math.min(surviving.length, target.index - emptiedBefore));
    const rows = [...surviving];
    rows.splice(index, 0, { widgets: [place(id, 100, existing.height)] });
    return normalize({ rows, hidden: lifted.hidden });
  }

  const rowIndex = Math.max(0, Math.min(surviving.length - 1, target.row - emptiedBefore));
  const row = surviving[rowIndex];
  if (!row) {
    return normalize({
      rows: [...surviving, { widgets: [place(id, 100, existing.height)] }],
      hidden: lifted.hidden,
    });
  }

  // Joining a row of n widgets takes an even 1/(n+1) share of it, and the
  // rest keep their ratios within what's left — the same thing Notion does
  // when a block is dropped into an existing column group.
  const share = 100 / (row.widgets.length + 1);
  const scaled = row.widgets.map((widget) => ({ ...widget, basis: widget.basis * (1 - share / 100) }));
  const widgets = [...scaled];
  widgets.splice(Math.max(0, Math.min(widgets.length, target.index)), 0, place(id, share, existing.height));

  const rows = surviving.map((candidate, index) => (index === rowIndex ? { widgets } : candidate));
  return normalize({ rows, hidden: lifted.hidden });
}

/** Takes a widget off the grid; it stays available under "Add widgets". */
export function hideWidget(layout: DashboardLayout, id: string): DashboardLayout {
  const lifted = without(layout, id);
  return normalize({ rows: lifted.rows, hidden: [...lifted.hidden, id] });
}

/** Puts a hidden widget back, in a row of its own at the bottom. */
export function showWidget(layout: DashboardLayout, id: string): DashboardLayout {
  return normalize({
    rows: [...layout.rows, { widgets: [place(id, 100)] }],
    hidden: layout.hidden.filter((hidden) => hidden !== id),
  });
}

/**
 * Trades width between the two widgets either side of one divider.
 *
 * Only those two move — every other column in the row keeps the width it
 * was given, which is what makes a divider feel like it belongs to the pair
 * it sits between rather than to the row as a whole.
 */
export function resizeAt(
  layout: DashboardLayout,
  rowIndex: number,
  dividerIndex: number,
  leftBasis: number,
): DashboardLayout {
  const row = layout.rows[rowIndex];
  const left = row?.widgets[dividerIndex];
  const right = row?.widgets[dividerIndex + 1];
  if (!row || !left || !right) return layout;

  const pair = left.basis + right.basis;
  const clamped = Math.max(minBasis, Math.min(pair - minBasis, leftBasis));
  const widgets = row.widgets.map((widget, index) => {
    if (index === dividerIndex) return { ...widget, basis: clamped };
    if (index === dividerIndex + 1) return { ...widget, basis: pair - clamped };
    return widget;
  });

  return { rows: layout.rows.map((candidate, index) => (index === rowIndex ? { widgets } : candidate)), hidden: layout.hidden };
}

/** Pins a widget's height, or hands it back to its content with `null`. */
export function setHeight(layout: DashboardLayout, id: string, height: number | null): DashboardLayout {
  return {
    rows: layout.rows.map((row) => ({
      widgets: row.widgets.map((widget) => (widget.id === id ? { ...widget, height } : widget)),
    })),
    hidden: layout.hidden,
  };
}

/** A first-time layout: the given widgets, `perRow` to a row. */
export function seed(ids: readonly string[], perRow = 2): DashboardLayout {
  const rows: DashboardLayout['rows'] = [];
  for (let index = 0; index < ids.length; index += perRow) {
    const slice = ids.slice(index, index + perRow);
    rows.push({ widgets: slice.map((id) => place(id, 100 / slice.length)) });
  }
  return { rows, hidden: [] };
}

/**
 * Decodes whatever a stored settings record holds into a valid layout —
 * the rows shape, the flat 12-column shape that preceded it, or nothing.
 *
 * Lives here rather than in `data/db.ts` because this file owns what a
 * layout *is*, the same rule `programs/habits/store.ts` follows for
 * `readHabitsForAssistant`. Both `data/sync.ts` (decoding a Firestore
 * document) and `app/session.tsx` (reading the local row) go through it, so
 * a legacy record migrates identically whichever side it arrives from.
 */
export function readDashboardLayout(value: unknown): DashboardLayout {
  const record = value as Record<string, unknown> | null | undefined;

  if (record && Array.isArray(record.rows)) {
    const rows = (record.rows as unknown[]).map((raw) => {
      const row = raw as Record<string, unknown>;
      const widgets = Array.isArray(row?.widgets) ? (row.widgets as unknown[]) : [];
      return {
        widgets: widgets.map((entry) => {
          const widget = entry as Record<string, unknown>;
          const height = Number(widget?.height);
          return place(
            String(widget?.id ?? ''),
            Number(widget?.basis ?? 0),
            Number.isFinite(height) && height > 0 ? height : null,
          );
        }),
      };
    });
    const hidden = Array.isArray(record.hidden) ? (record.hidden as unknown[]).map(String) : [];
    return normalize({ rows, hidden });
  }

  if (Array.isArray(value)) {
    return fromLegacy(
      (value as unknown[]).map((raw) => {
        const widget = raw as Record<string, unknown>;
        return {
          id: String(widget?.id ?? ''),
          hidden: Boolean(widget?.hidden),
          width: Number(widget?.width ?? 6),
        };
      }),
    );
  }

  return { rows: [], hidden: [] };
}

/**
 * Reads the flat, 12-column-span shape settings used before rows existed.
 *
 * Widths carry over as ratios; pinned pixel heights deliberately do not —
 * they were mostly defaults nobody chose, and content-driven height is the
 * better starting point now that a row's cards stretch to match each other.
 */
export function fromLegacy(
  widgets: readonly { id: string; hidden: boolean; width: number }[],
): DashboardLayout {
  const hidden = widgets.filter((widget) => widget.hidden).map((widget) => widget.id);
  const rows: DashboardLayout['rows'] = [];
  let current: { id: string; width: number }[] = [];
  let span = 0;

  for (const widget of widgets.filter((candidate) => !candidate.hidden)) {
    const width = Math.max(1, Math.min(12, widget.width || 6));
    if (span + width > 12 && current.length > 0) {
      rows.push({ widgets: current.map((entry) => place(entry.id, (entry.width / span) * 100)) });
      current = [];
      span = 0;
    }
    current.push({ id: widget.id, width });
    span += width;
  }
  if (current.length > 0) {
    rows.push({ widgets: current.map((entry) => place(entry.id, (entry.width / span) * 100)) });
  }

  return normalize({ rows, hidden });
}
