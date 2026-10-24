import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { cn } from 'cn';
import { lockCursor } from '../../components/pointerDrag';
import type { TaskPageRow, TaskPropertyRow } from '../../data/db';
import { savePageValue } from './store';

type After = (action: () => Promise<unknown>) => Promise<void>;

/** Pixels a mouse or pen must travel before a press becomes a drag. */
const MOVE_THRESHOLD = 5;
/** How long a finger must rest on a chip before it lifts, so a swipe still scrolls. */
const HOLD_MS = 220;
/** How far a finger may drift during that hold before it counts as a scroll. */
const HOLD_SLOP = 8;

const HINT = 'Drag, or press Alt and an arrow key, to change priority and status';

/** The cell under the pointer. A missing value means that axis has no options and stays unchanged. */
interface Hover {
  priority?: string;
  status?: string;
}

function resolveHover(x: number, y: number): Hover | null {
  const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>('.tsk-grid__cell');
  if (!cell) return null;
  return { priority: cell.dataset.triagePriority, status: cell.dataset.triageStatus };
}

/**
 * Pointer-driven drag and keyboard moves for the triage grid's chips.
 *
 * Mirrors `useTodoDrag`: a press becomes a drag after the pointer travels a
 * few pixels (or, for touch, rests on the chip briefly), so a plain click
 * still opens the chip menu. The chip follows the pointer while the cell under
 * it is highlighted; on release the page takes that cell's priority and
 * status through the screen's `after`, writing only the values that changed.
 * Escape cancels.
 *
 * Alt+Up and Alt+Down on a focused chip move it one priority row, Alt+Left and
 * Alt+Right one status column.
 *
 * Render `layer` once: it holds the screen-reader hint.
 */
export function useTriageDrag(
  after: After,
  priority: TaskPropertyRow | undefined,
  status: TaskPropertyRow | undefined,
) {
  const hintId = useId();
  const [dragId, setDragId] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<Hover | null>(null);
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => () => stop.current?.(), []);

  const place = useCallback(
    (page: TaskPageRow, target: Hover) => {
      const writes: Array<[string, string]> = [];
      if (priority && target.priority !== undefined && page.values[priority.id] !== target.priority) {
        writes.push([priority.id, target.priority]);
      }
      if (status && target.status !== undefined && page.values[status.id] !== target.status) {
        writes.push([status.id, target.status]);
      }
      if (writes.length === 0) return Promise.resolve();
      return after(async () => {
        for (const [propertyId, optionId] of writes) await savePageValue(page.id, propertyId, optionId);
      });
    },
    [after, priority, status],
  );

  const press = useCallback(
    (page: TaskPageRow) => (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || !event.isPrimary) return;
      const { pointerId, pointerType, clientX: startX, clientY: startY } = event;
      const touch = pointerType === 'touch';
      if (!touch) {
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
      }
      let active = false;
      let unlock = () => {};
      let hit: Hover | null = null;

      const begin = () => {
        active = true;
        window.getSelection()?.removeAllRanges();
        document.addEventListener('selectstart', noSelect);
        unlock = lockCursor('grabbing');
        setDragId(page.id);
      };
      const timer = touch ? window.setTimeout(begin, HOLD_MS) : 0;

      const move = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!active) {
          if (touch && Math.hypot(dx, dy) > HOLD_SLOP) return end(false);
          if (!touch && Math.hypot(dx, dy) >= MOVE_THRESHOLD) begin();
          else return;
        }
        setOffset({ x: dx, y: dy });
        hit = resolveHover(e.clientX, e.clientY);
        setHover(hit);
      };
      const up = (e: PointerEvent) => {
        if (e.pointerId === pointerId) end(true);
      };
      const cancel = (e: PointerEvent) => {
        if (e.pointerId === pointerId) end(false);
      };
      const escape = (e: globalThis.KeyboardEvent) => {
        if (e.key === 'Escape') end(false);
      };
      const noSelect = (e: Event) => e.preventDefault();
      const hold = (e: TouchEvent) => {
        if (active) e.preventDefault();
      };
      const swallowClick = (e: Event) => e.stopPropagation();

      function end(drop: boolean) {
        window.clearTimeout(timer);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('keydown', escape);
        window.removeEventListener('touchmove', hold);
        document.removeEventListener('selectstart', noSelect);
        stop.current = null;
        unlock();
        setDragId(null);
        setOffset({ x: 0, y: 0 });
        setHover(null);
        if (!active) return;
        window.addEventListener('click', swallowClick, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener('click', swallowClick, true), 0);
        if (drop && hit) void place(page, hit);
      }

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', escape);
      window.addEventListener('touchmove', hold, { passive: false });
      stop.current = () => end(false);
    },
    [place],
  );

  const key = useCallback(
    (page: TaskPageRow) => (event: KeyboardEvent<HTMLElement>) => {
      if (!event.altKey || event.target !== event.currentTarget) return;
      const step = (property: TaskPropertyRow | undefined, by: number): string | undefined => {
        if (!property) return undefined;
        const at = property.options.findIndex((option) => option.id === page.values[property.id]);
        return at < 0 ? undefined : property.options[at + by]?.id;
      };
      const moves: Record<string, Hover> = {
        ArrowUp: { priority: step(priority, -1) },
        ArrowDown: { priority: step(priority, 1) },
        ArrowLeft: { status: step(status, -1) },
        ArrowRight: { status: step(status, 1) },
      };
      if (!(event.key in moves)) return;
      event.preventDefault();
      void place(page, moves[event.key]!).then(() =>
        window.setTimeout(() => document.querySelector<HTMLElement>(`[data-triage-id="${page.id}"]`)?.focus(), 0),
      );
    },
    [place, priority, status],
  );

  /** Props for one draggable chip: its handle, the keyboard moves, and its lifted look. */
  const chip = (page: TaskPageRow) => {
    const lifted = dragId === page.id;
    const style: CSSProperties | undefined = lifted
      ? { transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }
      : undefined;
    return {
      'data-triage-id': page.id,
      'aria-describedby': hintId,
      onPointerDown: press(page),
      onKeyDown: key(page),
      style,
      className: cn('tsk-grid__chip', lifted && 'is-lifted'),
    };
  };

  /** Class that highlights a cell while a dragged chip is over it. */
  const over = (priorityId: string | undefined, statusId: string | undefined): string =>
    hover && hover.priority === priorityId && hover.status === statusId ? 'is-over' : '';

  const layer = (
    <span id={hintId} className="sr-only">
      {HINT}
    </span>
  );

  return { dragId, chip, over, layer };
}

export type TriageDrag = ReturnType<typeof useTriageDrag>;
