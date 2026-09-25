import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cn } from 'cn';

export interface CursorGlowProps {
  color?: string;
  className?: string;
  children?: ReactNode;
}

function isStatic(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    window.matchMedia('(pointer: coarse)').matches
  );
}

export function CursorGlow({ color = 'var(--glow)', className, children }: CursorGlowProps) {
  const [staticMode, setStaticMode] = useState(isStatic);
  const rootRef = useRef<HTMLDivElement>(null);
  const farRef = useRef<HTMLDivElement>(null);
  const nearRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<{ x: number; y: number; inside: boolean } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarseMq = window.matchMedia('(pointer: coarse)');
    const onChange = () => setStaticMode(reduceMq.matches || coarseMq.matches);
    reduceMq.addEventListener('change', onChange);
    coarseMq.addEventListener('change', onChange);
    return () => {
      reduceMq.removeEventListener('change', onChange);
      coarseMq.removeEventListener('change', onChange);
    };
  }, []);

  const apply = (x: number, y: number, inside: boolean) => {
    if (farRef.current) {
      farRef.current.style.transform = `translate(${x - 500}px, ${y - 500}px)`;
      farRef.current.style.opacity = inside ? '0.32' : '0.16';
    }
    if (nearRef.current) {
      nearRef.current.style.transform = `translate(${x - 180}px, ${y - 180}px)`;
      nearRef.current.style.opacity = inside ? '1' : '0';
    }
  };

  const restingPoint = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    const w = rect?.width ?? 0;
    const h = rect?.height ?? 0;
    return { x: w / 2, y: h * 0.55 };
  };

  useEffect(() => {
    const resting = restingPoint();
    apply(resting.x, resting.y, false);
  }, [staticMode]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const scheduleUpdate = () => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const pending = pendingRef.current;
      if (pending) apply(pending.x, pending.y, pending.inside);
    });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    pendingRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, inside: true };
    scheduleUpdate();
  };

  const onPointerLeave = () => {
    const resting = restingPoint();
    pendingRef.current = { x: resting.x, y: resting.y, inside: false };
    scheduleUpdate();
  };

  return (
    <div
      ref={rootRef}
      className={cn('relative overflow-hidden', className)}
      onPointerMove={staticMode ? undefined : onPointerMove}
      onPointerLeave={staticMode ? undefined : onPointerLeave}
    >
      <div
        ref={farRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 h-[1000px] w-[1000px]"
        style={{
          background: `radial-gradient(closest-side, ${color}, transparent)`,
          transition: 'transform 0.9s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.6s ease',
        }}
      />
      <div
        ref={nearRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 h-[360px] w-[360px]"
        style={{
          background: 'radial-gradient(closest-side, rgba(255,255,255,0.09), transparent)',
          transition: 'transform 0.25s ease-out, opacity 0.4s ease',
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
