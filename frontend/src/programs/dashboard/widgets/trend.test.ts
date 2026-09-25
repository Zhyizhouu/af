import { describe, expect, it } from 'vitest';
import { segmentColors, trendLabel, trendOf } from './trend';

describe('trendOf', () => {
  it('reports up with the right delta for a rising series', () => {
    const fractions = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1];
    const trend = trendOf(fractions);
    expect(trend.kind).toBe('up');
    expect(trend.deltaPts).toBe(100);
  });

  it('reports flat for a noisy series with no real slope', () => {
    const fractions = [0.5, 0.52, 0.48, 0.51, 0.49, 0.5, 0.51];
    const trend = trendOf(fractions);
    expect(trend.kind).toBe('flat');
  });

  it('reports down with the right delta for a falling series', () => {
    const fractions = [1, 5 / 6, 4 / 6, 3 / 6, 2 / 6, 1 / 6, 0];
    const trend = trendOf(fractions);
    expect(trend.kind).toBe('down');
    expect(trend.deltaPts).toBe(-100);
  });

  it('is flat at zero for fewer than two points', () => {
    expect(trendOf([0.5])).toEqual({ kind: 'flat', deltaPts: 0 });
    expect(trendOf([])).toEqual({ kind: 'flat', deltaPts: 0 });
  });
});

describe('segmentColors', () => {
  it('marks a series that falls then rises as down then up', () => {
    const fractions = [1, 0.5, 0, 0.5, 1];
    const colors = segmentColors(fractions);
    expect(colors[0]).toBe('down');
    expect(colors[colors.length - 1]).toBe('up');
  });
});

describe('trendLabel', () => {
  it('labels an up trend for both ranges', () => {
    expect(trendLabel('up', 22, 7, 75)).toBe('Up 22 pts this week');
    expect(trendLabel('up', 24, 30, 75)).toBe('Up 24 pts over 30 days');
  });

  it('labels a down trend for both ranges', () => {
    expect(trendLabel('down', -25, 7, 75)).toBe('Down 25 pts this week');
    expect(trendLabel('down', -12, 30, 75)).toBe('Down 12 pts over 30 days');
  });

  it('labels a flat trend with the average for both ranges', () => {
    expect(trendLabel('flat', 1, 7, 72)).toBe('Steady around 72%');
    expect(trendLabel('flat', -1, 30, 72)).toBe('Steady around 72%');
  });
});
