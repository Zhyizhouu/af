import { useEffect, useRef, useState } from 'react';
import { lockCursor } from '../../../components/pointerDrag';

export interface LiveBasis {
  row: number;
  divider: number;
  basis: number;
}

/**
 * The divider between two neighbouring widgets in a row.
 *
 * Continuous, in percentages of the row rather than steps of a column grid
 * — the point of dividers is that any split is reachable, and a snapping
 * one is just a preset picker wearing a drag handle. Only the pair either
 * side moves; the rest of the row keeps what it had, which is what makes a
 * divider feel like it belongs to the two things it sits between.
 *
 * `live` is the in-progress split, applied to the rendered layout by the
 * caller; `commit` only fires on release.
 */
export function useRowResize(commit: (row: number, divider: number, basis: number) => void) {
  const [live, setLive] = useState<LiveBasis | null>(null);
  const drag = useRef<{
    row: number;
    divider: number;
    startX: number;
    startBasis: number;
    rowWidth: number;
  } | null>(null);
  const liveRef = useRef<LiveBasis | null>(null);

  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  useEffect(() => {
    function onMove(event: globalThis.PointerEvent) {
      const current = drag.current;
      if (!current || current.rowWidth === 0) return;
      const deltaPercent = ((event.clientX - current.startX) / current.rowWidth) * 100;
      setLive({ row: current.row, divider: current.divider, basis: current.startBasis + deltaPercent });
    }
    function onUp() {
      if (!drag.current) return;
      drag.current = null;
      const last = liveRef.current;
      setLive(null);
      if (last) commit(last.row, last.divider, last.basis);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [commit]);

  const startResize =
    (row: number, divider: number, startBasis: number) =>
    (event: { preventDefault: () => void; clientX: number; currentTarget: EventTarget | null }) => {
      event.preventDefault();
      const element = event.currentTarget as HTMLElement | null;
      const rowWidth = element?.parentElement?.getBoundingClientRect().width ?? 0;
      drag.current = { row, divider, startX: event.clientX, startBasis, rowWidth };
      const unlock = lockCursor('col-resize');
      window.addEventListener('pointerup', unlock, { once: true });
    };

  return { live, startResize };
}

const minPinnedHeight = 80;

/**
 * Pinning a widget's height by dragging its bottom edge.
 *
 * Height is content-driven until somebody does this — a row's cards stretch
 * to match each other, so nothing goes ragged on its own and there is
 * nothing to adjust unless you actually want a fixed, scrolling widget.
 */
export function useHeightPin(commit: (id: string, height: number) => void) {
  const [live, setLive] = useState<{ id: string; height: number } | null>(null);
  const drag = useRef<{ id: string; startY: number; startHeight: number } | null>(null);
  const liveRef = useRef<{ id: string; height: number } | null>(null);

  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  useEffect(() => {
    function onMove(event: globalThis.PointerEvent) {
      const current = drag.current;
      if (!current) return;
      const height = Math.max(minPinnedHeight, current.startHeight + (event.clientY - current.startY));
      setLive({ id: current.id, height });
    }
    function onUp() {
      if (!drag.current) return;
      drag.current = null;
      const last = liveRef.current;
      setLive(null);
      if (last) commit(last.id, last.height);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [commit]);

  const startPin =
    (id: string) =>
    (event: { preventDefault: () => void; clientY: number; currentTarget: EventTarget | null }) => {
      event.preventDefault();
      // Starts from whatever the widget is *currently* rendering at, so an
      // unpinned widget grows from the size it already had rather than
      // jumping to some default the moment it is grabbed.
      const element = (event.currentTarget as HTMLElement | null)?.parentElement;
      const startHeight = element?.getBoundingClientRect().height ?? minPinnedHeight;
      drag.current = { id, startY: event.clientY, startHeight };
      const unlock = lockCursor('ns-resize');
      window.addEventListener('pointerup', unlock, { once: true });
    };

  return { live, startPin };
}
