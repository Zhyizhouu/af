import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { openScope } from '../../../data/db';
import * as store from '../../tasks/store';
import { createPage, listPages, savePageValue, seedDefaultProperties } from '../../tasks/store';
import { TasksWidget } from './TasksWidget';

vi.mock('../../../app/session', () => ({
  useSession: () => ({ revision: 0, requestSync: () => {} }),
}));

beforeEach(async () => {
  await openScope(`test-${Math.random().toString(36).slice(2)}`);
  await seedDefaultProperties();
});

const renderWidget = () =>
  render(
    <MemoryRouter>
      <TasksWidget />
    </MemoryRouter>,
  );

describe('TasksWidget', () => {
  it('shows the most urgent page and advances its status', async () => {
    const low = await createPage('Low one');
    await savePageValue(low.id, 'seed:priority', 'seed:priority:low');
    const urgent = await createPage('Urgent one');
    await savePageValue(urgent.id, 'seed:priority', 'seed:priority:high');
    renderWidget();

    expect(await screen.findByRole('heading', { name: 'Urgent one' })).toBeInTheDocument();
    expect(screen.getByText('Low one')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Move to In progress' }));

    await waitFor(async () => {
      const page = (await listPages()).find((row) => row.title === 'Urgent one');
      expect(page?.values['seed:status']).toBe('seed:status:in-progress');
    });
    expect(await screen.findByRole('button', { name: 'Move to Quality Check' })).toBeInTheDocument();
  });

  it('skips to the next candidate with Not now', async () => {
    const first = await createPage('First');
    await savePageValue(first.id, 'seed:priority', 'seed:priority:high');
    await createPage('Second');
    renderWidget();

    await screen.findByRole('heading', { name: 'First' });
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(await screen.findByRole('heading', { name: 'Second' })).toBeInTheDocument();
  });

  it('keeps the skip on the same pages after Move to re-sorts the queue', async () => {
    await createPage('First');
    await createPage('Second');
    await createPage('Third');
    renderWidget();

    await screen.findByRole('heading', { name: 'First' });
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await screen.findByRole('heading', { name: 'Second' });
    fireEvent.click(screen.getByRole('button', { name: 'Move to In progress' }));

    await waitFor(async () => {
      const page = (await listPages()).find((row) => row.title === 'Second');
      expect(page?.values['seed:status']).toBe('seed:status:in-progress');
    });
    expect(await screen.findByRole('heading', { name: 'Second' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(await screen.findByRole('heading', { name: 'Third' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(await screen.findByRole('heading', { name: 'Second' })).toBeInTheDocument();
  });

  it('shows Could not save when the save rejects and clears it on success', async () => {
    await createPage('Only one');
    const spy = vi.spyOn(store, 'savePageValue').mockRejectedValueOnce(new Error('offline'));
    renderWidget();

    await screen.findByRole('heading', { name: 'Only one' });
    fireEvent.click(screen.getByRole('button', { name: 'Move to In progress' }));
    expect(await screen.findByText('Could not save')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Move to In progress' }));
    await waitFor(() => expect(screen.queryByText('Could not save')).toBeNull());
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('says everything is done when nothing is open', async () => {
    const page = await createPage('Finished');
    await savePageValue(page.id, 'seed:status', 'seed:status:done');
    renderWidget();

    expect(screen.queryByText('Everything is done.')).toBeNull();
    expect(await screen.findByText('Everything is done.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Task Tracker' })).toHaveAttribute('href', '/tasks');
  });
});
