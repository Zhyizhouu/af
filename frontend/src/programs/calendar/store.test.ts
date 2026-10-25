import { describe, expect, it } from 'vitest';
import { packWeighted } from './store';

const item = (id: string, start: number, end: number, light = false) => ({ id, start, end, light });
const pack = (items: ReturnType<typeof item>[]) =>
  new Map(
    packWeighted(
      items,
      (entry) => entry.start,
      (entry) => entry.end,
      (entry) => entry.light,
    ).map((lane) => [lane.entry.id, lane]),
  );

describe('packWeighted', () => {
  it('gives an event 70% and a to-do 30% when they overlap', () => {
    const lanes = pack([item('event', 0, 120), item('todo', 0, 30, true)]);
    expect(lanes.get('event')!.width).toBeCloseTo(70);
    expect(lanes.get('event')!.left).toBeCloseTo(0);
    expect(lanes.get('todo')!.width).toBeCloseTo(30);
    expect(lanes.get('todo')!.left).toBeCloseTo(70);
  });

  it('keeps an all-event cluster equal', () => {
    const lanes = pack([item('a', 0, 60), item('b', 30, 90)]);
    expect(lanes.get('a')!.width).toBeCloseTo(50);
    expect(lanes.get('b')!.left).toBeCloseTo(50);
  });

  it('weighs each cluster on its own', () => {
    const lanes = pack([item('event', 0, 60), item('todo', 0, 30, true), item('lone', 200, 230, true)]);
    expect(lanes.get('lone')!.left).toBe(0);
    expect(lanes.get('lone')!.width).toBe(100);
  });
});
