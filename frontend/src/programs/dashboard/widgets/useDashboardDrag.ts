import { useEffect, useRef, useState, type RefObject } from 'react';
import { lockCursor } from '../../../components/pointerDrag';
import type { DropTarget } from '../layout';

export interface DropIndicator {
  /** All four are relative to the grid container's own box. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How close to a row's top or bottom edge counts as "a new row", not "into
 *  this row" — capped so a short row still has a usable middle. */
const edgeBand = (height: number) => Math.min(24, height * 0.25);

/**
 * Dragging a widget to a new place on the dashboard.
 *
 * Nothing reflows mid-drag. The widget follows the pointer, an indicator
 * line says exactly where it would land, and the layout only changes on
 * release — which is both what Notion does and, having tried the
 * alternative, the calmer of the two: live-reflowing on every pointermove
 * means the thing you are aiming at keeps moving out from under you.
 *
 * The vertical middle of a row means "join this row as a column"; its top
 * and bottom edges mean "a new row here". That single rule is the whole
 * grammar — every arrangement is reachable through it.
 */
export function useDashboardDrag(
  grid: RefObject<HTMLDivElement | null>,
  onDrop: (id: string, target: DropTarget) => void,
) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [indicator, setIndicator] = useState<DropIndicator | null>(null);
  const target = useRef<DropTarget | null>(null);
  const start = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!dragId) return;

    function onMove(event: globalThis.PointerEvent) {
      setOffset({ x: event.clientX - start.current.x, y: event.clientY - start.current.y });

      const container = grid.current;
      if (!container) return;
      const box = container.getBoundingClientRect();
      const rows = [...container.querySelectorAll<HTMLElement>('[data-row-index]')].map((element) => ({
        element,
        rect: element.getBoundingClientRect(),
        index: Number(element.dataset.rowIndex),
      }));

      if (rows.length === 0) {
        target.current = { kind: 'row', index: 0 };
        setIndicator({ x: 0, y: 0, width: box.width, height: 2 });
        return;
      }

      // The row the pointer is in, or the nearest one when it is in a gap
      // or off the ends — a drag that leaves the grid still has to mean
      // something rather than losing its target.
      const inside = rows.find((row) => event.clientY >= row.rect.top && event.clientY <= row.rect.bottom);
      const nearest =
        inside ??
        rows.reduce((best, row) => {
          const distance = Math.min(
            Math.abs(event.clientY - row.rect.top),
            Math.abs(event.clientY - row.rect.bottom),
          );
          const bestDistance = Math.min(
            Math.abs(event.clientY - best.rect.top),
            Math.abs(event.clientY - best.rect.bottom),
          );
          return distance < bestDistance ? row : best;
        }, rows[0]!);

      const band = edgeBand(nearest.rect.height);
      const aboveBand = event.clientY < nearest.rect.top + band;
      const belowBand = event.clientY > nearest.rect.bottom - band;

      if (aboveBand || belowBand) {
        target.current = { kind: 'row', index: aboveBand ? nearest.index : nearest.index + 1 };
        setIndicator({
          x: 0,
          y: (aboveBand ? nearest.rect.top : nearest.rect.bottom) - box.top - 1,
          width: box.width,
          height: 2,
        });
        return;
      }

      const widgets = [...nearest.element.querySelectorAll<HTMLElement>('[data-widget-id]')].map((element) =>
        element.getBoundingClientRect(),
      );
      const index = widgets.filter((rect) => event.clientX > rect.left + rect.width / 2).length;
      const edge = index < widgets.length ? widgets[index]!.left : (widgets[widgets.length - 1]?.right ?? box.left);

      target.current = { kind: 'column', row: nearest.index, index };
      setIndicator({
        x: edge - box.left - 1,
        y: nearest.rect.top - box.top,
        width: 2,
        height: nearest.rect.height,
      });
    }

    function onUp() {
      const dropped = target.current;
      const id = dragId;
      target.current = null;
      setDragId(null);
      setIndicator(null);
      setOffset({ x: 0, y: 0 });
      if (id && dropped) onDrop(id, dropped);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragId, grid, onDrop]);

  const startDrag = (id: string) => (event: { preventDefault: () => void; clientX: number; clientY: number }) => {
    event.preventDefault();
    start.current = { x: event.clientX, y: event.clientY };
    target.current = null;
    setDragId(id);
    const unlock = lockCursor('grabbing');
    window.addEventListener('pointerup', unlock, { once: true });
  };

  return { dragId, offset, indicator, startDrag };
}
