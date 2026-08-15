import { beforeEach, describe, expect, it } from 'vitest';
import { db, openScope } from '../data/db';
import {
  archiveAfterMs,
  archiveStale,
  bySection,
  createSession,
  deleteSession,
  listItems,
  listSessions,
  setSessionStatus,
} from './checklists/store';
import { templateFor, uapTemplate, uasTemplate } from './checklists/template';
import { completionOver, listHabits, saveHabit, toggleHabit, deleteHabit } from './habits/store';
import {
  dayKeysFrom,
  dayLabel,
  jakartaDayKey,
  msUntilJakartaMidnight,
} from './habits/time';
import { packColumns, stepAnchor, visibleRange } from './calendar/store';

beforeEach(async () => {
  await openScope(`test-${Math.random().toString(36).slice(2)}`);
});

describe('checklists', () => {
  // A session with nothing to tick is most of a session missing, so seeding is
  // part of creating one rather than a later step that can be skipped.
  it('seeds a session with its template', async () => {
    const session = await createSession({
      type: 'UAS',
      dateTime: new Date(),
      room: '401',
      courseCode: 'COMP6047',
      courseName: 'Algorithm',
      courseClass: 'BAA1',
    });

    const items = await listItems(session.id);
    expect(items).toHaveLength(uasTemplate.length);
    expect(items[0]!.sortOrder).toBe(0);
    expect(items.every((item) => !item.isChecked)).toBe(true);
    // Order is the template's order, which is the order the job happens in.
    expect(items.map((item) => item.label)).toEqual(uasTemplate.map((item) => item.label));
  });

  it('uses the right template per type', () => {
    expect(templateFor('UAP')).toBe(uapTemplate);
    expect(templateFor('uas')).toBe(uasTemplate);
    expect(templateFor('nonsense')).toBe(uapTemplate);
    expect(uapTemplate.length + uasTemplate.length).toBeGreaterThan(100);
  });

  it('groups items by section in first-seen order', async () => {
    const session = await createSession({
      type: 'UAP',
      dateTime: new Date(),
      room: '',
      courseCode: 'X',
      courseName: '',
      courseClass: '',
    });
    const groups = bySection(await listItems(session.id));
    expect(groups[0]![0]).toBe(uapTemplate[0]!.section);
  });

  // Measured from start, the only timestamp a session carries.
  it('sweeps a stale session into the archive', async () => {
    const old = await createSession({
      type: 'UAP',
      dateTime: new Date(Date.now() - archiveAfterMs - 60_000),
      room: '',
      courseCode: 'OLD',
      courseName: '',
      courseClass: '',
    });
    const fresh = await createSession({
      type: 'UAP',
      dateTime: new Date(),
      room: '',
      courseCode: 'NEW',
      courseName: '',
      courseClass: '',
    });

    await archiveStale();

    expect((await db().proctorSessions.get(old.id))!.status).toBe('archived');
    expect((await db().proctorSessions.get(fresh.id))!.status).toBe('active');
  });

  // Otherwise it archives itself again on the next read and nothing appears to
  // have happened.
  it('exempts a reopened session from the sweep', async () => {
    const session = await createSession({
      type: 'UAP',
      dateTime: new Date(Date.now() - archiveAfterMs - 60_000),
      room: '',
      courseCode: 'X',
      courseName: '',
      courseClass: '',
    });

    await setSessionStatus(session.id, 'archived');
    await setSessionStatus(session.id, 'active');
    await archiveStale();

    const after = await db().proctorSessions.get(session.id);
    expect(after!.reopened).toBe(true);
    expect(after!.status).toBe('active');
  });

  // Orphaned checklist items are worse than a session that is still there.
  it('cascades a deletion to the checklist under one timestamp', async () => {
    const session = await createSession({
      type: 'UAP',
      dateTime: new Date(),
      room: '',
      courseCode: 'X',
      courseName: '',
      courseClass: '',
    });

    await deleteSession(session.id);

    const items = await db().checklistItems.where('sessionId').equals(session.id).toArray();
    expect(items.every((item) => item.deleted)).toBe(true);
    // Tombstoned, not dropped, or the other device resurrects them.
    expect(items.length).toBeGreaterThan(0);
    expect(await listItems(session.id)).toHaveLength(0);
    expect(await listSessions('active')).toHaveLength(0);
  });
});

describe('habits', () => {
  it('ticks and unticks a habit on a day', async () => {
    const habit = await saveHabit('Read', 1);
    const day = jakartaDayKey();

    await toggleHabit(habit.id, day);
    expect((await db().habitDays.get(day))!.completed).toEqual([habit.id]);

    await toggleHabit(habit.id, day);
    expect((await db().habitDays.get(day))!.completed).toEqual([]);
  });

  // The marks are left on the day records rather than swept, so the reader has
  // to filter them or a deleted habit keeps counting toward completion.
  it('stops counting a deleted habit', async () => {
    const kept = await saveHabit('Read', 1);
    const gone = await saveHabit('Run', 2);
    const day = jakartaDayKey();

    await toggleHabit(kept.id, day);
    await toggleHabit(gone.id, day);
    await deleteHabit(gone.id);

    expect(await listHabits()).toHaveLength(1);
    const [today] = await completionOver('day');
    // One live habit, ticked: 100%, not 200% and not 50%.
    expect(today!.fraction).toBe(1);
  });

  it('reads zero habits as zero rather than dividing by nothing', async () => {
    const [today] = await completionOver('day');
    expect(today!.fraction).toBe(0);
  });
});

describe('jakarta time', () => {
  // The whole point: the day a tick lands on must not depend on the browser's
  // zone, or a trip abroad silently corrupts a streak.
  it('buckets an instant by Jakarta, not by the local clock', () => {
    // 23:30 UTC on the 14th is 06:30 on the 15th in Jakarta.
    expect(jakartaDayKey(new Date(Date.UTC(2026, 7, 14, 23, 30)))).toBe('2026-08-15');
    // 16:30 UTC is 23:30 the same day — still the 15th.
    expect(jakartaDayKey(new Date(Date.UTC(2026, 7, 15, 16, 30)))).toBe('2026-08-15');
    // 17:30 UTC has already rolled over to the 16th in Jakarta.
    expect(jakartaDayKey(new Date(Date.UTC(2026, 7, 15, 17, 30)))).toBe('2026-08-16');
  });

  it('walks days backwards from a key', () => {
    expect(dayKeysFrom('2026-03-01', 3)).toEqual(['2026-03-01', '2026-02-28', '2026-02-27']);
  });

  // Derived from the key rather than stored, so nothing is renamed at midnight.
  it('labels today and yesterday without renaming anything', () => {
    expect(dayLabel('2026-08-15', '2026-08-15')).toBe('Today');
    expect(dayLabel('2026-08-14', '2026-08-15')).toBe('Yesterday');
    expect(dayLabel('2026-08-01', '2026-08-15')).toMatch(/2026/);
  });

  it('measures the wait to the next Jakarta midnight', () => {
    // 16:00 UTC is 23:00 Jakarta — an hour to go.
    const wait = msUntilJakartaMidnight(new Date(Date.UTC(2026, 7, 15, 16, 0)));
    expect(wait).toBe(60 * 60 * 1000);
  });
});

describe('calendar', () => {
  it('finds the week Monday-first', () => {
    // 2026-08-15 is a Saturday; its week starts on Monday the 10th.
    const { start, end } = visibleRange('week', new Date(2026, 7, 15));
    expect(start.getDate()).toBe(10);
    expect(end.getDate()).toBe(16);
  });

  // Paging off the 31st must not skip a month.
  it('clamps a month step onto a shorter month', () => {
    const stepped = stepAnchor('month', new Date(2026, 0, 31), 1);
    expect(stepped.getMonth()).toBe(1);
    expect(stepped.getDate()).toBe(28);
  });

  // Blocks that line up are readable; blocks that stagger are not.
  it('packs overlapping entries into equal columns', () => {
    const packed = packColumns(
      [
        { id: 'a', start: 0, end: 60 },
        { id: 'b', start: 30, end: 90 },
        { id: 'c', start: 200, end: 260 },
      ],
      (entry) => entry.start,
      (entry) => entry.end,
    );

    const byId = new Map(packed.map((item) => [item.entry.id, item]));
    expect(byId.get('a')!.columns).toBe(2);
    expect(byId.get('b')!.columns).toBe(2);
    expect(byId.get('a')!.column).not.toBe(byId.get('b')!.column);
    // A separate cluster gets its own full width back.
    expect(byId.get('c')!.columns).toBe(1);
  });

  // A proctor session is a point in time; two at the same minute would draw on
  // top of each other without this.
  it('gives a zero-length entry a column of its own', () => {
    const packed = packColumns(
      [
        { id: 'a', start: 100, end: 100 },
        { id: 'b', start: 100, end: 100 },
      ],
      (entry) => entry.start,
      (entry) => entry.end,
    );
    expect(packed[0]!.columns).toBe(2);
    expect(packed[0]!.column).not.toBe(packed[1]!.column);
  });
});
