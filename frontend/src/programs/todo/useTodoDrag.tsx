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
import { createPortal } from 'react-dom';
import { cn } from 'cn';
import { lockCursor } from '../../components/pointerDrag';
import type { TodoItemRow } from '../../data/db';
import { dayFromKey, keyFromDay } from '../habits/time';
import { moveTodo } from './store';

type After = (action: () => Promise<unknown>) => Promise<void>;

/** Pixels a mouse or pen must travel before a press becomes a drag. */
const MOVE_THRESHOLD = 5;
/** How long a finger must rest on a row before it lifts, so a swipe still scrolls. */
const HOLD_MS = 220;
/** How far a finger may drift during that hold before it counts as a scroll. */
const HOLD_SLOP = 8;
/** An index past any list, which `moveTodo` clamps to the end. */
const END = Number.MAX_SAFE_INTEGER;
/** Controls inside a row that keep their own click and must not start a drag. */
const NOT_A_HANDLE = 'button, input, textarea, select, a, [role="checkbox"]';

const HINT = 'Drag, or press Alt and an arrow key, to move';

const shiftDay = (key: string, count: number): string => {
  const day = dayFromKey(key);
  day.setUTCDate(day.getUTCDate() + count);
  return keyFromDay(day);
};

interface Line {
  left: number;
  top: number;
  width: number;
}

/** Where a drop would land: a day, a position among its open items, and the
 *  insertion line to draw there (none for an append-only target). */
interface Hover {
  day: string;
  index: number;
  line: Line | null;
}

/**
 * Finds the drop target under the pointer.
 *
 * A target is any element carrying `data-todo-day`; its rows carry
 * `data-todo-index`. The position is the number of other rows that come
 * before the pointer in reading order, which also holds for the Week view's
 * multi-column list. `data-todo-append` targets, such as month cells, always
 * take the item at the end.
 */
function resolveHover(x: number, y: number, dragId: string): Hover | null {
  const zone = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-todo-day]');
  if (!zone) return null;
  const day = zone.dataset.todoDay!;
  if (zone.dataset.todoAppend !== undefined) return { day, index: END, line: null };

  const rects = [...zone.querySelectorAll<HTMLElement>('[data-todo-index]')]
    .filter((row) => row.dataset.todoId !== dragId)
    .map((row) => row.getBoundingClientRect());

  if (rects.length === 0) {
    const empty = (zone.querySelector('[data-todo-empty]') ?? zone).getBoundingClientRect();
    return { day, index: 0, line: { left: empty.left, top: empty.top, width: empty.width } };
  }

  const index = rects.filter((rect) => y > rect.bottom || (y >= rect.top && x > rect.left + rect.width / 2)).length;
  const next = rects[index];
  const line = next
    ? { left: next.left, top: next.top - 4, width: next.width }
    : { left: rects[index - 1]!.left, top: rects[index - 1]!.bottom + 4, width: rects[index - 1]!.width };
  return { day, index, line };
}

/**
 * Pointer-driven drag and keyboard moves for to-do rows.
 *
 * Built on pointer events so one code path serves mouse, pen and touch. A
 * press only becomes a drag after the pointer travels a few pixels (or, for
 * touch, rests on the row briefly), so clicks and checkbox taps still work.
 * The row itself follows the pointer with a raised shadow; nothing reflows
 * until release, when an insertion line shows exactly where it would land
 * and `moveTodo` runs through the screen's `after`. Escape cancels.
 *
 * Alt+Arrow on a focused row is the keyboard alternative: Up and Down move
 * it within its day, Left and Right to the end of the previous or next day.
 *
 * Render `layer` once per screen: it holds the screen-reader hint and the
 * insertion line.
 */
export function useTodoDrag(after: After) {
  const hintId = useId();
  const [dragId, setDragId] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<Hover | null>(null);
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => () => stop.current?.(), []);

  const press = useCallback(
    (item: TodoItemRow, index: number) => (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || !event.isPrimary || (event.target as Element).closest(NOT_A_HANDLE)) return;
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
        setDragId(item.id);
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
        hit = resolveHover(e.clientX, e.clientY, item.id);
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
        if (!active || !drop || !hit) return;
        const { day, index: to } = hit;
        if (day === item.day && to === index) return;
        void after(() => moveTodo(item.id, day, to));
      }

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', escape);
      window.addEventListener('touchmove', hold, { passive: false });
      stop.current = () => end(false);
    },
    [after],
  );

  const key = useCallback(
    (item: TodoItemRow, index: number) => (event: KeyboardEvent<HTMLElement>) => {
      if (!event.altKey || event.target !== event.currentTarget) return;
      const moves: Record<string, { day: string; index: number } | null> = {
        ArrowUp: index > 0 ? { day: item.day, index: index - 1 } : null,
        ArrowDown: { day: item.day, index: index + 1 },
        ArrowLeft: { day: shiftDay(item.day, -1), index: END },
        ArrowRight: { day: shiftDay(item.day, 1), index: END },
      };
      if (!(event.key in moves)) return;
      event.preventDefault();
      const move = moves[event.key];
      if (!move) return;
      void after(() => moveTodo(item.id, move.day, move.index)).then(() =>
        window.setTimeout(() => document.querySelector<HTMLElement>(`[data-todo-id="${item.id}"]`)?.focus(), 0),
      );
    },
    [after],
  );

  /** Props for one draggable open row: its place in the list, the handle, and the keyboard moves. */
  const row = (item: TodoItemRow, index: number) => {
    const lifted = dragId === item.id;
    const style: CSSProperties | undefined = lifted
      ? { transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }
      : undefined;
    return {
      'data-todo-id': item.id,
      'data-todo-index': index,
      tabIndex: 0,
      'aria-describedby': hintId,
      onPointerDown: press(item, index),
      onKeyDown: key(item, index),
      style,
      className: cn(
        'cursor-grab rounded-md outline-none select-none [-webkit-touch-callout:none] focus-visible:ring-[3px] focus-visible:ring-ring/50',
        lifted && 'pointer-events-none relative z-50 cursor-grabbing bg-card shadow-[0_8px_24px_rgba(0,0,0,0.55)] ring-1 ring-white/15',
      ),
    };
  };

  /** Class that tints a drop target while a dragged item is over it. */
  const over = (day: string): string =>
    hover?.day === day ? 'bg-white/[0.04] outline outline-1 -outline-offset-1 outline-white/25' : '';

  const layer = (
    <>
      <span id={hintId} className="sr-only">
        {HINT}
      </span>
      {hover?.line &&
        createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed z-[60] h-0.5 rounded-full bg-foreground"
            style={{ left: hover.line.left, top: hover.line.top - 1, width: hover.line.width }}
          />,
          document.body,
        )}
    </>
  );

  return { dragId, row, over, layer };
}
