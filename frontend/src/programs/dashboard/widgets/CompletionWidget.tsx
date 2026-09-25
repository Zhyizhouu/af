import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cn } from 'cn';
import { useSession } from '../../../app/session';
import { completionOver, listHabits, type Completion, type Range } from '../../habits/store';
import { dayFromKey } from '../../habits/time';
import { segmentColors, trendColor, trendLabel, trendOf, trendSoftColor, type TrendKind } from './trend';

type ChartRange = 'week' | 'month';

const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });
const monthDayFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

const leftGutter = 44;
const rightPad = 16;
const gridFractions = [1, 0.75, 0.5, 0.25, 0];
const gridLabels = ['100%', '75%', '50%', '25%', '0%'];
const strokeColors: Record<TrendKind, string> = { up: '#34d399', flat: '#fafafa', down: '#fb7185' };

function rangeOf(chartRange: ChartRange): Range {
  return chartRange === 'week' ? 'week' : 'month';
}

function xAt(index: number, n: number, width: number): number {
  const chartRight = width - rightPad;
  if (n <= 1) return leftGutter;
  return leftGutter + (index * (chartRight - leftGutter)) / (n - 1);
}

function yAt(fraction: number, topPad: number, chartBottom: number): number {
  return topPad + (1 - fraction) * (chartBottom - topPad);
}

function linePath(points: { x: number; y: number }[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');
}

function areaPath(points: { x: number; y: number }[], chartBottom: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return '';
  return `${linePath(points)} L${last.x} ${chartBottom} L${first.x} ${chartBottom} Z`;
}

function labelIndexesFor(chartRange: ChartRange, n: number): number[] {
  if (chartRange === 'week') return Array.from({ length: n }, (_, i) => i);
  const step = Math.max(1, Math.round((n - 1) / 4));
  const indexes = [0, step, step * 2, step * 3, n - 1];
  return Array.from(new Set(indexes.filter((index) => index >= 0 && index < n)));
}

function labelFor(chartRange: ChartRange, completion: Completion, isLast: boolean): string {
  if (isLast) return 'Today';
  const date = dayFromKey(completion.day);
  return chartRange === 'week' ? weekdayFormat.format(date) : monthDayFormat.format(date);
}

function SegmentedControl({
  range,
  onChange,
}: {
  range: ChartRange;
  onChange: (range: ChartRange) => void;
}) {
  const activeClass =
    'bg-[linear-gradient(180deg,#2a2a2e,#1b1b1e)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_14px_rgba(255,255,255,0.14)]';
  const inactiveClass = 'bg-transparent text-muted-foreground shadow-none';

  return (
    <div
      role="group"
      aria-label="Range"
      className="inline-flex shrink-0 gap-[2px] rounded-[10px] border border-white/[0.07] bg-[#050506] p-[3px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]"
    >
      {(['week', 'month'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={range === value}
          onClick={() => onChange(value)}
          className={cn(
            'h-7 rounded-[7px] px-3 text-xs font-medium',
            range === value ? activeClass : inactiveClass,
          )}
        >
          {value === 'week' ? '7 days' : '30 days'}
        </button>
      ))}
    </div>
  );
}

function TrendChip({ kind, label }: { kind: TrendKind; label: string }) {
  const color = trendColor(kind);
  const soft = trendSoftColor(kind);
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 text-xs font-medium">
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${soft}` }}
      />
      <span style={{ color }}>{label}</span>
    </span>
  );
}

export function CompletionWidget() {
  const { revision } = useSession();
  const uid = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasHabits, setHasHabits] = useState(false);
  const [chartRange, setChartRange] = useState<ChartRange>('week');
  const [completion, setCompletion] = useState<Completion[]>([]);
  const [width, setWidth] = useState(0);

  const reload = useCallback(async () => {
    setHasHabits((await listHabits()).length > 0);
    setCompletion(await completionOver(rangeOf(chartRange)));
  }, [chartRange]);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasHabits]);

  const days = chartRange === 'week' ? 7 : 30;
  const chronological = [...completion].reverse();
  const fractions = chronological.map((point) => point.fraction);
  const n = fractions.length;
  const trend = trendOf(fractions);
  const avgPct = n === 0 ? 0 : Math.round((fractions.reduce((sum, value) => sum + value, 0) / n) * 100);
  const label = trendLabel(trend.kind, trend.deltaPts, days, avgPct);
  const color = trendColor(trend.kind);
  const soft = trendSoftColor(trend.kind);

  const chartWidth = width || 300;
  const height = chartWidth < 420 ? 160 : 220;
  const topPad = height <= 160 ? 14 : 20;
  const bottomPad = height <= 160 ? 20 : 30;
  const chartBottom = height - bottomPad;
  const labelY = height - 6;

  const points = fractions.map((fraction, index) => ({
    x: xAt(index, n, chartWidth),
    y: yAt(fraction, topPad, chartBottom),
  }));
  const last = points[points.length - 1];

  const areaGradId = `${uid}-area`;
  const strokeGradId = `${uid}-stroke`;
  const fadeId = `${uid}-fade`;
  const maskId = `${uid}-mask`;

  const kinds = segmentColors(fractions);

  return (
    <div className="relative flex h-full flex-col gap-3.5">
      {hasHabits && (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-16 h-[260px] w-[360px]"
          style={{ background: `radial-gradient(closest-side, ${soft}, rgba(0,0,0,0))` }}
        />
      )}
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-semibold">Habit completion</h2>
          {hasHabits && <TrendChip kind={trend.kind} label={label} />}
        </div>
        {hasHabits && <SegmentedControl range={chartRange} onChange={setChartRange} />}
      </div>

      {hasHabits ? (
        <div ref={containerRef} className="relative min-h-0 flex-1">
          {last && (
            <svg
              width="100%"
              height={height}
              viewBox={`0 0 ${chartWidth} ${height}`}
              role="img"
              aria-label={`Habit completion over the last ${days} days. ${label}`}
              className="block"
            >
              <defs>
                <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={color} stopOpacity="0.28" />
                  <stop offset="1" stopColor={color} stopOpacity="0" />
                </linearGradient>
                <linearGradient
                  id={strokeGradId}
                  gradientUnits="userSpaceOnUse"
                  x1={points[0]?.x ?? leftGutter}
                  y1="0"
                  x2={last.x}
                  y2="0"
                >
                  {kinds.map((kind, index) => (
                    <stop key={index} offset={n <= 1 ? 0 : index / (n - 1)} stopColor={strokeColors[kind]} />
                  ))}
                </linearGradient>
                <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#ffffff" stopOpacity="0.32" />
                  <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
                </linearGradient>
                <mask id={maskId}>
                  <rect x="0" y="0" width={chartWidth} height={height} fill={`url(#${fadeId})`} />
                </mask>
              </defs>

              <g className="stroke-[#1c1c1f]" strokeWidth={1}>
                {gridFractions.map((fraction) => {
                  const y = yAt(fraction, topPad, chartBottom);
                  return <line key={fraction} x1={leftGutter} y1={y} x2={chartWidth - rightPad} y2={y} />;
                })}
              </g>
              <g className="fill-subtle-foreground text-[11px]">
                {gridFractions.map((fraction, index) => (
                  <text key={fraction} x={0} y={yAt(fraction, topPad, chartBottom) + 4}>
                    {gridLabels[index]}
                  </text>
                ))}
              </g>

              {chartRange === 'week' ? (
                <g>
                  <path d={areaPath(points, chartBottom)} fill={`url(#${areaGradId})`} />
                  <path
                    d={linePath(points)}
                    fill="none"
                    stroke={color}
                    strokeWidth={2.25}
                    strokeLinejoin="round"
                    style={{ filter: `drop-shadow(0 0 6px ${soft})` }}
                  />
                  {points.slice(0, -1).map((point, index) => (
                    <circle key={index} cx={point.x} cy={point.y} r={3.5} className="fill-black" stroke={color} strokeWidth={2} />
                  ))}
                </g>
              ) : (
                <g>
                  <path d={areaPath(points, chartBottom)} fill={`url(#${strokeGradId})`} mask={`url(#${maskId})`} />
                  <path
                    d={linePath(points)}
                    fill="none"
                    stroke={`url(#${strokeGradId})`}
                    strokeWidth={2.25}
                    strokeLinejoin="round"
                    style={{ filter: 'drop-shadow(0 0 5px rgba(255,255,255,0.18))' }}
                  />
                </g>
              )}

              <circle cx={last.x} cy={last.y} r={9} fill={soft} />
              <circle cx={last.x} cy={last.y} r={5} fill={color} />

              <g className="fill-subtle-foreground text-[11px]" textAnchor="middle">
                {labelIndexesFor(chartRange, n).map((index) => {
                  const point = chronological[index];
                  const isLast = index === n - 1;
                  if (!point) return null;
                  return (
                    <text key={index} x={xAt(index, n, chartWidth)} y={labelY} className={isLast ? 'fill-foreground' : undefined}>
                      {labelFor(chartRange, point, isLast)}
                    </text>
                  );
                })}
              </g>
            </svg>
          )}
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">Add a habit and this fills in.</p>
      )}
    </div>
  );
}
