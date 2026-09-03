import { beforeEach, describe, expect, it } from 'vitest';
import { openScope } from './db';
import { readAgenda } from './agenda';
import { addOption, createPage, listProperties, saveProperty, savePageValue } from '../programs/tasks/store';

beforeEach(async () => {
  await openScope(`test-${Math.random().toString(36).slice(2)}`);
});

describe('readAgenda — Task Tracker date properties', () => {
  it('surfaces a page with a set date property as an agenda entry', async () => {
    const due = await saveProperty({ name: 'Due', type: 'date' });
    const page = await createPage('Ship the release');
    const when = new Date('2026-09-10').getTime();
    await savePageValue(page.id, due.id, when);

    const entries = await readAgenda();
    const entry = entries.find((candidate) => candidate.kind === 'task');

    expect(entry).toBeDefined();
    expect(entry!.title).toBe('Ship the release');
    expect(entry!.subtitle).toBe('Due');
    expect(entry!.start.getTime()).toBe(when);
    expect(entry!.allDay).toBe(true);
  });

  it('produces one entry per date property a page has set', async () => {
    const starts = await saveProperty({ name: 'Starts', type: 'date' });
    const ends = await saveProperty({ name: 'Ends', type: 'date' });
    const page = await createPage('Two-date task');
    await savePageValue(page.id, starts.id, new Date('2026-09-01').getTime());
    await savePageValue(page.id, ends.id, new Date('2026-09-05').getTime());

    const entries = (await readAgenda()).filter((entry) => entry.kind === 'task');

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.subtitle).sort()).toEqual(['Ends', 'Starts']);
  });

  it('skips a page whose date property was never set', async () => {
    await saveProperty({ name: 'Due', type: 'date' });
    await createPage('No date yet');

    expect((await readAgenda()).filter((entry) => entry.kind === 'task')).toHaveLength(0);
  });

  it('marks a page finished when its Status resolves to a "Done" option', async () => {
    const due = await saveProperty({ name: 'Due', type: 'date' });
    const status = await saveProperty({ name: 'Status', type: 'status' });
    await addOption(status.id, 'Done');
    const doneId = (await listProperties()).find((p) => p.id === status.id)!.options[0]!.id;

    const page = await createPage('Finished task');
    await savePageValue(page.id, status.id, doneId);
    await savePageValue(page.id, due.id, new Date('2026-09-10').getTime());

    const entry = (await readAgenda()).find((candidate) => candidate.kind === 'task')!;
    expect(entry.finished).toBe(true);
  });
});
