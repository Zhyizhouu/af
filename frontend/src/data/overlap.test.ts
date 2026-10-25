import { beforeEach, describe, expect, it } from 'vitest';
import { entryFromEvent, entryFromSession } from './agenda';
import { db, openScope, type CalendarEventRow, type ProctorSessionRow, type TodoItemRow } from './db';
import { entryEnd, findOverlaps, readEntriesForDays, todoInstant, todoInstantOrNull } from './overlap';

const day = '2026-03-10';
const at = (d: string, time: string) => todoInstant(d, time).getTime();

const event = (id: string, start: number, end: number, allDay = false): CalendarEventRow => ({
  id,
  title: id,
  notes: '',
  start,
  end,
  allDay,
  category: '',
  createdAt: 1,
  updatedAt: 1,
  deleted: false,
  reminderMinutes: 0,
});

const session = (id: string, dateTime: number): ProctorSessionRow => ({
  id,
  type: 'Exam',
  dateTime,
  room: '1',
  courseCode: '',
  courseName: '',
  courseClass: '',
  status: 'scheduled',
  createdAt: 1,
  updatedAt: 1,
  deleted: false,
  reopened: false,
  reminderMinutes: 0,
});

const todo = (id: string, time: string | null, deleted = false): TodoItemRow => ({
  id,
  text: id,
  day,
  checked: false,
  doneAt: null,
  sortOrder: 0,
  createdAt: 1,
  updatedAt: 1,
  deleted,
  time,
});

beforeEach(async () => {
  await openScope(`test-${Math.random().toString(36).slice(2)}`);
});

describe('todoInstant', () => {
  it('is the Jakarta wall time as an instant', () => {
    expect(todoInstant('2026-03-10', '10:00').toISOString()).toBe('2026-03-10T03:00:00.000Z');
    expect(todoInstant('2026-03-10', '00:00').toISOString()).toBe('2026-03-09T17:00:00.000Z');
  });

  it('never yields an Invalid Date for an empty or malformed time', () => {
    for (const bad of ['', 'ab:cd', '25:00', '9:00']) {
      expect(todoInstantOrNull('2026-03-10', bad)).toBeNull();
      expect(todoInstant('2026-03-10', bad).toISOString()).toBe('2026-03-09T17:00:00.000Z');
    }
    expect(todoInstantOrNull('2026-03-10', '10:00')!.toISOString()).toBe('2026-03-10T03:00:00.000Z');
  });
});

describe('findOverlaps', () => {
  const entries = [
    entryFromEvent(event('long', at(day, '10:00'), at(day, '12:00'))),
    entryFromEvent(event('noon', at(day, '12:00'), at(day, '13:00'))),
    entryFromEvent(event('holiday', at(day, '00:00'), at(day, '23:59'), true)),
    entryFromSession(session('proctor', at(day, '10:00'))),
  ];

  it('gives a session a nominal half hour', () => {
    expect(entryEnd(entries[3]!)).toBe(at(day, '10:30'));
    expect(entryEnd(entries[0]!)).toBe(at(day, '12:00'));
  });

  it('matches an event and a session running at the time, ordered by start, but not a later event or all-day entry', () => {
    const found = findOverlaps([todo('ten', '10:00')], entries);

    expect([...found.keys()]).toEqual(['ten']);
    expect(found.get('ten')!.map((entry) => entry.id)).toEqual(['long', 'proctor']);
  });

  it('treats the end as exclusive and the start as inclusive', () => {
    const found = findOverlaps([todo('noon', '12:00'), todo('late', '10:30')], entries);

    expect(found.get('noon')!.map((entry) => entry.id)).toEqual(['noon']);
    expect(found.get('late')!.map((entry) => entry.id)).toEqual(['long']);
  });

  it('treats an invalid time as untimed', () => {
    expect(findOverlaps([todo('blank', ''), todo('junk', 'ab:cd')], entries).size).toBe(0);
  });

  it('never overlaps an untimed or deleted to-do', () => {
    expect(findOverlaps([todo('any', null), todo('gone', '10:00', true)], entries).size).toBe(0);
  });
});

describe('readEntriesForDays', () => {
  it('returns an event spanning midnight into the day, and leaves out ones outside it', async () => {
    const next = '2026-03-11';
    await db().calendarEvents.bulkPut([
      event('overnight', at(day, '22:00'), at(next, '02:00')),
      event('inside', at(next, '09:00'), at(next, '10:00')),
      event('before', at(day, '08:00'), at(day, '09:00')),
      event('evening', at(next, '23:00'), at(next, '23:30')),
    ]);
    await db().proctorSessions.put(session('exam', at(next, '23:50')));

    const ids = (await readEntriesForDays(next, next)).map((entry) => entry.id);

    expect(ids).toEqual(['overnight', 'inside', 'evening', 'exam']);
    expect(ids).not.toContain('before');
  });

  it('excludes an entry starting exactly when the range ends', async () => {
    await db().calendarEvents.put(event('next-day', at('2026-03-12', '00:00'), at('2026-03-12', '01:00')));

    expect(await readEntriesForDays('2026-03-11', '2026-03-11')).toEqual([]);
  });
});
