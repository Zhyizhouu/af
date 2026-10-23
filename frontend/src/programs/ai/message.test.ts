import { describe, expect, it } from 'vitest';
import { dropAll, dropAt, hasProposals, keptCount, messageFromJson, messageToJson, toTurn } from './message';

/**
 * A turn exactly as the build before the proposal table wrote it.
 *
 * Conversations live in IndexedDB and Firestore, so a turn saved before the
 * refactor is read by the code after it. This is the stored shape with all four
 * proposal kinds, their dropped indices and the fields beside them; it must
 * come back unchanged.
 */
const storedTurn = {
  role: 'assistant',
  text: 'Here is what I would do.',
  sessions: [
    {
      type: 'UAS',
      start: '2026-03-02 09:00',
      room: 'R401',
      courseCode: 'COMP6100',
      courseName: 'Algorithms',
      courseClass: 'LA01',
    },
    {
      type: 'UAP',
      start: '2026-03-03 13:30',
      room: '',
      courseCode: 'COMP6200',
      courseName: 'Databases',
      courseClass: 'LB02',
    },
  ],
  events: [
    {
      title: 'Lunch',
      notes: 'with the team',
      start: '2026-03-02 12:00',
      end: '2026-03-02 13:00',
      allDay: false,
      category: 'social',
    },
  ],
  removals: [
    {
      id: 'evt-9',
      kind: 'event',
      title: 'Old meeting',
      subtitle: 'Weekly',
      start: '2026-03-04T02:00:00.000Z',
      end: '2026-03-04T03:00:00.000Z',
      allDay: false,
    },
  ],
  habitTicks: [
    { habitId: 'h1', name: 'Read', day: '2026-03-02', done: true },
    { habitId: 'h2', name: 'Run', day: '2026-03-02', done: false },
  ],
  qrCodes: [{ text: 'https://example.test', label: 'Site', ecc: 'M', useLogo: false }],
  attachments: [{ name: 'logo.png', kind: 'image/png', data: 'data:image/png;base64,AAAA' }],
  droppedSessions: [1],
  droppedEvents: [0],
  droppedRemovals: [0],
  droppedHabitTicks: [1],
  committed: true,
};

describe('stored turns', () => {
  it('reads and writes back a turn saved in the previous stored shape', () => {
    const restored = messageFromJson(storedTurn);

    expect(restored).not.toBeNull();
    expect(restored!.sessions).toHaveLength(2);
    expect(restored!.sessions[0]).toMatchObject({ type: 'UAS', room: 'R401', courseClass: 'LA01' });
    expect(restored!.sessions[0]!.start).toEqual(new Date(2026, 2, 2, 9, 0));
    expect(restored!.events[0]).toMatchObject({ title: 'Lunch', category: 'social', allDay: false });
    expect(restored!.removals[0]).toMatchObject({ id: 'evt-9', kind: 'event', title: 'Old meeting' });
    expect(restored!.habitTicks.map((t) => t.habitId)).toEqual(['h1', 'h2']);
    expect(restored!.droppedSessions).toEqual(new Set([1]));
    expect(restored!.droppedEvents).toEqual(new Set([0]));
    expect(restored!.droppedRemovals).toEqual(new Set([0]));
    expect(restored!.droppedHabitTicks).toEqual(new Set([1]));
    expect(restored!.committed).toBe(true);

    expect(messageToJson(restored!)).toEqual(storedTurn);
  });

  it('skips a stored row that cannot be read and keeps the rest', () => {
    const restored = messageFromJson({
      role: 'assistant',
      text: '',
      sessions: [{ type: 'UAS', start: 'not a time' }],
      habitTicks: [{ habitId: '', day: '2026-03-02' }, { habitId: 'h1', day: '2026-03-02', done: true }],
    });

    expect(restored!.sessions).toEqual([]);
    expect(restored!.habitTicks).toEqual([{ habitId: 'h1', name: '', day: '2026-03-02', done: true }]);
  });

  it('counts and sends only what survived review', () => {
    const restored = messageFromJson(storedTurn)!;

    expect(hasProposals(restored)).toBe(true);
    expect(keptCount(restored)).toBe(2);
    expect(toTurn(restored)).toMatchObject({
      removals: [],
      habitTicks: [{ habitId: 'h1', day: '2026-03-02', done: true }],
    });
    expect(Object.keys(toTurn(restored).habitTicks![0]!)).not.toContain('name');
  });

  it('drops one item, then everything', () => {
    const restored = messageFromJson(storedTurn)!;

    expect(dropAt(restored, 'droppedSessions', 0).droppedSessions).toEqual(new Set([0, 1]));
    expect(keptCount(dropAll(restored))).toBe(0);
  });
});
