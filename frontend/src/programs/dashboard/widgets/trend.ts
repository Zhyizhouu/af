export type TrendKind = 'up' | 'flat' | 'down';

export interface Trend {
  kind: TrendKind;
  deltaPts: number;
}

export const trendUpColor = 'var(--trend-up)';
export const trendFlatColor = 'var(--trend-flat)';
export const trendDownColor = 'var(--trend-down)';

export const trendUpSoft = 'rgba(52,211,153,0.35)';
export const trendFlatSoft = 'rgba(255,255,255,0.3)';
export const trendDownSoft = 'rgba(251,113,133,0.35)';

export function trendColor(kind: TrendKind): string {
  if (kind === 'up') return trendUpColor;
  if (kind === 'down') return trendDownColor;
  return trendFlatColor;
}

export function trendSoftColor(kind: TrendKind): string {
  if (kind === 'up') return trendUpSoft;
  if (kind === 'down') return trendDownSoft;
  return trendFlatSoft;
}

function slopeOf(fractions: number[]): number {
  const n = fractions.length;
  const xMean = (n - 1) / 2;
  const yMean = fractions.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = i - xMean;
    numerator += dx * ((fractions[i] ?? 0) - yMean);
    denominator += dx * dx;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

export function trendOf(fractions: number[]): Trend {
  const n = fractions.length;
  if (n < 2) return { kind: 'flat', deltaPts: 0 };

  const slope = slopeOf(fractions);
  const deltaPts = Math.round(slope * (n - 1) * 100);

  if (deltaPts > 3) return { kind: 'up', deltaPts };
  if (deltaPts < -3) return { kind: 'down', deltaPts };
  return { kind: 'flat', deltaPts };
}

export function segmentColors(fractions: number[]): TrendKind[] {
  const n = fractions.length;
  return fractions.map((_, i) => {
    const after = fractions[Math.min(n - 1, i + 2)] ?? 0;
    const before = fractions[Math.max(0, i - 2)] ?? 0;
    const diffPts = (after - before) * 100;
    if (diffPts > 2) return 'up';
    if (diffPts < -2) return 'down';
    return 'flat';
  });
}

export function trendLabel(kind: TrendKind, deltaPts: number, days: 7 | 30, avgPct: number): string {
  const span = days === 7 ? 'this week' : 'over 30 days';
  if (kind === 'up') return `Up ${deltaPts} pts ${span}`;
  if (kind === 'down') return `Down ${Math.abs(deltaPts)} pts ${span}`;
  return `Steady around ${avgPct}%`;
}
