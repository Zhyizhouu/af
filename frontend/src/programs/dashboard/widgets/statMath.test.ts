import { describe, expect, it } from 'vitest';
import { countByStatus, countDueThisWeek, countDueToday, eventsToday, nextEvent } from './statMath';
import type { AgendaEntry } from '../../../data/agenda';
import type { TaskPageRow, TaskPropertyRow } from '../../../data/db';

const now = new Date('2026-09-26T05:00:00Z');

const entry = (overrides: Partial<AgendaEntry>): AgendaEntry => ({
  kind: 'event',
  id: overrides.id ?? Math.random().toString(),
  title: 'Entry',
  subtitle: '',
  start: now,
  end: now,
  allDay: false,
  category: '',
  finished: false,
  reminderMinutes: 0,
  ...overrides,
});

describe('countDueThisWeek', () => {
  it('counts unfinished tasks due between today and the seventh day', () => {
    const entries = [
      entry({ id: 'a', kind: 'task', start: new Date('2026-09-26T10:00:00Z') }),
      entry({ id: 'b', kind: 'task', start: new Date('2026-09-28T10:00:00Z') }),
      entry({ id: 'c', kind: 'task', start: new Date('2026-10-10T10:00:00Z') }),
      entry({ id: 'd', kind: 'task', start: new Date('2026-09-26T10:00:00Z'), finished: true }),
      entry({ id: 'e', kind: 'event', start: new Date('2026-09-26T10:00:00Z') }),
    ];
    expect(countDueThisWeek(entries, now)).toBe(2);
  });

  it('is zero with no entries', () => {
    expect(countDueThisWeek([], now)).toBe(0);
  });
});

describe('countDueToday', () => {
  it('counts unfinished tasks due today only', () => {
    const entries = [
      entry({ id: 'a', kind: 'task', start: new Date('2026-09-26T10:00:00Z') }),
      entry({ id: 'b', kind: 'task', start: new Date('2026-09-28T10:00:00Z') }),
      entry({ id: 'c', kind: 'task', start: new Date('2026-09-26T10:00:00Z'), finished: true }),
    ];
    expect(countDueToday(entries, now)).toBe(1);
  });
});

describe('eventsToday', () => {
  it('counts today’s non-task entries', () => {
    const entries = [
      entry({ id: 'a', kind: 'event', start: new Date('2026-09-26T02:00:00Z') }),
      entry({ id: 'b', kind: 'session', start: new Date('2026-09-26T08:00:00Z') }),
      entry({ id: 'c', kind: 'event', start: new Date('2026-09-27T08:00:00Z') }),
      entry({ id: 'd', kind: 'task', start: new Date('2026-09-26T08:00:00Z') }),
    ];
    expect(eventsToday(entries, now)).toBe(2);
  });
});

describe('nextEvent', () => {
  it('picks the earliest not-yet-started entry today', () => {
    const entries = [
      entry({ id: 'past', kind: 'event', title: 'Past', start: new Date('2026-09-26T02:00:00Z') }),
      entry({ id: 'later', kind: 'event', title: 'Later', start: new Date('2026-09-26T12:00:00Z') }),
      entry({ id: 'soonest', kind: 'event', title: 'Soonest', start: new Date('2026-09-26T08:00:00Z') }),
    ];
    expect(nextEvent(entries, now)?.id).toBe('soonest');
  });

  it('is undefined when nothing upcoming remains today', () => {
    const entries = [entry({ id: 'past', kind: 'event', start: new Date('2026-09-26T02:00:00Z') })];
    expect(nextEvent(entries, now)).toBeUndefined();
  });
});

const property = (overrides: Partial<TaskPropertyRow>): TaskPropertyRow => ({
  id: 'status',
  name: 'Status',
  type: 'status',
  options: [],
  sortOrder: 0,
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
  ...overrides,
});

const page = (values: TaskPageRow['values']): TaskPageRow => ({
  id: Math.random().toString(),
  title: 'Page',
  icon: null,
  values,
  body: '',
  sortOrder: 0,
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
});

describe('countByStatus', () => {
  const statusProperty = property({
    options: [
      { id: 'done', label: 'Done', toneIndex: 1 },
      { id: 'progress', label: 'In progress', toneIndex: 0 },
    ],
  });

  it('counts pages per option, with unset values under "No status"', () => {
    const pages = [
      page({ status: 'done' }),
      page({ status: 'done' }),
      page({ status: 'progress' }),
      page({}),
    ];
    const counts = countByStatus(pages, [statusProperty]);
    expect(counts).toEqual([
      { id: 'done', label: 'Done', toneIndex: 1, count: 2 },
      { id: 'progress', label: 'In progress', toneIndex: 0, count: 1 },
      { id: 'no-status', label: 'No status', toneIndex: null, count: 1 },
    ]);
  });

  it('counts everything as "No status" with no pages', () => {
    const counts = countByStatus([], [statusProperty]);
    expect(counts).toEqual([
      { id: 'done', label: 'Done', toneIndex: 1, count: 0 },
      { id: 'progress', label: 'In progress', toneIndex: 0, count: 0 },
      { id: 'no-status', label: 'No status', toneIndex: null, count: 0 },
    ]);
  });
});
