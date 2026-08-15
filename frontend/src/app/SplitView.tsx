import { useCallback, useEffect, useRef, useState } from 'react';
import './split.css';

/**
 * Two programs side by side, with a draggable divider.
 *
 * The second pane lives in the query string (`/calendar?split=ai`) rather than
 * in component state, so a split is a real URL: refreshable, shareable, and
 * survivable across a reload exactly like every other route in the app.
 *
 * Below [minWidth] there is no split at all — two 400px columns on a phone are
 * two unusable columns, so the primary pane simply takes the screen and the
 * query parameter is left alone, ready for when the window grows again.
 */
export function SplitView({
  primary,
  secondary,
  onCloseSecondary,
  minWidth = 900,
  storageKey = 'af.split.ratio',
}: {
  primary: React.ReactNode;
  secondary: React.ReactNode | null;
  onCloseSecondary: () => void;
  minWidth?: number;
  storageKey?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(() => window.innerWidth >= minWidth);

  // Remembered because a split is a working arrangement, not a one-off: having
  // to drag the divider back every visit would make the feature not worth using.
  const [ratio, setRatio] = useState(() => {
    const stored = Number(localStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored >= 0.2 && stored <= 0.8 ? stored : 0.5;
  });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= minWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [minWidth]);

  const applyRatio = useCallback(
    (clientX: number) => {
      const box = container.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      // Clamped so a pane can never be dragged to nothing — a zero-width pane
      // looks like the program crashed rather than like a collapsed one.
      const next = Math.min(0.8, Math.max(0.2, (clientX - box.left) / box.width));
      setRatio(next);
    },
    [],
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: PointerEvent) => applyRatio(event.clientX);
    const onUp = () => {
      setDragging(false);
      setRatio((current) => {
        localStorage.setItem(storageKey, String(current));
        return current;
      });
    };

    // On window rather than on the divider: the pointer routinely outruns a
    // 7px target mid-drag, and losing the handle halfway is worse than no
    // resizing at all.
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, applyRatio, storageKey]);

  const split = wide && secondary !== null;

  if (!split) {
    return (
      <div className="af-split af-split--single" ref={container}>
        <section className="af-split__pane">{primary}</section>
      </div>
    );
  }

  return (
    <div
      className={`af-split${dragging ? ' af-split--dragging' : ''}`}
      ref={container}
    >
      <section className="af-split__pane" style={{ flexBasis: `${ratio * 100}%` }}>
        {primary}
      </section>

      <div
        className="af-split__divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panes"
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        // Keyboard-reachable because a pointer-only divider is a pointer-only
        // feature; 2% a press is coarse enough to be quick and fine enough to
        // land where you meant.
        onKeyDown={(event) => {
          const step = event.key === 'ArrowLeft' ? -0.02 : event.key === 'ArrowRight' ? 0.02 : 0;
          if (step === 0) return;
          event.preventDefault();
          setRatio((current) => {
            const next = Math.min(0.8, Math.max(0.2, current + step));
            localStorage.setItem(storageKey, String(next));
            return next;
          });
        }}
      >
        <span className="af-split__grip" />
      </div>

      <section className="af-split__pane" style={{ flexBasis: `${(1 - ratio) * 100}%` }}>
        <button
          type="button"
          className="af-split__close"
          onClick={onCloseSecondary}
          title="Close this pane"
          aria-label="Close this pane"
        >
          ✕
        </button>
        {secondary}
      </section>
    </div>
  );
}
