import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notificationPermission,
  notificationsSupported,
  notify,
  requestNotificationPermission,
} from './notifications';

/**
 * jsdom carries no Notification constructor at all, so every test here
 * installs its own stand-in and removes it afterward — nothing about this
 * module's behaviour should depend on load order with other test files.
 */
class FakeNotification {
  static permission: NotificationPermission = 'default';
  static requestPermission = vi.fn(async () => FakeNotification.permission);
  static instances: FakeNotification[] = [];

  constructor(
    public title: string,
    public options?: NotificationOptions,
  ) {
    FakeNotification.instances.push(this);
  }
}

beforeEach(() => {
  FakeNotification.permission = 'default';
  FakeNotification.instances = [];
  FakeNotification.requestPermission = vi.fn(async () => FakeNotification.permission);
  vi.stubGlobal('Notification', FakeNotification);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('notifications', () => {
  it('reports unsupported with no Notification constructor at all', () => {
    vi.unstubAllGlobals();
    expect(notificationsSupported()).toBe(false);
    expect(notificationPermission()).toBe('unsupported');
  });

  it('reads the current permission when supported', () => {
    FakeNotification.permission = 'granted';
    expect(notificationPermission()).toBe('granted');
  });

  it('asks only when permission is still undecided', async () => {
    FakeNotification.permission = 'default';
    await requestNotificationPermission();
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('does not re-prompt once a decision already exists', async () => {
    FakeNotification.permission = 'denied';
    const result = await requestNotificationPermission();
    expect(result).toBe('denied');
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });

  it('fires a notification only when permission is granted', () => {
    FakeNotification.permission = 'default';
    notify('Should not show');
    expect(FakeNotification.instances).toHaveLength(0);

    FakeNotification.permission = 'granted';
    notify('Standup', { body: 'Starting in 5 minutes' });
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0]!.title).toBe('Standup');
    expect(FakeNotification.instances[0]!.options?.body).toBe('Starting in 5 minutes');
  });
});
