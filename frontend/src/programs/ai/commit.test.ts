import { beforeEach, describe, expect, it } from 'vitest';
import { db, openScope } from '../../data/db';
import { commitTurn } from './commit';
import type { AiMessage, HabitTickProposal } from './message';
import { readHabitsForAssistant, setHabitDone, todayKey } from '../habits/store';

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
