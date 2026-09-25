import { useCallback, useEffect, useRef, useState } from 'react';
import { AIMark } from '../components/brand/AIMark';
import { Monogram } from '../components/brand/Monogram';

const PHASE_TIMINGS: Array<[number, number]> = [
  [1, 250],
  [2, 800],
  [3, 1100],
  [4, 1350],
  [5, 1950],
];

function prefersReducedMotion(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export interface IntroProps {
  onDone: () => void;
  onDock?: () => void;
}

export function Intro({ onDone, onDock }: IntroProps) {
  const [reduced] = useState(prefersReducedMotion);
  const [phase, setPhase] = useState(0);
  const [skipping, setSkipping] = useState(false);
  const [autoFade, setAutoFade] = useState(false);
  const [dockTransform, setDockTransform] = useState<string | null>(null);
  const [dockFallback, setDockFallback] = useState(false);
  const tileRef = useRef<HTMLSpanElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onDockRef = useRef(onDock);
  onDockRef.current = onDock;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  }, []);

  const skip = useCallback(() => {
    if (doneRef.current) return;
    clearTimers();
    setSkipping(true);
    const t = setTimeout(finish, 200);
    timersRef.current.push(t);
  }, [clearTimers, finish]);

  useEffect(() => {
    if (reduced) {
      const t1 = setTimeout(() => setAutoFade(true), 300);
      const t2 = setTimeout(finish, 700);
      timersRef.current.push(t1, t2);
    } else {
      const timers = PHASE_TIMINGS.map(([p, ms]) => setTimeout(() => setPhase(p), ms));
      timersRef.current.push(...timers);
    }
    return () => clearTimers();
  }, [reduced, finish, clearTimers]);

  useEffect(() => {
    if (reduced || phase !== 5) return;
    finish();
  }, [phase, reduced, finish]);

  useEffect(() => {
    if (reduced || phase !== 4) return;
    try {
      const dock = document.querySelector('[data-shell-dock]');
      const tile = tileRef.current;
      if (dock && tile) {
        const dockRect = dock.getBoundingClientRect();
        const tileRect = tile.getBoundingClientRect();
        if (dockRect.width > 0 && tileRect.width > 0) {
          const dx = dockRect.left + dockRect.width / 2 - (tileRect.left + tileRect.width / 2);
          const dy = dockRect.top + dockRect.height / 2 - (tileRect.top + tileRect.height / 2);
          const scale = dockRect.width / 88;
          setDockTransform(`translate(${dx}px, ${dy}px) scale(${scale})`);
          onDockRef.current?.();
          return;
        }
      }
      setDockFallback(true);
      onDockRef.current?.();
    } catch {
      setDockFallback(true);
      onDockRef.current?.();
    }
  }, [phase, reduced]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skip]);

  if (reduced) {
    return (
      <div
        role="dialog"
        aria-label="Welcome to reAFresh"
        onClick={skip}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black"
        style={{
          opacity: skipping || autoFade ? 0 : 1,
          transition: skipping ? 'opacity 0.2s ease' : 'opacity 0.4s ease',
        }}
      >
        <div aria-hidden className="pointer-events-none">
          <Monogram size={64} />
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            skip();
          }}
          className="absolute bottom-6 left-1/2 flex h-11 -translate-x-1/2 items-center px-4 text-[12px] text-subtle-foreground"
        >
          Skip intro
        </button>
      </div>
    );
  }

  const folded = phase >= 2;
  const tiled = phase >= 3;
  const docked = phase >= 4;

  const glow = phase === 1 ? 0.55 : phase === 2 ? 0.4 : phase === 3 ? 0.22 : 0;
  const sideMax = folded ? '0px' : '200px';
  const sideOpacity = phase >= 1 && !folded ? 1 : 0;
  const aiMax = folded ? '0px' : '160px';
  const aiGap = folded ? '0px' : '22px';
  const tileW = tiled ? 88 : 72;
  const tileFont = tiled ? 33 : 56;
  const tileBg = tiled ? 'linear-gradient(135deg, #ffffff, #a1a1aa)' : 'rgba(255,255,255,0)';
  const tileInk = tiled ? '#000000' : '#fafafa';
  const tileShadow =
    tiled && !docked
      ? '0 0 60px rgba(255,255,255,0.35), 0 0 120px rgba(251,146,60,0.35)'
      : '0 0 0 rgba(0,0,0,0)';
  const sparkTransform = folded ? 'rotate(540deg) translateX(64px)' : 'rotate(0deg) translateX(64px)';
  const sparkOpacity = folded && !docked ? 1 : 0;
  const sparkTransition =
    phase === 0 ? 'none' : 'transform 1.1s cubic-bezier(0.3, 0.7, 0.2, 1), opacity 0.3s ease';
  const curtain = docked ? 0 : 1;

  const tileTransform = docked ? (dockFallback ? 'scale(0.6)' : (dockTransform ?? 'none')) : 'none';
  const tileOpacity = phase === 0 || phase >= 5 ? 0 : docked && dockFallback ? 0 : 1;

  return (
    <div
      role="dialog"
      aria-label="Welcome to reAFresh"
      onClick={skip}
      className="fixed inset-0 z-50 overflow-hidden text-foreground"
      style={{
        fontFamily: 'Poppins, system-ui, sans-serif',
        opacity: skipping ? 0 : 1,
        transition: 'opacity 0.2s ease',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-black"
        style={{ opacity: curtain, transition: 'opacity 0.6s ease' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          left: '15%',
          top: '18%',
          width: '70%',
          height: '62%',
          background: 'radial-gradient(closest-side, #fb923c, rgba(0,0,0,0))',
          opacity: glow,
          transition: 'opacity 0.7s ease',
        }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span
          style={{
            display: 'inline-block',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            fontSize: 56,
            fontWeight: 500,
            letterSpacing: '-0.04em',
            maxWidth: sideMax,
            opacity: sideOpacity,
            transition: 'max-width 0.5s cubic-bezier(0.65, 0, 0.35, 1), opacity 0.3s ease',
          }}
        >
          re
        </span>
        <span
          ref={tileRef}
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 88,
            width: tileW,
            borderRadius: 24,
            fontSize: tileFont,
            fontWeight: 600,
            letterSpacing: '-0.03em',
            background: tileBg,
            color: tileInk,
            boxShadow: tileShadow,
            transform: tileTransform,
            opacity: tileOpacity,
            transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          AF
          <span
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 10,
              height: 10,
              margin: '-5px 0 0 -5px',
              borderRadius: 999,
              background: '#fff7ed',
              boxShadow: '0 0 12px 4px rgba(253,186,116,0.8)',
              transform: sparkTransform,
              opacity: sparkOpacity,
              transition: sparkTransition,
            }}
          />
        </span>
        <span
          style={{
            display: 'inline-block',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            fontSize: 56,
            fontWeight: 500,
            letterSpacing: '-0.04em',
            maxWidth: sideMax,
            opacity: sideOpacity,
            transition: 'max-width 0.5s cubic-bezier(0.65, 0, 0.35, 1), opacity 0.3s ease',
          }}
        >
          resh
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            marginLeft: aiGap,
            maxWidth: aiMax,
            opacity: sideOpacity,
            transition:
              'max-width 0.5s cubic-bezier(0.65, 0, 0.35, 1), margin-left 0.5s ease, opacity 0.25s ease',
          }}
        >
          <AIMark size={48} />
          <span
            style={{
              fontSize: 44,
              fontWeight: 500,
              letterSpacing: '-0.03em',
              background: 'linear-gradient(to bottom, #ffffff, #fdba74)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            AI
          </span>
        </span>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          skip();
        }}
        className="absolute bottom-6 left-1/2 flex h-11 -translate-x-1/2 items-center px-4 text-[12px] text-subtle-foreground"
      >
        Skip intro
      </button>
    </div>
  );
}
