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
const commits: number[] = [];
const failingPrefixes = new Set<string>();
const queried: string[] = [];

vi.mock('./firebase', () => ({ firestore: () => ({}) }));

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    collection: (_db: unknown, _users: string, uid: string, name: string) => ({
      path: `users/${uid}/${name}`,
    }),
    doc: (parent: { path: string }, id: string) => ({ path: `${parent.path}/${id}` }),
    where: (field: string, op: string, value: unknown) => ({ field, op, value }),
    query: (ref: { path: string }, ...constraints: unknown[]) => ({ ...ref, constraints }),
    serverTimestamp: () => ({ serverTimestamp: true }),
    getDocs: async (ref: {
      path: string;
      constraints?: { field: string; value: Timestamp }[];
    }) => {
      if (ref.constraints) queried.push(ref.path);
      return {
        docs: [...remote.entries()]
          .filter(([key]) => key.startsWith(`${ref.path}/`))
          .filter(([, data]) =>
            (ref.constraints ?? []).every((constraint) => {
              const value = data[constraint.field];
              return value instanceof Timestamp && value.toMillis() > constraint.value.toMillis();
            }),
          )
          .map(([key, data]) => ({ id: key.slice(ref.path.length + 1), data: () => data })),
      };
    },
    writeBatch: () => {
      const pending = new Map<string, Record<string, unknown>>();
      return {
        set: (ref: { path: string }, data: Record<string, unknown>) => {
          pending.set(ref.path, data);
        },
        commit: async () => {
          for (const path of pending.keys()) {
            for (const prefix of failingPrefixes) {
              if (path.startsWith(prefix)) throw new Error('commit refused');
            }
          }
          commits.push(pending.size);
          for (const [path, data] of pending) written.set(path, data);
        },
      };
    },
  };
});

const { db, openScope } = await import('./db');
const { syncAll } = await import('./sync');

describe('sync', () => {
  beforeEach(async () => {
    remote.clear();
    written.clear();
    commits.length = 0;
    failingPrefixes.clear();
    queried.length = 0;
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

  // A tie pushes nothing and pulls nothing, so two devices stop trading the
  // same record back and forth.
  it('lets the newer side win, leaving a tie untouched on both sides', async () => {
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
      title: 'remote tie',
      updatedAt: Timestamp.fromMillis(8000),
    });

    await syncAll('uid-1');

    expect(written.get('users/uid-1/events/evt-2')!.title).toBe('local wins');
    expect((await db().calendarEvents.get('evt-3'))!.title).toBe('local is older');
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
      fullWidth: true,
      dashboard: {
        rows: [{ widgets: [{ id: 'habits', basis: 100, height: null }] }],
        hidden: ['todo'],
      },
      hiddenPrograms: ['audio'],
      updatedAt: 2,
    });

    await syncAll('uid-1');

    const pushed = written.get('users/uid-1/settings/app');
    expect(pushed!.theme).toBe('dark');
    expect(pushed!.font).toBe('consolas');
    expect(pushed!.fullWidth).toBe(true);
    expect(pushed!.dashboard).toEqual({
      rows: [{ widgets: [{ id: 'habits', basis: 100, height: null }] }],
      hidden: ['todo'],
    });
    expect(pushed!.hiddenPrograms).toEqual(['audio']);
  });

  // Written by a build from before the dashboard used rows. Dropping it on
  // the way in would silently reset somebody's layout.
  it('migrates a legacy flat dashboard layout on the way in', async () => {
    remote.set('users/uid-1/settings/app', {
      theme: 'light',
      dashboardWidgets: [
        { id: 'habits', hidden: false, width: 6, height: 260 },
        { id: 'today', hidden: false, width: 6, height: 260 },
        { id: 'todo', hidden: true, width: 6, height: 260 },
      ],
      updatedAt: Timestamp.fromMillis(5000),
    });

    await syncAll('uid-1');

    const local = await db().settings.get('app');
    expect(local!.dashboard.rows).toHaveLength(1);
    expect(local!.dashboard.rows[0]!.widgets.map((widget) => widget.id)).toEqual(['habits', 'today']);
    expect(local!.dashboard.hidden).toEqual(['todo']);
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
    expect(local!.doneAt).toBeNull();
  });

  it('keeps the day and doneAt of a remote to-do item', async () => {
    remote.set('users/uid-1/todoItems/todo-2', {
      text: 'Pay rent',
      day: '2026-03-10',
      checked: true,
      doneAt: Timestamp.fromMillis(4000),
      sortOrder: 0,
      updatedAt: Timestamp.fromMillis(5000),
    });

    await syncAll('uid-1');

    const local = await db().todoItems.get('todo-2');
    expect(local!.day).toBe('2026-03-10');
    expect(local!.doneAt).toBe(4000);
  });

  it('pushes the local day of a to-do item the remote copy lacks', async () => {
    remote.set('users/uid-1/todoItems/todo-3', {
      text: 'Legacy',
      checked: false,
      sortOrder: 0,
      updatedAt: Timestamp.fromMillis(1000),
    });
    await db().todoItems.put({
      id: 'todo-3',
      text: 'Legacy',
      day: '2026-03-10',
      checked: false,
      doneAt: null,
      sortOrder: 0,
      createdAt: 500,
      updatedAt: 2000,
      deleted: false,
    });

    await syncAll('uid-1');

    expect((await db().todoItems.get('todo-3'))!.day).toBe('2026-03-10');
    expect(written.get('users/uid-1/todoItems/todo-3')!.day).toBe('2026-03-10');
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

  const event = (id: string, updatedAt: number, overrides: Record<string, unknown> = {}) => ({
    id,
    title: id,
    notes: '',
    start: 0,
    end: 0,
    allDay: false,
    category: 'work',
    createdAt: 0,
    updatedAt,
    deleted: false,
    reminderMinutes: 0,
    ...overrides,
  });

  it('commits 450 pushed rows in two batches', async () => {
    await db().calendarEvents.bulkPut(
      Array.from({ length: 450 }, (_, index) => event(`bulk-${index}`, 1000 + index)),
    );

    await syncAll('uid-1');

    expect(commits).toEqual([400, 50]);
    expect(written.size).toBe(450);
    expect(written.get('users/uid-1/events/bulk-0')!.syncedAt).toEqual({ serverTimestamp: true });
  });

  it('keeps syncing later collections when one fails, then rejects naming it', async () => {
    failingPrefixes.add('users/uid-1/checklistItems/');
    await db().checklistItems.put({
      id: 'item-1',
      sessionId: 's',
      label: 'x',
      section: '',
      isChecked: false,
      sortOrder: 0,
      updatedAt: 5,
      deleted: false,
    });
    await db().calendarEvents.put(event('evt-after', 10));

    await expect(syncAll('uid-1')).rejects.toThrow(/checklistItems/);

    expect(written.has('users/uid-1/events/evt-after')).toBe(true);
    expect(written.has('users/uid-1/checklistItems/item-1')).toBe(false);
  });

  it('pulls only newer syncedAt documents once a mark is set and rewrites no equal rows', async () => {
    await db().calendarEvents.put(event('seen', 5000, { title: 'local copy' }));
    await db().syncMarks.put({ name: 'events', syncedAt: 1_000_000, pushedAt: 6000, fullAt: Date.now() });
    remote.set('users/uid-1/events/seen', {
      title: 'remote copy',
      updatedAt: Timestamp.fromMillis(5000),
      syncedAt: Timestamp.fromMillis(1_000_000 + 1),
    });
    remote.set('users/uid-1/events/old', {
      title: 'outside the window',
      updatedAt: Timestamp.fromMillis(9000),
      syncedAt: Timestamp.fromMillis(1_000_000 - 60_001),
    });
    remote.set('users/uid-1/events/fresh', {
      title: 'fresh',
      updatedAt: Timestamp.fromMillis(9000),
      syncedAt: Timestamp.fromMillis(2_000_000),
    });

    await syncAll('uid-1');

    expect(queried).toContain('users/uid-1/events');
    expect((await db().calendarEvents.get('seen'))!.title).toBe('local copy');
    expect(await db().calendarEvents.get('old')).toBeUndefined();
    expect((await db().calendarEvents.get('fresh'))!.title).toBe('fresh');
    expect((await db().syncMarks.get('events'))!.syncedAt).toBe(2_000_000);
  });

  it('pushes only rows edited since the last push once a mark is set', async () => {
    await db().calendarEvents.put(event('untouched', 4000));
    await db().calendarEvents.put(event('edited', 8000));
    await db().syncMarks.put({ name: 'events', syncedAt: 1_000_000, pushedAt: 6000, fullAt: Date.now() });

    await syncAll('uid-1');

    expect(written.has('users/uid-1/events/edited')).toBe(true);
    expect(written.has('users/uid-1/events/untouched')).toBe(false);
  });

  it('skips an oversized or invalid-date document without failing the collection', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await db().calendarEvents.put(event('huge', 10, { notes: 'x'.repeat(900_001) }));
    await db().calendarEvents.put(event('bad-date', 10, { start: Number.NaN }));
    await db().calendarEvents.put(event('fine', 10));

    await expect(syncAll('uid-1')).resolves.toBeUndefined();

    expect(written.has('users/uid-1/events/huge')).toBe(false);
    expect(written.has('users/uid-1/events/bad-date')).toBe(false);
    expect(written.has('users/uid-1/events/fine')).toBe(true);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('does a full read once the last full read is over 24 hours old', async () => {
    await db().syncMarks.put({
      name: 'events',
      syncedAt: 1_000_000,
      pushedAt: 6000,
      fullAt: Date.now() - 25 * 60 * 60 * 1000,
    });
    remote.set('users/uid-1/events/legacy', {
      title: 'no syncedAt',
      updatedAt: Timestamp.fromMillis(9000),
    });

    await syncAll('uid-1');

    expect(queried).not.toContain('users/uid-1/events');
    expect((await db().calendarEvents.get('legacy'))!.title).toBe('no syncedAt');
    expect(Date.now() - (await db().syncMarks.get('events'))!.fullAt).toBeLessThan(60_000);
  });
});
