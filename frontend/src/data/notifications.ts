/**
 * OS-style notifications, foreground-only.
 *
 * The plain Notification API, not push: nothing here fires with the tab or
 * the browser closed, and nothing talks to a server. That is the deliberate
 * trade for needing no service worker, no push subscriptions and no backend
 * at all — see the reminder scheduler in `reminders.ts` for what uses this.
 */

export type NotifyPermission = NotificationPermission | 'unsupported';

export const notificationsSupported = (): boolean => typeof Notification !== 'undefined';

export function notificationPermission(): NotifyPermission {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

/**
 * Asks only when the answer is still undecided.
 *
 * Browsers require a user gesture to show this prompt at all, so this is
 * meant to be called from something the person just clicked — picking a
 * reminder lead time, in practice — never on page load.
 */
export async function requestNotificationPermission(): Promise<NotifyPermission> {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Fires silently on anything short of an outright granted permission — a
 *  missed reminder is not worth surfacing an error for. */
export function notify(title: string, options?: NotificationOptions): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    new Notification(title, options);
  } catch {
    // Some browsers (mobile Safari) throw constructing one directly rather
    // than simply lacking support.
  }
}
