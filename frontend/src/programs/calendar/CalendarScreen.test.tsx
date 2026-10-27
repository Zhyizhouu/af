import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readAgenda } from '../../data/agenda';
import { openScope } from '../../data/db';
import { todoInstant } from '../../data/overlap';
import { keyFromDay } from '../habits/time';
import { addTodo, listTodosForDay, listTodosInRange } from '../todo/store';
import { CalendarScreen } from './CalendarScreen';
import { saveEvent } from './store';

vi.mock('../../data/agenda', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/agenda')>();
  return { ...actual, readAgenda: vi.fn(actual.readAgenda) };
});

vi.mock('../todo/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../todo/store')>();
  return { ...actual, listTodosInRange: vi.fn(actual.listTodosInRange) };
});

vi.mock('../../app/session', () => ({
  useSession: () => ({ revision: 0, requestSync: () => {} }),
}));

const localToday = () => {
  const now = new Date();
  return keyFromDay(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
};

const today = localToday();
const eventTitle = 'Proctor UAS';
const todoText = 'Review with the coordinator';
const chipText = 'Buy printer paper';

const originalWidth = window.innerWidth;
afterEach(() => {
  window.innerWidth = originalWidth;
});

beforeEach(async () => {
  vi.mocked(readAgenda).mockClear();
  vi.mocked(listTodosInRange).mockClear();
  await openScope(`test-${Math.random().toString(36).slice(2)}`);
  await saveEvent({
    title: eventTitle,
    start: todoInstant(today, '10:00'),
    end: todoInstant(today, '12:00'),
  });
});

const percentOf = (element: HTMLElement | null, property: 'left' | 'width') => {
  const match = /calc\(([\d.]+)%/.exec(element!.style[property]);
  return Number(match![1]);
};

const checkedInStore = async (text: string) =>
  (await listTodosForDay(today)).find((row) => row.text === text)!.checked;

describe('CalendarScreen to-dos', () => {
  it('draws a timed to-do in its own lane beside an event on a wide day view', async () => {
    await addTodo(todoText, today, { time: '10:00' });
    render(<CalendarScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Day' }));

    const todoBlock = (await screen.findByText(todoText)).closest<HTMLElement>('[title]');
    const eventBlock = screen.getByText(eventTitle).closest<HTMLElement>('[title]');
    expect(todoBlock).toHaveClass('border-dashed');
    expect(within(todoBlock!).getByRole('checkbox', { name: todoText })).toBeInTheDocument();
    expect(percentOf(eventBlock, 'width')).toBeGreaterThan(percentOf(todoBlock, 'width'));
    expect(percentOf(eventBlock, 'width')).toBeCloseTo(70);
    expect(percentOf(todoBlock, 'left')).toBeCloseTo(70);
  });

  it('docks a clashing to-do on the event in a narrow pane and ticks it from the panel', async () => {
    await addTodo(todoText, today, { time: '10:00' });
    render(<CalendarScreen paneWidth="split" />);
    fireEvent.click(screen.getByRole('button', { name: 'D' }));

    const pill = await screen.findByRole('button', { name: `1 to-do during ${eventTitle}` });
    expect(pill).toHaveTextContent('1');
    expect(screen.queryByText(`During ${eventTitle}`)).not.toBeInTheDocument();

    fireEvent.click(pill);
    expect(screen.getByText(`During ${eventTitle}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: todoText }));
    await waitFor(async () => expect(await checkedInStore(todoText)).toBe(true));

    fireEvent.click(pill);
    expect(screen.queryByText(`During ${eventTitle}`)).not.toBeInTheDocument();
  });

  it('lists an untimed to-do in the all-day strip and ticks it there', async () => {
    await addTodo(chipText, today);
    render(<CalendarScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Day' }));

    const strip = await screen.findByLabelText('All day');
    fireEvent.click(within(strip).getByRole('checkbox', { name: chipText }));
    await waitFor(async () => expect(await checkedInStore(chipText)).toBe(true));
  });

  it('lists the selected day to-do in the month agenda', async () => {
    await addTodo(chipText, today);
    render(<CalendarScreen />);

    expect(await screen.findByText(chipText)).toBeInTheDocument();
    expect(screen.getByText('any time')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: chipText }));
    await waitFor(async () => expect(await checkedInStore(chipText)).toBe(true));
  });

  it('keeps the selected day to-do in the month agenda after paging away', async () => {
    await addTodo(chipText, today);
    render(<CalendarScreen />);
    expect(await screen.findByText(chipText)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
    expect(await screen.findByText(chipText)).toBeInTheDocument();
  });

  it('gives to-dos at 10:00 and 10:30 separate lanes on a wide day view', async () => {
    await addTodo('First', today, { time: '10:00' });
    await addTodo('Second', today, { time: '10:30' });
    render(<CalendarScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Day' }));

    const first = (await screen.findByText('First')).closest<HTMLElement>('[title]');
    const second = screen.getByText('Second').closest<HTMLElement>('[title]');
    expect(first!.style.left).not.toBe(second!.style.left);
  });

  it('reloads only the to-dos after a tick', async () => {
    await addTodo(chipText, today);
    render(<CalendarScreen />);
    await screen.findByText(chipText);
    const calls = vi.mocked(readAgenda).mock.calls.length;

    fireEvent.click(screen.getByRole('checkbox', { name: chipText }));
    await waitFor(async () => expect(await checkedInStore(chipText)).toBe(true));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: chipText })).toBeChecked());
    expect(vi.mocked(readAgenda).mock.calls.length).toBe(calls);
  });

  it('counts to-dos among the entries of the selected day', async () => {
    await addTodo(chipText, today);
    render(<CalendarScreen />);
    expect(await screen.findByText(/^2 entries/)).toHaveTextContent('2 entries · 1 to-do');
  });

  it('labels the all-day strip as a group and links the dock pill to its panel', async () => {
    await addTodo(chipText, today);
    await addTodo(todoText, today, { time: '10:00' });
    render(<CalendarScreen paneWidth="split" />);
    fireEvent.click(screen.getByRole('button', { name: 'D' }));

    expect(await screen.findByRole('group', { name: 'All day' })).toBeInTheDocument();
    const pill = await screen.findByRole('button', { name: `1 to-do during ${eventTitle}` });
    expect(pill).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(pill);
    expect(pill).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByText(`During ${eventTitle}`).parentElement!;
    expect(pill.getAttribute('aria-controls')).toBe(panel.id);
  });

  it('gives tick boxes a 44px hit area in a narrow pane', async () => {
    await addTodo(chipText, today);
    render(<CalendarScreen paneWidth="split" />);
    expect(await screen.findByRole('checkbox', { name: chipText })).toHaveClass('after:size-11');
  });

  it('shows timed to-dos as per-hour pills, not blocks, in a narrow week', async () => {
    window.innerWidth = 375;
    await addTodo('Lunch call', today, { time: '15:20' });
    render(<CalendarScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));

    const pill = await screen.findByRole('button', { name: '1 to-do around 15:00' });
    expect(screen.queryByRole('checkbox', { name: 'Lunch call' })).not.toBeInTheDocument();
    fireEvent.click(pill);
    expect(screen.getByRole('checkbox', { name: 'Lunch call' })).toBeInTheDocument();
  });

  it('gives stacked all-day to-do rows a 44px height so their hit areas never overlap', async () => {
    await addTodo('First chore', today);
    await addTodo('Second chore', today);
    render(<CalendarScreen paneWidth="split" />);
    fireEvent.click(screen.getByRole('button', { name: 'D' }));

    const strip = await screen.findByRole('group', { name: 'All day' });
    const first = within(strip).getByRole('checkbox', { name: 'First chore' });
    const second = within(strip).getByRole('checkbox', { name: 'Second chore' });
    expect(first.parentElement).toHaveClass('min-h-11');
    expect(second.parentElement).toHaveClass('min-h-11');

    fireEvent.click(second);
    await waitFor(async () => expect(await checkedInStore('Second chore')).toBe(true));
    expect(await checkedInStore('First chore')).toBe(false);
  });

  it('does not reload to-dos when another day inside the month is picked', async () => {
    await addTodo(chipText, today);
    render(<CalendarScreen />);
    await screen.findByText(chipText);
    const calls = vi.mocked(listTodosInRange).mock.calls.length;

    const days = screen.getAllByRole('button', { name: /^\d+$/ });
    fireEvent.click(days[days.length - 1]!);
    fireEvent.click(days[0]!);
    expect(vi.mocked(listTodosInRange).mock.calls.length).toBe(calls);
  });
});

describe('CalendarScreen compact week docks', () => {
  beforeEach(async () => {
    await openScope(`test-${Math.random().toString(36).slice(2)}`);
    await saveEvent({
      title: 'Standup',
      start: todoInstant(today, '10:15'),
      end: todoInstant(today, '10:45'),
    });
  });

  it('folds a free to-do into the event dock of its hour as one pill', async () => {
    window.innerWidth = 375;
    await addTodo('During one', today, { time: '10:20' });
    await addTodo('Free one', today, { time: '10:50' });
    render(<CalendarScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));

    const pill = await screen.findByRole('button', { name: '2 to-dos during Standup' });
    expect(pill).toHaveTextContent('2');
    expect(screen.queryByRole('button', { name: /around 10:00/ })).not.toBeInTheDocument();
    fireEvent.click(pill);
    expect(screen.getByText('During Standup')).toBeInTheDocument();
    expect(screen.getByText('Around 10:00')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Free one' })).toBeInTheDocument();
  });

  it('folds a next-hour free to-do into an event dock less than a pill above it', async () => {
    window.innerWidth = 375;
    await saveEvent({ title: 'Late sync', start: todoInstant(today, '10:45'), end: todoInstant(today, '11:15') });
    await addTodo('During late', today, { time: '10:50' });
    await addTodo('Next hour', today, { time: '11:20' });
    render(<CalendarScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));

    expect(await screen.findByRole('button', { name: '2 to-dos during Late sync' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /around 11:00/ })).not.toBeInTheDocument();
  });
});
