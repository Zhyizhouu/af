import { db } from '../../data/db';
import { keptOf, type AiMessage } from './message';
import { proposalKinds } from './proposals';

/**
 * Carries out one turn. The only thing in the program that changes anything.
 *
 * All or nothing: the whole turn runs in one transaction across every table it
 * can touch, so a failure part-way rolls back what was already written. Without
 * that, a retry after a failed creation would create the sessions and events
 * that had already landed a second time, since nothing marks them as done until
 * the whole turn succeeds.
 *
 * The writes go through the programs' own store functions, which are plain
 * awaited Dexie calls and therefore join the surrounding transaction.
 *
 * Deletions run **last**, deliberately, in the order [proposalKinds] lists them.
 * It no longer protects against a partial commit, the rollback does that, but a
 * deletion is the step that cannot be inspected afterward, so it stays at the
 * end.
 */
export async function commitTurn(message: AiMessage): Promise<void> {
  const database = db();
  await database.transaction(
    'rw',
    [database.proctorSessions, database.checklistItems, database.calendarEvents, database.habitDays],
    async () => {
      for (const kind of proposalKinds) {
        for (const item of keptOf(message, kind)) {
          await kind.commit(item);
        }
      }
    },
  );
}
