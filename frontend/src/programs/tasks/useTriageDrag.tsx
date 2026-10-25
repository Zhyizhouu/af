import {
  useCallback,
  useId,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { cn } from 'cn';
import { usePointerDrag } from '../../components/pointerDragController';
import type { TaskPageRow, TaskPropertyRow } from '../../data/db';
import { savePageValue } from './store';

type After = (action: () => Promise<unknown>) => Promise<void>;

export const failedHint = 'Could not save, try again';

const HINT = 'Drag, or press Alt and an arrow key, to change priority and status';

/** The cell under the pointer. A missing value means that axis has no options and stays unchanged. */
interface Hover {
  priority?: string;
  status?: string;
}

function resolveHover(x: number, y: number): Hover | null {
  const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>('.tsk-grid__cell');
  if (!cell || cell.classList.contains('is-unset')) return null;
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
  const [hover, setHover] = useState<Hover | null>(null);
  const [failed, setFailed] = useState(false);
  const { start, offset } = usePointerDrag<Hover>();

  const run = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      setFailed(false);
      try {
        await after(action);
        return true;
      } catch {
        setFailed(true);
        return false;
      }
    },
    [after],
  );

  const dismiss = useCallback(() => setFailed(false), []);

  const place = useCallback(
    (page: TaskPageRow, target: Hover) => {
      const writes: Array<[string, string]> = [];
      if (priority && target.priority !== undefined && page.values[priority.id] !== target.priority) {
        writes.push([priority.id, target.priority]);
      }
      if (status && target.status !== undefined && page.values[status.id] !== target.status) {
        writes.push([status.id, target.status]);
      }
      if (writes.length === 0) return Promise.resolve(true);
      return run(async () => {
        for (const [propertyId, optionId] of writes) await savePageValue(page.id, propertyId, optionId);
      });
    },
    [run, priority, status],
  );

  const press = useCallback(
    (page: TaskPageRow) => (event: ReactPointerEvent<HTMLElement>) =>
      start(event, {
        onBegin: () => setDragId(page.id),
        onMove: (x, y) => {
          const hit = resolveHover(x, y);
          setHover(hit);
          return hit;
        },
        onDrop: (hit) => void place(page, hit),
        onEnd: () => {
          setDragId(null);
          setHover(null);
        },
      }),
    [start, place],
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
  const chip = (page: TaskPageRow, { keyboard = true, palette = false } = {}) => {
    const lifted = dragId === page.id;
    const style: CSSProperties | undefined = lifted
      ? { transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }
      : undefined;
    return {
      [palette ? 'data-triage-palette-id' : 'data-triage-id']: page.id,
      'aria-describedby': hintId,
      onPointerDown: press(page),
      onKeyDown: keyboard ? key(page) : undefined,
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

  return { dragId, chip, over, layer, run, failed, dismiss };
}

export type TriageDrag = ReturnType<typeof useTriageDrag>;
