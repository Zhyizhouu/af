import { useEffect, useRef, useState, type RefObject } from 'react';
import { lockCursor } from '../../../components/pointerDrag';

const columns = 12;
// Low enough that an app-launcher widget (`AppWidget.tsx`) can be dragged
// down to just its icon — see the `@container` collapse in `dashboard.css`.
const minWidth = 2;
const minHeight = 70;
const maxHeight = 900;
const heightStep = 10;

/**
 * Live width-and-height dragging from a widget's corner pivot — the same
 * pointer-drag shape `SplitView`'s divider and `TasksScreen`'s column resize
 * already use. Width is measured in grid columns, height in pixels snapped
 * to a 10px grid (so two widgets dragged to "about the same height" land on
 * the same height rather than a pixel apart), dragged together from one
 * corner handle the way a window's resize corner does.
 *
 * Sizes are held locally while dragging (so the grid reflows every frame)
 * and only handed to `commit` on release — the caller decides what "commit"
 * means (here, a synced settings write).
 */
export function useWidgetResize(
  container: RefObject<HTMLDivElement | null>,
  commit: (id: string, width: number, height: number) => void,
) {
  const drag = useRef<{ id: string; startX: number; startY: number; startWidth: number; startHeight: number } | null>(
    null,
  );
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, { width: number; height: number }>>({});

  useEffect(() => {
    function onMove(event: globalThis.PointerEvent) {
      const current = drag.current;
      if (!current || !container.current) return;
      const colPx = container.current.clientWidth / columns;
      const deltaCols = Math.round((event.clientX - current.startX) / colPx);
      const width = Math.min(columns, Math.max(minWidth, current.startWidth + deltaCols));
      const rawHeight = current.startHeight + (event.clientY - current.startY);
      const height = Math.min(maxHeight, Math.max(minHeight, Math.round(rawHeight / heightStep) * heightStep));
      setLive((prev) => ({ ...prev, [current.id]: { width, height } }));
    }
    function onUp() {
      const current = drag.current;
      if (!current) return;
      drag.current = null;
      setResizingId(null);
      setLive((prev) => {
        const size = prev[current.id];
        if (size) commit(current.id, size.width, size.height);
        return prev;
      });
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [container, commit]);

  const startResize =
    (id: string, currentWidth: number, currentHeight: number) =>
    (event: { preventDefault: () => void; clientX: number; clientY: number }) => {
      event.preventDefault();
      drag.current = { id, startX: event.clientX, startY: event.clientY, startWidth: currentWidth, startHeight: currentHeight };
      setResizingId(id);
      const unlock = lockCursor('nwse-resize');
      window.addEventListener('pointerup', unlock, { once: true });
    };

  const widthFor = (id: string, fallback: number) => live[id]?.width ?? fallback;
  const heightFor = (id: string, fallback: number) => live[id]?.height ?? fallback;

  return { startResize, widthFor, heightFor, resizingId };
}
