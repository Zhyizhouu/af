import type { ReactNode } from 'react';
import type { AgendaEntry, AgendaKind } from '../../data/agenda';
import { createSession, deleteSession } from '../checklists/store';
import { deleteEvent, saveEvent } from '../calendar/store';
import { setHabitDone } from '../habits/store';
import {
  eventFromJson,
  eventToJson,
  sessionFromJson,
  sessionToJson,
} from './api';
import { EventCard, HabitTickCard, RemovalCard, SessionCard } from './cards';
import type { AiMessage } from './message';

/**
 * The kinds of thing the assistant can propose, each described once.
 *
 * Storage, the review cards, dropping a card, the summary counts and the commit
 * all loop over [proposalKinds] rather than naming the four kinds, so a fifth is
 * one more entry here and a field on [AiMessage], not a hunt through a dozen
 * places for the one that was forgotten.
 */

export type ProposalKey = 'sessions' | 'events' | 'habitTicks' | 'removals';

/** The field on [AiMessage] that holds the indices dropped from a kind. */
export type DroppedKey = `dropped${Capitalize<ProposalKey>}`;

export type ProposalItem<K extends ProposalKey> = AiMessage[K][number];

/**
 * Declared with method syntax on purpose: the loops treat every kind as
 * `ProposalKind<ProposalKey>`, which only type-checks because method parameters
 * are compared bivariantly.
 */
export interface ProposalKind<K extends ProposalKey = ProposalKey> {
  /** The field on [AiMessage], and the key the kind is stored under. */
  key: K;
  /** The matching set of dropped indices, stored under its own name too. */
  dropped: `dropped${Capitalize<K>}`;
  /** Singular and plural, for the summary and the confirm button. */
  noun: readonly [one: string, many: string];
  toJson(item: ProposalItem<K>): unknown;
  /** Null when the stored row cannot be read; the row is skipped. */
  fromJson(json: Record<string, unknown>): ProposalItem<K> | null;
  /** What the server is told about a surviving item next turn. */
  wire(item: ProposalItem<K>): unknown;
  /** The review card. `onRemove` is absent once the turn is locked. */
  card(item: ProposalItem<K>, onRemove?: () => void): ReactNode;
  commit(item: ProposalItem<K>): Promise<void>;
}

const entryToStored = (entry: AgendaEntry) => ({
  id: entry.id,
  kind: entry.kind,
  title: entry.title,
  subtitle: entry.subtitle,
  start: entry.start.toISOString(),
  end: entry.end.toISOString(),
  allDay: entry.allDay,
});

function entryFromStored(json: Record<string, unknown>): AgendaEntry | null {
  const start = new Date(String(json.start ?? ''));
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(String(json.end ?? ''));
  return {
    kind: (json.kind === 'session' ? 'session' : 'event') as AgendaKind,
    id: String(json.id ?? ''),
    title: String(json.title ?? ''),
    subtitle: String(json.subtitle ?? ''),
    start,
    end: Number.isNaN(end.getTime()) ? start : end,
    allDay: Boolean(json.allDay),
    category: '',
    finished: false,
    // Not part of this snapshot's stored shape: a reopened conversation
    // shows the card as it was, not whatever reminder exists on it today.
    reminderMinutes: 0,
  };
}

const sessions: ProposalKind<'sessions'> = {
  key: 'sessions',
  dropped: 'droppedSessions',
  noun: ['session', 'sessions'],
  toJson: sessionToJson,
  fromJson: sessionFromJson,
  wire: (proposal) => proposal,
  card: (proposal, onRemove) => <SessionCard proposal={proposal} onRemove={onRemove} />,
  // Through the same function the add-session dialog uses, so a session
  // created here gets its checklist seeded and behaves exactly as a
  // hand-made one does. Writing the row directly would produce a session
  // with nothing to tick, which is most of what a session is for.
  commit: async (proposal) => {
    await createSession({
      type: proposal.type,
      dateTime: proposal.start,
      room: proposal.room,
      courseCode: proposal.courseCode,
      courseName: proposal.courseName,
      courseClass: proposal.courseClass,
    });
  },
};

const events: ProposalKind<'events'> = {
  key: 'events',
  dropped: 'droppedEvents',
  noun: ['event', 'events'],
  toJson: eventToJson,
  fromJson: eventFromJson,
  wire: (proposal) => proposal,
  card: (proposal, onRemove) => <EventCard proposal={proposal} onRemove={onRemove} />,
  // The assistant never proposes a reminder, so none is passed and the event
  // gets the editor's own default; the person sets one afterward, through the
  // ordinary event editor.
  commit: async (proposal) => {
    await saveEvent({
      title: proposal.title,
      notes: proposal.notes,
      start: proposal.start,
      end: proposal.end,
      allDay: proposal.allDay,
      category: proposal.category,
    });
  },
};

const habitTicks: ProposalKind<'habitTicks'> = {
  key: 'habitTicks',
  dropped: 'droppedHabitTicks',
  noun: ['habit', 'habits'],
  toJson: (tick) => tick,
  fromJson: (json) => {
    const tick = {
      habitId: String(json.habitId ?? ''),
      name: String(json.name ?? ''),
      day: String(json.day ?? ''),
      done: Boolean(json.done),
    };
    return tick.habitId !== '' && tick.day !== '' ? tick : null;
  },
  // The name is ours, not the server's. It only ever needed the id.
  wire: ({ habitId, day, done }) => ({ habitId, day, done }),
  card: (tick, onRemove) => <HabitTickCard tick={tick} onRemove={onRemove} />,
  // Set to the state the card promised rather than flipped: by the time this
  // runs the day record may have moved underneath the proposal, and a flip
  // would then land on the opposite of what the person confirmed.
  commit: (tick) => setHabitDone(tick.habitId, tick.day, tick.done),
};

const removals: ProposalKind<'removals'> = {
  key: 'removals',
  dropped: 'droppedRemovals',
  noun: ['entry', 'entries'],
  toJson: entryToStored,
  fromJson: entryFromStored,
  wire: (entry) => entry.id,
  card: (entry, onKeep) => <RemovalCard entry={entry} onKeep={onKeep} />,
  // Tombstoned rather than dropped, so the deletion propagates on the next sync
  // instead of being resurrected by the other device's copy. Branched rather
  // than sharing one table variable: the two row types differ, and collapsing
  // them to their union is how you end up writing a session's fields onto an
  // event. A session's delete cascades to its checklist items under one
  // timestamp, which deleting the row by hand would not.
  commit: (entry) => (entry.kind === 'session' ? deleteSession(entry.id) : deleteEvent(entry.id)),
};

/**
 * In review order, which is also commit order: the deletions come **last**, so
 * a creation that fails has destroyed nothing.
 */
export const proposalKinds: ProposalKind[] = [sessions, events, habitTicks, removals];

export const proposalKind = {
  sessions,
  events,
  habitTicks,
  removals,
};
