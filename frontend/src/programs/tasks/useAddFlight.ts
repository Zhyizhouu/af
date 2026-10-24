import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const shakeMs = 260;
const addedMs = 900;
const flightMs = 420;
const landedMs = 700;
const findTries = 15;
const findEveryMs = 16;

export interface Flight {
  title: string;
  rect: { left: number; top: number; width: number; height: number };
  dx: number;
  dy: number;
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

export function useAddFlight(gridRef?: RefObject<HTMLElement | null>) {
  const [shaking, setShaking] = useState(false);
  const [added, setAdded] = useState(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const alive = useRef(true);
  const timers = useRef(new Set<number>());

  useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      pending.forEach((id) => window.clearTimeout(id));
      pending.clear();
    };
  }, []);

  const later = useCallback((action: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      action();
    }, ms);
    timers.current.add(id);
  }, []);

  const shake = useCallback(() => {
    setShaking(true);
    later(() => setShaking(false), shakeMs);
  }, [later]);

  const land = useCallback(
    (chip: HTMLElement) => {
      const cell = chip.closest<HTMLElement>('.tsk-grid__cell');
      if (!cell) return;
      cell.classList.add('is-landed');
      later(() => cell.classList.remove('is-landed'), landedMs);
    },
    [later],
  );

  const celebrate = useCallback(
    (pageId: string, title: string, from: DOMRect | undefined) => {
      setAdded(true);
      later(() => setAdded(false), addedMs);
      const seek = (tries: number) => {
        if (!alive.current) return;
        const chip = gridRef?.current?.querySelector<HTMLElement>(`[data-page-id="${pageId}"]`);
        if (!chip) {
          if (tries > 0) later(() => seek(tries - 1), findEveryMs);
          return;
        }
        if (!from || prefersReducedMotion()) {
          land(chip);
          return;
        }
        const to = chip.getBoundingClientRect();
        setFlight({
          title,
          rect: { left: from.left, top: from.top, width: from.width, height: from.height },
          dx: to.left - from.left,
          dy: to.top - from.top,
        });
        later(() => {
          setFlight(null);
          land(chip);
        }, flightMs);
      };
      seek(findTries);
    },
    [gridRef, later, land],
  );

  return { shaking, added, flight, alive, shake, celebrate };
}
