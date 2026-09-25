import { useEffect, useRef, useState } from 'react';
import { cn } from 'cn';

export interface OrbitPoint {
  x: number;
  y: number;
}

export interface OrbitPoints {
  spark: OrbitPoint;
  trail1: OrbitPoint;
  trail2: OrbitPoint;
}

function pointAt(angle: number): OrbitPoint {
  return {
    x: Math.round((50 + 44 * Math.cos(angle)) * 100) / 100,
    y: Math.round((50 + 44 * Math.sin(angle)) * 100) / 100,
  };
}

export function orbitPoints(timeMs: number, thinking: boolean): OrbitPoints {
  const period = thinking ? 1100 : 6000;
  const a = ((timeMs % period) / period) * Math.PI * 2 - Math.PI / 2;
  const lag = thinking ? 0.38 : 0.22;
  return {
    spark: pointAt(a),
    trail1: pointAt(a - lag),
    trail2: pointAt(a - 2 * lag),
  };
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface AIMarkProps {
  size?: number;
  thinking?: boolean;
  className?: string;
}

export function AIMark({ size = 36, thinking = false, className }: AIMarkProps) {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const sparkRef = useRef<SVGCircleElement>(null);
  const haloRef = useRef<SVGCircleElement>(null);
  const trail1Ref = useRef<SVGCircleElement>(null);
  const trail2Ref = useRef<SVGCircleElement>(null);
  const frameRef = useRef<number | null>(null);
  const thinkingRef = useRef(thinking);
  thinkingRef.current = thinking;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (reduced) return;

    const tick = (t: number) => {
      const points = orbitPoints(t, thinkingRef.current);
      if (sparkRef.current) {
        sparkRef.current.setAttribute('cx', String(points.spark.x));
        sparkRef.current.setAttribute('cy', String(points.spark.y));
      }
      if (haloRef.current) {
        haloRef.current.setAttribute('cx', String(points.spark.x));
        haloRef.current.setAttribute('cy', String(points.spark.y));
      }
      if (trail1Ref.current) {
        trail1Ref.current.setAttribute('cx', String(points.trail1.x));
        trail1Ref.current.setAttribute('cy', String(points.trail1.y));
      }
      if (trail2Ref.current) {
        trail2Ref.current.setAttribute('cx', String(points.trail2.x));
        trail2Ref.current.setAttribute('cy', String(points.trail2.y));
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [reduced]);

  const small = size < 28;
  const restPoint = reduced ? pointAt(-Math.PI / 2) : orbitPoints(0, thinking).spark;
  const sparkR = small ? 10 : 5;
  const haloR = small ? 16 : 11;
  const trailR = small ? 7 : 3.5;
  const tileXY = small ? 16 : 21;
  const tileWH = small ? 68 : 58;
  const tileR = small ? 20 : 16;
  const textOpacity = small ? 0 : 1;
  const ringWidth = small ? 4 : 1.5;
  const ringDash = small ? '0' : '2 5';
  const glowPx = thinking ? 10 : 5;

  return (
    <div
      className={cn('inline-flex shrink-0', className)}
      style={{ width: size, height: size, fontFamily: 'Poppins, system-ui, sans-serif' }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        role="img"
        aria-label="reAFresh AI"
        style={{ overflow: 'visible', filter: `drop-shadow(0 0 ${glowPx}px rgba(253,186,116,0.45))` }}
      >
        <defs>
          <linearGradient id="aiMarkTile" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#a1a1aa" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth={ringWidth}
          strokeDasharray={ringDash}
        />
        <rect x={tileXY} y={tileXY} width={tileWH} height={tileWH} rx={tileR} fill="url(#aiMarkTile)" />
        <text
          x="50"
          y="58.5"
          textAnchor="middle"
          fontSize="24"
          fontWeight="600"
          fontFamily="Poppins, system-ui, sans-serif"
          fill="#000000"
          opacity={textOpacity}
        >
          AF
        </text>
        {!reduced && (
          <circle ref={trail2Ref} cx={restPoint.x} cy={restPoint.y} r={trailR} fill="#fdba74" opacity="0.22" />
        )}
        {!reduced && (
          <circle ref={trail1Ref} cx={restPoint.x} cy={restPoint.y} r={trailR} fill="#fdba74" opacity="0.45" />
        )}
        <circle ref={haloRef} cx={restPoint.x} cy={restPoint.y} r={haloR} fill="rgba(253,186,116,0.3)" />
        <circle ref={sparkRef} cx={restPoint.x} cy={restPoint.y} r={sparkR} fill="#fff7ed" />
      </svg>
    </div>
  );
}
