import { db, type AiConversationRow } from '../../data/db';
import { messageFromJson, messageToJson, titleFor, type AiMessage } from './message';

/**
 * Reads and writes the assistant's history.
 *
 * Deliberately thin: a conversation is written whole every time it changes,
 * because it is small and because the whole thing is the unit last-write-wins
 * compares. Anything cleverer would be a merge strategy for a problem nobody
 * has — two devices writing the same chat in the same breath.
 */

/**
 * A Firestore document has a hard 1 MiB ceiling and a conversation only grows.
 * Trimming the oldest is what every chat does when it runs long, and it keeps
 * the end — the part anybody scrolls back to.
 */
export const maxTurns = 200;

export const newConversationId = (): string => crypto.randomUUID();

export async function listConversations(): Promise<AiConversationRow[]> {
  const rows = await db().aiConversations.filter((row) => !row.deleted).toArray();
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveConversation(
  id: string,
  messages: AiMessage[],
): Promise<AiConversationRow> {
  const existing = await db().aiConversations.get(id);
  const now = Date.now();

  // The tail rather than the head: a conversation that outgrows the cap is one
  // somebody has been using, and the recent end is what they scroll back to.
  const kept = messages.length > maxTurns ? messages.slice(-maxTurns) : messages;

  const row: AiConversationRow = {
    id,
    title: existing?.title || titleFor(messages),
    turns: kept.map((message) => JSON.stringify(messageToJson(message))),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deleted: false,
  };

  await db().aiConversations.put(row);
  return row;
}

/** Tombstoned, so deleting on one device is not undone by the next to sync. */
export async function deleteConversation(id: string): Promise<void> {
  const existing = await db().aiConversations.get(id);
  if (!existing || existing.deleted) return;
  await db().aiConversations.put({
    ...existing,
    deleted: true,
    turns: [],
    updatedAt: Date.now(),
  });
}

/**
 * Reads a conversation back into messages.
 *
 * A turn that will not parse is skipped rather than thrown: this data may have
 * been written by an older build, or by the Flutter app against the same
 * Firestore documents.
 */
export function loadConversation(row: AiConversationRow): AiMessage[] {
  const messages: AiMessage[] = [];
  for (const turn of row.turns) {
    try {
      const decoded: unknown = JSON.parse(turn);
      if (typeof decoded !== 'object' || decoded === null) continue;
      const message = messageFromJson(decoded as Record<string, unknown>);
      if (message) messages.push(message);
    } catch {
      continue;
    }
  }
  return messages;
}
