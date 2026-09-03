/**
 * The reminder scheduler: watches the local agenda — calendar events and
 * proctor sessions alike — and fires a notification once each has reached
 * its lead time.
 *
 * Foreground-only, like `notifications.ts` — this is a `setInterval` that
 * only runs while the tab is open, not a background push. Reminders read from
 * whichever account's database is currently open, so this can start once at
 * app load rather than being tied to sign-in.
 */

import { readAgenda } from './agenda';
import { notify } from './notifications';

/** The only lead times offered — a fixed menu rather than free entry, so a
 *  reminder is always a round number nobody has to think about. Shared by
 *  the calendar's event editor and the checklists' new-session dialog. */
export const reminderOptions: readonly { minutes: number; label: string }[] = [
  { minutes: 0, label: 'No reminder' },
  { minutes: 5, label: '5 minutes before' },
  { minutes: 10, label: '10 minutes before' },
  { minutes: 15, label: '15 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 1440, label: '1 day before' },
];

const checkIntervalMs = 20_000;

// Persists across checks so an entry notifies exactly once, but only for keys
// still matching the agenda below — a key drops out once its entry is
// deleted, its reminder is turned off, or it has started, which is what keeps
// this from growing for the life of the tab.
const fired = new Set<string>();

/**
 * Notifies for every agenda entry whose reminder has come due since the last
 * check.
 *
 * `now` and `seen` are parameters, not read from module state directly, so a
 * test can drive this without waiting on a real interval or leaking state
 * between cases — production calls always take the defaults.
 */
export async function checkDueReminders(
  now: number = Date.now(),
  seen: Set<string> = fired,
): Promise<void> {
  const entries = await readAgenda();

  const live = new Set<string>();
  for (const entry of entries) {
    if (entry.reminderMinutes <= 0) continue;

    const startMs = entry.start.getTime();
    // Already started (or past): drop it from `live` so it prunes below
    // rather than lingering in `seen` forever.
    if (now >= startMs) continue;

    // Namespaced by kind: calendar events and proctor sessions are separate
    // tables, so nothing stops one from reusing an id the other already used.
    const key = `${entry.kind}:${entry.id}`;
    live.add(key);

    const dueAt = startMs - entry.reminderMinutes * 60_000;
    if (now >= dueAt && !seen.has(key)) {
      seen.add(key);
      notify(entry.title || 'Untitled', {
        body: leadLabel(entry.reminderMinutes) + (entry.subtitle ? ` — ${entry.subtitle}` : ''),
        tag: `af-${key}`,
      });
    }
  }

  for (const key of seen) if (!live.has(key)) seen.delete(key);
}

function leadLabel(minutes: number): string {
  if (minutes >= 1440) return 'Starting in a day';
  if (minutes >= 60) return `Starting in ${Math.round(minutes / 60)} hour${minutes >= 120 ? 's' : ''}`;
  return `Starting in ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Starts the reminder loop once for the app's lifetime. Idempotent so it can
 *  be called from module scope in `main.tsx` without a guard at the call
 *  site. */
export function startReminderScheduler(): void {
  if (timer) return;
  void checkDueReminders();
  timer = setInterval(() => void checkDueReminders(), checkIntervalMs);
}
