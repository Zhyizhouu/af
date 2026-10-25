import { describe, expect, it } from 'vitest';
import { addDaysToKey, jakartaClock } from './time';

describe('addDaysToKey', () => {
  it('crosses month and year ends in both directions', () => {
    expect(addDaysToKey('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysToKey('2024-02-28', 2)).toBe('2024-03-01');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2026-05-10', 0)).toBe('2026-05-10');
  });
});

describe('jakartaClock', () => {
  it('reads an instant as Jakarta wall-clock time', () => {
    expect(jakartaClock(Date.parse('2026-03-10T03:00:00Z'))).toBe('10:00');
    expect(jakartaClock(Date.parse('2026-03-09T17:05:00Z'))).toBe('00:05');
  });
});
