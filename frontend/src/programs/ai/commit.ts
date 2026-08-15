import { db } from '../../data/db';
import { createSession, deleteSession } from '../checklists/store';
import { setHabitDone } from '../habits/store';
import {
  keptEvents,
  keptHabitTicks,
  keptRemovals,
  keptSessions,
  type AiMessage,
} from './message';

/**
 * Carries out one turn. The only thing in the program that changes anything.
 *
 * Deletions run **last**, deliberately. If a creation fails, nothing has been
 * destroyed yet — the person can retry the whole turn without having lost the
 * entries it was going to replace.
 */
export async function commitTurn(message: AiMessage): Promise<void> {
  const now = Date.now();

  for (const proposal of keptSessions(message)) {
    // Through the same function the add-session dialog uses, so a session
    // created here gets its checklist seeded and behaves exactly as a
    // hand-made one does. Writing the row directly would produce a session
    // with nothing to tick — which is most of what a session is for.
    await createSession({
      type: proposal.type,
      dateTime: proposal.start,
      room: proposal.room,
      courseCode: proposal.courseCode,
      courseName: proposal.courseName,
      courseClass: proposal.courseClass,
    });
  }

  for (const proposal of keptEvents(message)) {
    await db().calendarEvents.put({
      id: crypto.randomUUID(),
      title: proposal.title,
      notes: proposal.notes,
      start: proposal.start.getTime(),
      end: proposal.end.getTime(),
      allDay: proposal.allDay,
      category: proposal.category,
      createdAt: now,
      updatedAt: now,
      deleted: false,
    });
  }

  // Set to the state the card promised rather than flipped: by the time this
  // runs the day record may have moved underneath the proposal, and a flip
  // would then land on the opposite of what the person confirmed.
  for (const tick of keptHabitTicks(message)) {
    await setHabitDone(tick.habitId, tick.day, tick.done);
  }

  // Tombstoned rather than dropped, so the deletion propagates on the next sync
  // instead of being resurrected by the other device's copy. Branched rather
  // than sharing one table variable: the two row types differ, and collapsing
  // them to their union is how you end up writing a session's fields onto an
  // event.
  for (const entry of keptRemovals(message)) {
    if (entry.kind === 'session') {
      // Cascades to the session's checklist items under one timestamp, which
      // deleting the row by hand would not — and orphaned items are worse than
      // a session that is still there.
      await deleteSession(entry.id);
    } else {
      const existing = await db().calendarEvents.get(entry.id);
      if (!existing || existing.deleted) continue;
      await db().calendarEvents.put({ ...existing, deleted: true, updatedAt: Date.now() });
    }
  }
}
