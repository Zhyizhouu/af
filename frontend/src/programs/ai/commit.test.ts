import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, openScope } from '../../data/db';
import { commitTurn } from './commit';
import type { AiMessage, HabitTickProposal } from './message';
import { saveEvent } from '../calendar/store';
import { createSession } from '../checklists/store';
import { templateFor } from '../checklists/template';
import { readHabitsForAssistant, setHabitDone, todayKey } from '../habits/store';

vi.mock('../habits/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../habits/store')>();
  return { ...actual, setHabitDone: vi.fn(actual.setHabitDone) };
});

/**
 * The commit half of a habit tick.
 *
 * Worth testing on its own rather than only through the assistant: the model
 * costs a network round trip and a quota, and none of what matters here — that
 * the mark lands on the right day, that a dropped card is not carried out, that
 * confirming sets the state rather than flipping it — depends on the model at
 * all.
 */
describe('committing habit ticks', () => {
  const day = todayKey();

  beforeEach(async () => {
    await openScope(`test-${Math.random().toString(36).slice(2)}`);
    await db().habits.bulkPut([
      { id: 'h1', name: 'Read', toneIndex: 0, sortOrder: 0, createdAt: 1, updatedAt: 1, deleted: false },
      { id: 'h2', name: 'Run', toneIndex: 1, sortOrder: 1, createdAt: 1, updatedAt: 1, deleted: false },
    ]);
  });

  const turn = (
    habitTicks: HabitTickProposal[],
    droppedHabitTicks = new Set<number>(),
  ): AiMessage => ({
    role: 'assistant',
    text: '',
    sessions: [],
    events: [],
    removals: [],
    habitTicks,
    qrCodes: [],
    attachments: [],
    droppedSessions: new Set(),
    droppedEvents: new Set(),
    droppedRemovals: new Set(),
    droppedHabitTicks,
    committed: false,
    failed: false,
  });

  it('marks the habit on the day the card named', async () => {
    await commitTurn(turn([{ habitId: 'h1', name: 'Read', day, done: true }]));

    const record = await db().habitDays.get(day);
    expect(record?.completed).toEqual(['h1']);
  });

  it('does not carry out a card that was dropped', async () => {
    await commitTurn(
      turn(
        [
          { habitId: 'h1', name: 'Read', day, done: true },
          { habitId: 'h2', name: 'Run', day, done: true },
        ],
        new Set([1]),
      ),
    );

    const record = await db().habitDays.get(day);
    expect(record?.completed).toEqual(['h1']);
  });

  // The card promises a state, not a flip. If the day record moved between the
  // proposal and the confirm — another device, or the person ticking it by hand
  // — a flip would land on the opposite of what they agreed to.
  it('sets the state rather than toggling it', async () => {
    await setHabitDone('h1', day, true);

    await commitTurn(turn([{ habitId: 'h1', name: 'Read', day, done: true }]));

    const record = await db().habitDays.get(day);
    expect(record?.completed).toEqual(['h1']);
  });

  it('unticks when the card said so', async () => {
    await setHabitDone('h1', day, true);
    await setHabitDone('h2', day, true);

    await commitTurn(turn([{ habitId: 'h1', name: 'Read', day, done: false }]));

    const record = await db().habitDays.get(day);
    expect(record?.completed).toEqual(['h2']);
  });
});

/**
 * What the assistant is shown. Silence about habits is what made it answer a
 * request to tick one by talking about the calendar, so this is the input that
 * has to be right.
 */
describe('readHabitsForAssistant', () => {
  beforeEach(async () => {
    await openScope(`test-${Math.random().toString(36).slice(2)}`);
  });

  it('reports each habit and whether it is done today', async () => {
    await db().habits.bulkPut([
      { id: 'h1', name: 'Read', toneIndex: 0, sortOrder: 0, createdAt: 1, updatedAt: 1, deleted: false },
      { id: 'h2', name: 'Run', toneIndex: 1, sortOrder: 1, createdAt: 1, updatedAt: 1, deleted: false },
    ]);
    await setHabitDone('h2', todayKey(), true);

    expect(await readHabitsForAssistant()).toEqual([
      { id: 'h1', name: 'Read', done: false },
      { id: 'h2', name: 'Run', done: true },
    ]);
  });

  it('leaves out a deleted habit', async () => {
    await db().habits.bulkPut([
      { id: 'h1', name: 'Read', toneIndex: 0, sortOrder: 0, createdAt: 1, updatedAt: 1, deleted: false },
      { id: 'gone', name: 'Old', toneIndex: 0, sortOrder: 2, createdAt: 1, updatedAt: 1, deleted: true },
    ]);

    const shown = await readHabitsForAssistant();
    expect(shown.map((h) => h.id)).toEqual(['h1']);
  });
});

const emptyTurn = (parts: Partial<AiMessage>): AiMessage => ({
  role: 'assistant',
  text: '',
  sessions: [],
  events: [],
  removals: [],
  habitTicks: [],
  qrCodes: [],
  attachments: [],
  droppedSessions: new Set(),
  droppedEvents: new Set(),
  droppedRemovals: new Set(),
  droppedHabitTicks: new Set(),
  committed: false,
  failed: false,
  ...parts,
});

const start = new Date(2026, 2, 2, 9, 0);
const end = new Date(2026, 2, 2, 10, 0);

const mixedTurn = (day: string): AiMessage =>
  emptyTurn({
    sessions: [
      {
        type: 'UAP',
        start,
        room: 'R1',
        courseCode: 'COMP1',
        courseName: 'Intro',
        courseClass: 'LA01',
      },
    ],
    events: [{ title: 'Lunch', notes: 'n', start, end, allDay: false, category: 'social' }],
    habitTicks: [{ habitId: 'h1', name: 'Read', day, done: true }],
  });

const counts = async () => ({
  sessions: await db().proctorSessions.count(),
  items: await db().checklistItems.count(),
  events: await db().calendarEvents.count(),
  days: await db().habitDays.count(),
});

/**
 * A turn is all or nothing.
 *
 * The failure is forced on the last write of the turn, after a session and an
 * event have already been written, so what these prove is that the rows written
 * by the store functions called from inside the commit were rolled back with it.
 */
describe('committing a whole turn', () => {
  const day = todayKey();

  beforeEach(async () => {
    await openScope(`test-${Math.random().toString(36).slice(2)}`);
    vi.mocked(setHabitDone).mockClear();
  });

  it('persists nothing from the turn when one item fails mid-commit', async () => {
    vi.mocked(setHabitDone).mockRejectedValueOnce(new Error('boom'));

    await expect(commitTurn(mixedTurn(day))).rejects.toThrow('boom');

    expect(await counts()).toEqual({ sessions: 0, items: 0, events: 0, days: 0 });
  });

  it('leaves an entry it was going to delete untouched when the turn fails', async () => {
    const keep = await saveEvent({ title: 'Keep', start, end });
    vi.mocked(setHabitDone).mockRejectedValueOnce(new Error('boom'));
    const turn = mixedTurn(day);
    turn.removals = [
      {
        kind: 'event',
        id: keep.id,
        title: 'Keep',
        subtitle: '',
        start,
        end,
        allDay: false,
        category: '',
        finished: false,
        reminderMinutes: 0,
      },
    ];

    await expect(commitTurn(turn)).rejects.toThrow('boom');

    expect((await db().calendarEvents.get(keep.id))?.deleted).toBe(false);
  });

  it('creates each item exactly once when a retry follows a failure', async () => {
    vi.mocked(setHabitDone).mockRejectedValueOnce(new Error('boom'));
    const turn = mixedTurn(day);

    await expect(commitTurn(turn)).rejects.toThrow('boom');
    await commitTurn(turn);

    expect(await counts()).toEqual({
      sessions: 1,
      items: templateFor('UAP').length,
      events: 1,
      days: 1,
    });
    expect((await db().habitDays.get(day))?.completed).toEqual(['h1']);
  });

  it('gives a created event the same defaults saveEvent does', async () => {
    const viaStore = await saveEvent({ title: 'Lunch', notes: 'n', start, end, category: 'social' });
    const viaBare = await saveEvent({ title: 'Bare', start, end });

    await commitTurn(mixedTurn(day));

    const rows = await db().calendarEvents.toArray();
    const created = rows.find((row) => row.id !== viaStore.id && row.id !== viaBare.id)!;
    const { id: _a, createdAt: _b, updatedAt: _c, ...createdFields } = created;
    const { id: _d, createdAt: _e, updatedAt: _f, ...storeFields } = viaStore;

    expect(createdFields).toEqual(storeFields);
    expect(created.reminderMinutes).toBe(viaBare.reminderMinutes);
    expect(created.deleted).toBe(false);
  });

  it('tombstones the removed session with its checklist and the removed event', async () => {
    const session = await createSession({
      type: 'UAS',
      dateTime: start,
      room: 'R2',
      courseCode: 'C',
      courseName: 'N',
      courseClass: 'K',
    });
    const event = await saveEvent({ title: 'Gone', start, end });
    const entry = (kind: 'session' | 'event', id: string) => ({
      kind,
      id,
      title: '',
      subtitle: '',
      start,
      end,
      allDay: false,
      category: '',
      finished: false,
      reminderMinutes: 0,
    });

    await commitTurn(emptyTurn({ removals: [entry('session', session.id), entry('event', event.id)] }));

    expect((await db().proctorSessions.get(session.id))?.deleted).toBe(true);
    expect((await db().checklistItems.toArray()).every((item) => item.deleted)).toBe(true);
    expect((await db().calendarEvents.get(event.id))?.deleted).toBe(true);
  });
});
