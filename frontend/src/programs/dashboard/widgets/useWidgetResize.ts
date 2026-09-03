import { useEffect, useRef, useState, type RefObject } from 'react';

const columns = 12;
const minWidth = 3;

/**
 * Live width-dragging for the dashboard's 12-column widget grid — the same
 * pointer-drag shape `SplitView`'s divider and `TasksScreen`'s column resize
 * already use, just measured in grid columns instead of pixels or a ratio.
 *
 * Widths are held locally while dragging (so the grid reflows every frame)
 * and only handed to `commit` on release — the caller decides what "commit"
 * means (here, a synced settings write).
 */
export function useWidgetResize(
  container: RefObject<HTMLDivElement | null>,
  commit: (id: string, width: number) => void,
) {
  const drag = useRef<{ id: string; startX: number; startWidth: number } | null>(null);
  const [live, setLive] = useState<Record<string, number>>({});

  useEffect(() => {
    function onMove(event: globalThis.PointerEvent) {
      const current = drag.current;
      if (!current || !container.current) return;
      const colPx = container.current.clientWidth / columns;
      const deltaCols = Math.round((event.clientX - current.startX) / colPx);
      const next = Math.min(columns, Math.max(minWidth, current.startWidth + deltaCols));
      setLive((prev) => ({ ...prev, [current.id]: next }));
    }
    function onUp() {
      const current = drag.current;
      if (!current) return;
      drag.current = null;
      setLive((prev) => {
        if (prev[current.id] !== undefined) commit(current.id, prev[current.id]!);
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

  const startResize = (id: string, currentWidth: number) => (event: { preventDefault: () => void; clientX: number }) => {
    event.preventDefault();
    drag.current = { id, startX: event.clientX, startWidth: currentWidth };
  };

  const widthFor = (id: string, fallback: number) => live[id] ?? fallback;

  return { startResize, widthFor };
}
