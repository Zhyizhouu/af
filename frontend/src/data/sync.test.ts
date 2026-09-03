import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';

/**
 * The sync pass reads and writes the *same* Firestore documents the Flutter app
 * does. While both apps exist they have to agree on every field name and shape,
 * or one will quietly overwrite what the other wrote — so what is pinned here
 * is the document contract, not the plumbing.
 */

const remote = new Map<string, Record<string, unknown>>();
const written = new Map<string, Record<string, unknown>>();

vi.mock('./firebase', () => ({ firestore: () => ({}) }));

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    collection: (_db: unknown, _users: string, uid: string, name: string) => ({
      path: `users/${uid}/${name}`,
    }),
    doc: (parent: { path: string }, id: string) => ({ path: `${parent.path}/${id}` }),
    getDocs: async (ref: { path: string }) => ({
      docs: [...remote.entries()]
        .filter(([key]) => key.startsWith(`${ref.path}/`))
        .map(([key, data]) => ({ id: key.slice(ref.path.length + 1), data: () => data })),
    }),
    writeBatch: () => ({
      set: (ref: { path: string }, data: Record<string, unknown>) => {
        written.set(ref.path, data);
      },
      commit: async () => {},
    }),
  };
});

const { db, openScope } = await import('./db');
const { syncAll } = await import('./sync');

describe('sync', () => {
  beforeEach(async () => {
    remote.clear();
    written.clear();
    await openScope(`test-${Math.random().toString(36).slice(2)}`);
  });

  it('pushes a local event in the shape Flutter reads', async () => {
    await db().calendarEvents.put({
      id: 'evt-1',
      title: 'Lunch with Dina',
      notes: 'At the canteen',
      start: Date.UTC(2026, 7, 19, 5),
      end: Date.UTC(2026, 7, 19, 6),
      allDay: false,
      category: 'social',
      createdAt: 1000,
      updatedAt: 2000,
      deleted: false,
      reminderMinutes: 15,
    });

    await syncAll('uid-1');

    const pushed = written.get('users/uid-1/events/evt-1');
    expect(pushed).toBeDefined();
    // Field names and types are the contract. Timestamps, not numbers — the
    // Flutter side reads these through `Timestamp.toDate()`.
    expect(pushed!.title).toBe('Lunch with Dina');
    expect(pushed!.category).toBe('social');
    expect(pushed!.deleted).toBe(false);
    expect(pushed!.reminderMinutes).toBe(15);
    expect(pushed!.start).toBeInstanceOf(Timestamp);
    expect((pushed!.updatedAt as Timestamp).toMillis()).toBe(2000);
  });

  // Written by a build predating reminders, or by the Flutter app, which does
  // not know the field exists at all.
  it('defaults a pulled event with no reminderMinutes to off', async () => {
    remote.set('users/uid-1/events/evt-legacy', {
      title: 'from before reminders existed',
      start: Timestamp.fromMillis(0),
      end: Timestamp.fromMillis(0),
      updatedAt: Timestamp.fromMillis(5000),
      deleted: false,
    });

    await syncAll('uid-1');

    expect((await db().calendarEvents.get('evt-legacy'))!.reminderMinutes).toBe(0);
  });

  it('pulls a remote session down, keeping the fields it does not use', async () => {
    remote.set('users/uid-1/sessions/sess-9', {
      type: 'UAS',
      dateTime: Timestamp.fromMillis(Date.UTC(2026, 7, 18, 2)),
      room: '401',
      courseCode: 'COMP6047',
      courseName: 'Algorithm',
      courseClass: 'BAA1',
      status: 'active',
      createdAt: Timestamp.fromMillis(1000),
      updatedAt: Timestamp.fromMillis(5000),
      deleted: false,
      // Written by the Flutter app and meaningless here. Dropping it on the
      // next push would silently un-exempt the session from the archive sweep.
      reopened: true,
    });

    await syncAll('uid-1');

    const local = await db().proctorSessions.get('sess-9');
    expect(local).toBeDefined();
    expect(local!.courseCode).toBe('COMP6047');
    expect(local!.reopened).toBe(true);
    expect(local!.updatedAt).toBe(5000);
  });

  // Ties go to remote so two devices converge instead of pushing the same
  // record back and forth for ever.
  it('lets the newer side win, with ties to remote', async () => {
    await db().calendarEvents.put({
      id: 'evt-2',
      title: 'local wins',
      notes: '',
      start: 0,
      end: 0,
      allDay: false,
      category: 'work',
      createdAt: 0,
      updatedAt: 9000,
      deleted: false,
      reminderMinutes: 0,
    });
    remote.set('users/uid-1/events/evt-2', {
      title: 'remote is older',
      updatedAt: Timestamp.fromMillis(8000),
    });

    await db().calendarEvents.put({
      id: 'evt-3',
      title: 'local is older',
      notes: '',
      start: 0,
      end: 0,
      allDay: false,
      category: 'work',
      createdAt: 0,
      updatedAt: 8000,
      deleted: false,
      reminderMinutes: 0,
    });
    remote.set('users/uid-1/events/evt-3', {
      title: 'remote wins',
      updatedAt: Timestamp.fromMillis(8000),
    });

    await syncAll('uid-1');

    expect(written.get('users/uid-1/events/evt-2')!.title).toBe('local wins');
    expect((await db().calendarEvents.get('evt-3'))!.title).toBe('remote wins');
    expect(written.has('users/uid-1/events/evt-3')).toBe(false);
  });

  // A tombstone has to travel, or the other device's copy resurrects it.
  it('carries a deletion rather than dropping the row', async () => {
    await db().calendarEvents.put({
      id: 'evt-4',
      title: 'gone',
      notes: '',
      start: 0,
      end: 0,
      allDay: false,
      category: 'work',
      createdAt: 0,
      updatedAt: 3000,
      deleted: true,
      reminderMinutes: 0,
    });

    await syncAll('uid-1');

    expect(written.get('users/uid-1/events/evt-4')!.deleted).toBe(true);
  });

  it('syncs conversations as an array of strings', async () => {
    await db().aiConversations.put({
      id: 'chat-1',
      title: 'exam next week',
      turns: ['{"role":"user","text":"hi"}'],
      createdAt: 1,
      updatedAt: 2,
      deleted: false,
    });

    await syncAll('uid-1');

    const pushed = written.get('users/uid-1/aiConversations/chat-1');
    expect(pushed!.title).toBe('exam next week');
    expect(pushed!.turns).toEqual(['{"role":"user","text":"hi"}']);
  });

  it('pushes a task property with its options', async () => {
    await db().taskProperties.put({
      id: 'prop-1',
      name: 'Priority',
      type: 'select',
      options: [{ id: 'opt-1', label: 'High', toneIndex: 5 }],
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 2,
      deleted: false,
    });

    await syncAll('uid-1');

    const pushed = written.get('users/uid-1/taskProperties/prop-1');
    expect(pushed!.name).toBe('Priority');
    expect(pushed!.type).toBe('select');
    expect(pushed!.options).toEqual([{ id: 'opt-1', label: 'High', toneIndex: 5 }]);
  });

  it('pulls a task property, defaulting an unrecognised type to text', async () => {
    remote.set('users/uid-1/taskProperties/prop-2', {
      name: 'Weird',
      type: 'nonsense',
      options: [],
      sortOrder: 0,
      updatedAt: Timestamp.fromMillis(5000),
    });

    await syncAll('uid-1');

    expect((await db().taskProperties.get('prop-2'))!.type).toBe('text');
  });

  it('pushes a task page with its icon and values map intact', async () => {
    await db().taskPages.put({
      id: 'page-1',
      title: 'Ship it',
      icon: { kind: 'preset', value: '★' },
      values: { 'prop-1': 'opt-1', 'prop-2': ['a', 'b'] },
      body: '',
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 2,
      deleted: false,
    });

    await syncAll('uid-1');

    const pushed = written.get('users/uid-1/taskPages/page-1');
    expect(pushed!.title).toBe('Ship it');
    expect(pushed!.icon).toEqual({ kind: 'preset', value: '★' });
    expect(pushed!.values).toEqual({ 'prop-1': 'opt-1', 'prop-2': ['a', 'b'] });
  });

  it('pulls a task page with no icon or values as empty defaults', async () => {
    remote.set('users/uid-1/taskPages/page-2', {
      title: 'Bare',
      sortOrder: 0,
      updatedAt: Timestamp.fromMillis(5000),
    });

    await syncAll('uid-1');

    const pulled = await db().taskPages.get('page-2');
    expect(pulled!.icon).toBeNull();
    expect(pulled!.values).toEqual({});
  });

  it('pushes a task page body and defaults a pulled page with none to empty', async () => {
    await db().taskPages.put({
      id: 'page-3',
      title: 'Notes',
      icon: null,
      values: {},
      body: '<h1>Plan</h1><p>Ship it.</p>',
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 2,
      deleted: false,
    });
    remote.set('users/uid-1/taskPages/page-4', {
      title: 'Written by Flutter, no body field',
      sortOrder: 0,
      updatedAt: Timestamp.fromMillis(5000),
    });

    await syncAll('uid-1');

    expect(written.get('users/uid-1/taskPages/page-3')!.body).toBe('<h1>Plan</h1><p>Ship it.</p>');
    expect((await db().taskPages.get('page-4'))!.body).toBe('');
  });

  it('syncs settings as a single document', async () => {
    await db().settings.put({
      id: 'app',
      theme: 'dark',
      font: 'consolas',
      dashboardWidgets: [{ id: 'habits', hidden: true }],
      updatedAt: 2,
    });

    await syncAll('uid-1');

    const pushed = written.get('users/uid-1/settings/app');
    expect(pushed!.theme).toBe('dark');
    expect(pushed!.font).toBe('consolas');
    expect(pushed!.dashboardWidgets).toEqual([{ id: 'habits', hidden: true }]);
  });

  it('pulls a remote to-do item down', async () => {
    remote.set('users/uid-1/todoItems/todo-1', {
      text: 'Buy milk',
      checked: false,
      sortOrder: 0,
      updatedAt: Timestamp.fromMillis(5000),
    });

    await syncAll('uid-1');

    const local = await db().todoItems.get('todo-1');
    expect(local!.text).toBe('Buy milk');
    expect(local!.checked).toBe(false);
  });

  // Checklist items and habits are still Flutter-only. A pass that pushed an
  // empty local table over them would be a data loss, not a no-op.
  it('leaves collections it does not model alone', async () => {
    remote.set('users/uid-1/habits/h1', {
      name: 'Read',
      updatedAt: Timestamp.fromMillis(1),
    });
    remote.set('users/uid-1/checklistItems/c1', {
      label: 'Check IDs',
      updatedAt: Timestamp.fromMillis(1),
    });

    await syncAll('uid-1');

    expect([...written.keys()].some((path) => path.includes('/habits/'))).toBe(false);
    expect([...written.keys()].some((path) => path.includes('/checklistItems/'))).toBe(false);
  });
});
