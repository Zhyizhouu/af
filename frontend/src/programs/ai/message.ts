import type { AgendaEntry, AgendaKind } from '../../data/agenda';
import {
  type AttachmentRef,
  type QrArtifact,
  eventFromJson,
  eventToJson,
  formatLocal,
  sessionFromJson,
  sessionToJson,
  type AiAnswer,
  type AiTurn,
  type EventProposal,
  type SessionProposal,
} from './api';

/**
 * One turn as it sits on screen, and as it is stored.
 *
 * It knows how to write itself down because the transcript is the only record
 * of a conversation that exists: the assistant's API keeps nothing between
 * calls, so anything not saved here is gone the moment the tab is closed.
 */
export interface AiMessage {
  role: 'user' | 'assistant';
  text: string;
  sessions: SessionProposal[];
  events: EventProposal[];
  /**
   * Entries it offered to delete, snapshotted the moment the answer arrived
   * rather than looked up at paint time: committing removes them from the
   * calendar, and the transcript still has to show what was done — doubly so
   * once a conversation can be reopened days later on another device.
   */
  removals: AgendaEntry[];
  /**
   * Marks it offered to make against habits, with the habit's name snapshotted
   * for the same reason removals are: the card has to keep saying which habit
   * it was even after that habit is renamed or deleted.
   */
  habitTicks: HabitTickProposal[];
  /** Produced, not proposed — nothing here waits behind the confirm button. */
  qrCodes: QrArtifact[];
  /** Files the person put on this turn. See [AiAttachment]. */
  attachments: AiAttachment[];
  /** Held as index sets so dropping one cannot renumber the rest mid-review. */
  droppedSessions: Set<number>;
  droppedEvents: Set<number>;
  droppedRemovals: Set<number>;
  droppedHabitTicks: Set<number>;
  /** Stops a turn being carried out twice, including after a reload. */
  committed: boolean;
  /** A failure, kept in place so it stays attached to what caused it. */
  failed: boolean;
}

/**
 * A file attached to a turn.
 *
 * The bytes live in the transcript rather than in a side table, so a logo is
 * still there when the conversation is reopened on another device — a QR is
 * re-rendered from its text and this image every time, and a missing logo would
 * quietly produce a different code from the one that was approved.
 *
 * That is also why [maxAttachmentBytes] is small: the conversation is one
 * Firestore document with a hard 1 MiB ceiling, and these are inside it.
 */
export interface AiAttachment {
  name: string;
  kind: string;
  /** A data URL. */
  data: string;
}

/**
 * One proposed mark against one habit.
 *
 * `name` is carried rather than looked up at paint time: confirming does not
 * change the habit list, but deleting a habit later would otherwise leave a
 * card in the transcript that cannot say what it ticked.
 */
export interface HabitTickProposal {
  habitId: string;
  name: string;
  /** YYYY-MM-DD in Jakarta, matching the key habit days are stored under. */
  day: string;
  done: boolean;
}

export const maxAttachmentBytes = 96 * 1024;

const blank = (): Pick<
  AiMessage,
  'sessions' | 'events' | 'removals' | 'habitTicks' | 'qrCodes' | 'attachments' | 'droppedSessions' | 'droppedEvents' | 'droppedRemovals' | 'droppedHabitTicks' | 'committed' | 'failed'
> => ({
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
});

export const userMessage = (text: string, attachments: AiAttachment[] = []): AiMessage => ({
  role: 'user',
  text,
  ...blank(),
  attachments,
});

export const errorMessage = (text: string): AiMessage => ({
  role: 'assistant',
  text,
  ...blank(),
  failed: true,
});

/**
 * Builds an assistant turn, resolving the ids it wants deleted against the
 * calendar as it stands right now.
 *
 * An id that resolves to nothing is dropped rather than drawn as a placeholder:
 * a delete card that cannot say what it deletes is not something anybody can
 * confirm.
 */
export function assistantMessage(
  answer: AiAnswer,
  agenda: AgendaEntry[],
  habitNames: Map<string, string> = new Map(),
): AiMessage {
  const byId = new Map(agenda.map((entry) => [entry.id, entry]));
  return {
    role: 'assistant',
    text: answer.reply,
    ...blank(),
    sessions: answer.sessions,
    events: answer.events,
    qrCodes: answer.qrCodes,
    removals: answer.removals
      .map((id) => byId.get(id))
      .filter((entry): entry is AgendaEntry => entry !== undefined),
    // Same rule as removals: a tick naming a habit that no longer exists is
    // dropped rather than drawn nameless. A card that cannot say what it ticks
    // is not something anybody can confirm.
    habitTicks: answer.habitTicks.flatMap((tick) => {
      const name = habitNames.get(tick.habitId);
      return name === undefined ? [] : [{ ...tick, name }];
    }),
  };
}

const keep = <T,>(items: T[], dropped: Set<number>): T[] =>
  items.filter((_, index) => !dropped.has(index));

export const keptSessions = (m: AiMessage) => keep(m.sessions, m.droppedSessions);
export const keptEvents = (m: AiMessage) => keep(m.events, m.droppedEvents);
export const keptRemovals = (m: AiMessage) => keep(m.removals, m.droppedRemovals);
export const keptHabitTicks = (m: AiMessage) => keep(m.habitTicks, m.droppedHabitTicks);

/** Anything needing confirmation. QR codes are deliberately not among them. */
export const hasProposals = (m: AiMessage) =>
  m.sessions.length > 0 || m.events.length > 0 || m.removals.length > 0 ||
  m.habitTicks.length > 0;

export const keptCount = (m: AiMessage) =>
  keptSessions(m).length + keptEvents(m).length + keptRemovals(m).length +
  keptHabitTicks(m).length;

/**
 * What the server is told about this turn next time.
 *
 * Only what survived review: the assistant should work from what is still on
 * the table, not from what was thrown out.
 */
export const toTurn = (m: AiMessage): AiTurn => ({
  role: m.role,
  text: m.text,
  sessions: keptSessions(m),
  events: keptEvents(m),
  removals: keptRemovals(m).map((entry) => entry.id),
  // The name is ours, not the server's — it only ever needed the id.
  habitTicks: keptHabitTicks(m).map(({ habitId, day, done }) => ({ habitId, day, done })),
  committed: m.committed,
});

// ---- storage ----

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
    // Not part of this snapshot's stored shape — a reopened conversation
    // shows the card as it was, not whatever reminder exists on it today.
    reminderMinutes: 0,
  };
}

export function messageToJson(m: AiMessage): Record<string, unknown> {
  return {
    role: m.role,
    text: m.text,
    ...(m.sessions.length ? { sessions: m.sessions.map(sessionToJson) } : {}),
    ...(m.events.length ? { events: m.events.map(eventToJson) } : {}),
    ...(m.removals.length ? { removals: m.removals.map(entryToStored) } : {}),
    ...(m.habitTicks.length ? { habitTicks: m.habitTicks } : {}),
    ...(m.qrCodes.length ? { qrCodes: m.qrCodes } : {}),
    ...(m.attachments.length ? { attachments: m.attachments } : {}),
    ...(m.droppedSessions.size ? { droppedSessions: [...m.droppedSessions] } : {}),
    ...(m.droppedEvents.size ? { droppedEvents: [...m.droppedEvents] } : {}),
    ...(m.droppedRemovals.size ? { droppedRemovals: [...m.droppedRemovals] } : {}),
    ...(m.droppedHabitTicks.size ? { droppedHabitTicks: [...m.droppedHabitTicks] } : {}),
    ...(m.committed ? { committed: true } : {}),
    ...(m.failed ? { failed: true } : {}),
  };
}

const indices = (value: unknown): Set<number> =>
  new Set(
    (Array.isArray(value) ? value : []).filter(
      (index): index is number => typeof index === 'number',
    ),
  );

/**
 * Reads a stored turn back, or null if it is not one.
 *
 * Forgiving on the way in: this data has been through IndexedDB and Firestore
 * and may have been written by an older build — or by the Flutter one. A turn
 * that cannot be read costs a turn rather than the whole conversation.
 */
export function messageFromJson(json: Record<string, unknown>): AiMessage | null {
  const role = json.role;
  if (role !== 'user' && role !== 'assistant') return null;

  return {
    role,
    text: String(json.text ?? ''),
    sessions: (Array.isArray(json.sessions) ? json.sessions : [])
      .map((s) => sessionFromJson(s as Record<string, unknown>))
      .filter((s): s is SessionProposal => s !== null),
    events: (Array.isArray(json.events) ? json.events : [])
      .map((e) => eventFromJson(e as Record<string, unknown>))
      .filter((e): e is EventProposal => e !== null),
    removals: (Array.isArray(json.removals) ? json.removals : [])
      .map((r) => entryFromStored(r as Record<string, unknown>))
      .filter((r): r is AgendaEntry => r !== null),
    habitTicks: (Array.isArray(json.habitTicks) ? json.habitTicks : []).map((tick) => {
      const t = tick as Record<string, unknown>;
      return {
        habitId: String(t.habitId ?? ''),
        name: String(t.name ?? ''),
        day: String(t.day ?? ''),
        done: Boolean(t.done),
      };
    }).filter((tick) => tick.habitId !== '' && tick.day !== ''),
    qrCodes: (Array.isArray(json.qrCodes) ? json.qrCodes : []).map((code) => {
      const c = code as Record<string, unknown>;
      return {
        text: String(c.text ?? ''),
        label: String(c.label ?? 'QR code'),
        ecc: String(c.ecc ?? 'M'),
        useLogo: Boolean(c.useLogo),
      };
    }).filter((code) => code.text !== ''),
    attachments: (Array.isArray(json.attachments) ? json.attachments : []).map((file) => {
      const f = file as Record<string, unknown>;
      return {
        name: String(f.name ?? 'file'),
        kind: String(f.kind ?? ''),
        data: String(f.data ?? ''),
      };
    }).filter((file) => file.data !== ''),
    droppedSessions: indices(json.droppedSessions),
    droppedEvents: indices(json.droppedEvents),
    droppedRemovals: indices(json.droppedRemovals),
    droppedHabitTicks: indices(json.droppedHabitTicks),
    committed: Boolean(json.committed),
    failed: Boolean(json.failed),
  };
}

/** A name for the sidebar, taken from the first thing asked. */
export function titleFor(messages: AiMessage[]): string {
  for (const message of messages) {
    if (message.role !== 'user') continue;
    const text = message.text.trim().replace(/\s+/g, ' ');
    if (!text) continue;
    return text.length <= 60 ? text : `${text.slice(0, 57)}…`;
  }
  return 'New conversation';
}

/** What the server is told about the files: names and kinds, never bytes. */
export const attachmentRefs = (messages: AiMessage[]): AttachmentRef[] =>
  messages.flatMap((message) =>
    message.attachments.map(({ name, kind }) => ({ name, kind })),
  );

/**
 * The image a QR should use as its logo: the most recent one attached.
 *
 * Latest wins because attaching a second logo is how somebody replaces the
 * first — there is no other gesture for it in the composer.
 */
export function latestLogo(messages: AiMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const file = messages[i]?.attachments.findLast((a) => a.kind.startsWith('image/'));
    if (file) return file.data;
  }
  return null;
}

export { formatLocal };
