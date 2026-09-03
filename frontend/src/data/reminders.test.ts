import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, openScope, type CalendarEventRow, type ProctorSessionRow } from './db';
import { checkDueReminders } from './reminders';

class FakeNotification {
  static permission: NotificationPermission = 'granted';
  static requestPermission = vi.fn(async () => FakeNotification.permission);
  static instances: FakeNotification[] = [];

  constructor(
    public title: string,
    public options?: NotificationOptions,
  ) {
    FakeNotification.instances.push(this);
  }
}

beforeEach(async () => {
  FakeNotification.instances = [];
  FakeNotification.permission = 'granted';
  vi.stubGlobal('Notification', FakeNotification);
  await openScope(`test-${Math.random().toString(36).slice(2)}`);
});

const putEvent = (
  overrides: Pick<CalendarEventRow, 'id' | 'start' | 'reminderMinutes'> & Partial<CalendarEventRow>,
) =>
  db().calendarEvents.put({
    title: 'Standup',
    notes: '',
    end: overrides.start + 900_000,
    allDay: false,
    category: 'other',
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    ...overrides,
  });

const putSession = (
  overrides: Pick<ProctorSessionRow, 'id' | 'dateTime' | 'reminderMinutes'> & Partial<ProctorSessionRow>,
) =>
  db().proctorSessions.put({
    type: 'UAS',
    room: '401',
    courseCode: 'COMP6047',
    courseName: 'Algorithm',
    courseClass: 'BAA1',
    status: 'active',
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    reopened: false,
    ...overrides,
  });

describe('checkDueReminders', () => {
  it('notifies once the lead time has arrived', async () => {
    const start = Date.UTC(2026, 7, 18, 9, 0, 0);
    await putEvent({ id: 'evt-1', start, reminderMinutes: 10 });

    // Nine minutes before start: inside the 10-minute reminder window.
    await checkDueReminders(start - 9 * 60_000, new Set());

    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0]!.title).toBe('Standup');
  });

  it('does not notify before the lead time', async () => {
    const start = Date.UTC(2026, 7, 18, 9, 0, 0);
    await putEvent({ id: 'evt-2', start, reminderMinutes: 10 });

    // Fifteen minutes before start: not due yet for a 10-minute reminder.
    await checkDueReminders(start - 15 * 60_000, new Set());

    expect(FakeNotification.instances).toHaveLength(0);
  });

  it('does not notify twice for the same event', async () => {
    const start = Date.UTC(2026, 7, 18, 9, 0, 0);
    await putEvent({ id: 'evt-3', start, reminderMinutes: 10 });
    const seen = new Set<string>();

    await checkDueReminders(start - 5 * 60_000, seen);
    await checkDueReminders(start - 4 * 60_000, seen);

    expect(FakeNotification.instances).toHaveLength(1);
  });

  it('ignores events with reminders turned off', async () => {
    const start = Date.UTC(2026, 7, 18, 9, 0, 0);
    await putEvent({ id: 'evt-4', start, reminderMinutes: 0 });

    await checkDueReminders(start, new Set());

    expect(FakeNotification.instances).toHaveLength(0);
  });

  it('ignores a deleted event even if its reminder would be due', async () => {
    const start = Date.UTC(2026, 7, 18, 9, 0, 0);
    await putEvent({ id: 'evt-5', start, reminderMinutes: 10, deleted: true });

    await checkDueReminders(start - 60_000, new Set());

    expect(FakeNotification.instances).toHaveLength(0);
  });

  it('does not notify for an event that has already started', async () => {
    const start = Date.UTC(2026, 7, 18, 9, 0, 0);
    await putEvent({ id: 'evt-6', start, reminderMinutes: 10 });

    // Never checked before start, so this simulates the tab having been
    // closed through the entire reminder window.
    await checkDueReminders(start + 60_000, new Set());

    expect(FakeNotification.instances).toHaveLength(0);
  });

  it('prunes an id from `seen` once it stops matching, freeing it for reuse', async () => {
    const start = Date.UTC(2026, 7, 18, 9, 0, 0);
    await putEvent({ id: 'evt-7', start, reminderMinutes: 10 });
    const seen = new Set<string>();

    await checkDueReminders(start - 5 * 60_000, seen);
    expect(seen.has('event:evt-7')).toBe(true);

    // The event finishes (start passes) — its id should drop out of `seen`.
    await checkDueReminders(start + 60_000, seen);
    expect(seen.has('event:evt-7')).toBe(false);
  });

  // A proctor session is scheduled and shows up in the calendar just like an
  // event does, so it earns the same reminder rather than a second system.
  it('notifies for a proctor session too', async () => {
    const dateTime = Date.UTC(2026, 7, 18, 9, 0, 0);
    await putSession({ id: 'sess-1', dateTime, reminderMinutes: 15 });

    await checkDueReminders(dateTime - 10 * 60_000, new Set());

    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0]!.title).toBe('UAS · Room 401');
    expect(FakeNotification.instances[0]!.options?.body).toContain('COMP6047');
  });

  it('ignores a proctor session with no reminder set', async () => {
    const dateTime = Date.UTC(2026, 7, 18, 9, 0, 0);
    await putSession({ id: 'sess-2', dateTime, reminderMinutes: 0 });

    await checkDueReminders(dateTime, new Set());

    expect(FakeNotification.instances).toHaveLength(0);
  });

  // Events and sessions are separate Dexie tables, so nothing stops one from
  // reusing an id the other already used — the notify key has to account for
  // that rather than assume ids are globally unique.
  it('treats an event and a session sharing an id as two different reminders', async () => {
    const start = Date.UTC(2026, 7, 18, 9, 0, 0);
    await putEvent({ id: 'shared-id', start, reminderMinutes: 10, title: 'The event' });
    await putSession({ id: 'shared-id', dateTime: start, reminderMinutes: 10 });

    await checkDueReminders(start - 5 * 60_000, new Set());

    expect(FakeNotification.instances).toHaveLength(2);
    expect(FakeNotification.instances.map((n) => n.title).sort()).toEqual(
      ['The event', 'UAS · Room 401'].sort(),
    );
  });
});
