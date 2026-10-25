import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { lockCursor } from './pointerDrag';

/** Pixels a mouse or pen must travel before a press becomes a drag. */
const MOVE_THRESHOLD = 5;
/** How long a finger must rest before the item lifts, so a swipe still scrolls. */
const HOLD_MS = 220;
/** How far a finger may drift during that hold before it counts as a scroll. */
const HOLD_SLOP = 8;

const ZERO = { x: 0, y: 0 };

export interface PointerDragConfig<T> {
  onBegin: (event: ReactPointerEvent<HTMLElement>) => void;
  onMove: (x: number, y: number) => T | null;
  onDrop: (target: T) => void;
  onEnd: () => void;
}

export function usePointerDrag<T>() {
  const [offset, setOffset] = useState(ZERO);
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => () => stop.current?.(), []);

  const start = useCallback((event: ReactPointerEvent<HTMLElement>, config: PointerDragConfig<T>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    const { pointerId, pointerType, clientX: startX, clientY: startY } = event;
    const touch = pointerType === 'touch';
    if (!touch) {
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
    }
    let active = false;
    let unlock = () => {};
    let hit: T | null = null;

    const begin = () => {
      active = true;
      window.getSelection()?.removeAllRanges();
      document.addEventListener('selectstart', noSelect);
      unlock = lockCursor('grabbing');
      config.onBegin(event);
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
      hit = config.onMove(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === pointerId) end(true);
    };
    const cancel = (e: PointerEvent) => {
      if (e.pointerId === pointerId) end(false);
    };
    const escape = (e: KeyboardEvent) => {
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
      setOffset(ZERO);
      config.onEnd();
      if (!active) return;
      window.addEventListener('click', swallowClick, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', swallowClick, true), 0);
      if (drop && hit) config.onDrop(hit);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', escape);
    window.addEventListener('touchmove', hold, { passive: false });
    stop.current = () => end(false);
  }, []);

  return { start, offset };
}
