import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { db, openScope } from '../../data/db';
import { todoInstant } from '../../data/overlap';
import { createPage } from '../tasks/store';
import { dayFromKey, jakartaDayKey, keyFromDay } from '../habits/time';
import { addTodo, listTodosForDay, listTodosInRange, toggleTodo } from './store';
import { TodoScreen } from './TodoScreen';

vi.mock('../../app/session', () => ({
  useSession: () => ({ revision: 0, requestSync: () => {} }),
}));

vi.mock('./store', async (original) => {
  const actual = await original<typeof import('./store')>();
  return {
    ...actual,
    listTodosInRange: vi.fn(actual.listTodosInRange),
    toggleTodo: vi.fn(actual.toggleTodo),
  };
});

const shift = (key: string, count: number) => {
  const day = dayFromKey(key);
  day.setUTCDate(day.getUTCDate() + count);
  return keyFromDay(day);
};

const monday = shift(jakartaDayKey(), -((dayFromKey(jakartaDayKey()).getUTCDay() + 6) % 7));
const sunday = shift(monday, 6);
const longText = 'Draft the quarterly planning memo and circulate it to every team lead before the Thursday review';

const longFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

beforeEach(async () => {
  await openScope(`test-${Math.random().toString(36).slice(2)}`);
  await addTodo(longText, monday);
  await addTodo('Old errand', sunday);
  const [archived] = await listTodosForDay(sunday);
  await toggleTodo(archived!.id);
});

async function openWeek() {
  render(<TodoScreen />);
  fireEvent.click(screen.getByRole('button', { name: 'Week' }));
  return screen.findByText(longText);
}

describe('TodoScreen week view', () => {
  it('renders seven day rows with a button to open each day', async () => {
    await openWeek();
    expect(screen.getAllByRole('button', { name: /^Open (?!day$)/ })).toHaveLength(7);
  });

  it('shows a long item in full', async () => {
    const text = await openWeek();
    expect(text.textContent).toBe(longText);
  });

  it('shows Nothing open. for a day without open items', async () => {
    await openWeek();
    expect(screen.getAllByText('Nothing open.').length).toBeGreaterThanOrEqual(5);
  });

  it('shows the archived count for a day with a checked item', async () => {
    await openWeek();
    expect(await screen.findByText('1 archived')).toBeInTheDocument();
  });

  it('opens the Day view for the clicked date', async () => {
    await openWeek();
    fireEvent.click(screen.getByRole('button', { name: `Open ${longFormat.format(dayFromKey(monday))}` }));
    expect(await screen.findByLabelText('Day')).toHaveValue(monday);
    expect(screen.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('list')).getByText(longText)).toBeInTheDocument();
  });
});

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
    this.isPrimary = init.isPrimary ?? true;
  }
}

describe('TodoScreen reload', () => {
  it('ignores a slower response for an earlier range that resolves after the latest one', async () => {
    const today = jakartaDayKey();
    await addTodo('Item for today', today);
    await addTodo('Item for tomorrow', shift(today, 1));
    const real = vi.mocked(listTodosInRange).getMockImplementation()!;
    render(<TodoScreen />);
    await screen.findByText('Item for today');

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.mocked(listTodosInRange).mockImplementationOnce(async (from, to) => {
      const rows = await real(from, to);
      await gate;
      return rows;
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(screen.getByText('Item for today')).toBeInTheDocument();

    release();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(screen.getByText('Item for today')).toBeInTheDocument();
    expect(screen.queryByText('Item for tomorrow')).toBeNull();
  });
});

describe('TodoScreen drag and move', () => {
  const today = jakartaDayKey();
  const tomorrow = shift(today, 1);
  const textsOn = async (key: string) =>
    (await listTodosForDay(key)).filter((item) => !item.checked).map((item) => item.text);
  const rowOf = (text: string) => screen.getByText(text).closest('li')!;

  beforeEach(async () => {
    await addTodo('First', today);
    await addTodo('Second', today);
  });

  it('moves a focused row with Alt+Arrow keys', async () => {
    render(<TodoScreen />);
    await screen.findByText('First');
    const open = () =>
      within(screen.getByRole('list'))
        .getAllByRole('listitem')
        .map((li) => within(li).getByRole('checkbox').getAttribute('aria-label'));
    expect(open()).toEqual(['First', 'Second']);

    fireEvent.keyDown(rowOf('First'), { key: 'ArrowDown', altKey: true });
    await waitFor(() => expect(open()).toEqual(['Second', 'First']));

    fireEvent.keyDown(rowOf('Second'), { key: 'ArrowRight', altKey: true });
    await waitFor(() => expect(screen.queryByText('Second')).not.toBeInTheDocument());
    expect(await textsOn(tomorrow)).toEqual(['Second']);
    expect(await textsOn(today)).toEqual(['First']);
  });

  it('ignores Alt+Arrow keys pressed inside a control of the row', async () => {
    render(<TodoScreen />);
    await screen.findByText('First');
    fireEvent.keyDown(screen.getByRole('checkbox', { name: 'First' }), { key: 'ArrowRight', altKey: true });
    expect(await textsOn(tomorrow)).toEqual([]);
  });

  it('drops a dragged row onto another day in the Week view', async () => {
    vi.stubGlobal('PointerEvent', TestPointerEvent);

    render(<TodoScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    await screen.findByText('First');
    const destination = today === monday ? shift(monday, 1) : monday;
    const target = document.querySelector<HTMLElement>(`[data-todo-day="${destination}"]`)!;
    const elementFromPoint = vi.fn(() => target);
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: elementFromPoint });

    const row = rowOf('First');
    fireEvent.pointerDown(row, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerMove(window, { clientX: 12, clientY: 11 });
    expect(document.querySelector('.cursor-grabbing')).toBeNull();
    fireEvent.pointerMove(window, { clientX: 40, clientY: 60 });
    expect(document.querySelector('.cursor-grabbing')).not.toBeNull();
    fireEvent.pointerUp(window, { clientX: 40, clientY: 60 });

    await waitFor(async () =>
      expect((await db().todoItems.toArray()).find((item) => item.text === 'First')!.day).toBe(destination),
    );
    expect(elementFromPoint).toHaveBeenCalled();
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
    vi.unstubAllGlobals();
  });

  it('suppresses text selection on a mouse press of the row but not of its checkbox', async () => {
    vi.stubGlobal('PointerEvent', TestPointerEvent);
    render(<TodoScreen />);
    await screen.findByText('First');
    const row = rowOf('First');
    expect(fireEvent.pointerDown(row, { clientX: 10, clientY: 10, button: 0, pointerType: 'mouse' })).toBe(false);
    expect(row).toHaveFocus();
    const box = screen.getByRole('checkbox', { name: 'First' });
    expect(fireEvent.pointerDown(box, { clientX: 10, clientY: 10, button: 0, pointerType: 'mouse' })).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe('TodoScreen times', () => {
  const today = jakartaDayKey();
  const rowOf = (text: string) => screen.getByText(text).closest('li')!;
  const order = () =>
    within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map((li) => within(li).getByRole('checkbox').getAttribute('aria-label'));

  it('adds a timed to-do and lists timed rows before Any time rows', async () => {
    await addTodo('Buy paper', today);
    render(<TodoScreen />);
    await screen.findByText('Buy paper');

    fireEvent.change(screen.getByPlaceholderText('Add an item…'), { target: { value: 'Call Rina' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '16:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('16:30')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Add an item…')).toHaveValue('');
    expect(screen.getByLabelText('Time')).toHaveValue('');
    expect(order()).toEqual(['Call Rina', 'Buy paper']);
    expect(within(rowOf('Buy paper')).getByText('Any time')).toBeInTheDocument();
  });

  it('changes a time from the row and re-orders', async () => {
    await addTodo('Buy paper', today);
    await addTodo('Call Rina', today, { time: '09:00' });
    render(<TodoScreen />);
    await screen.findByText('Buy paper');
    expect(order()).toEqual(['Call Rina', 'Buy paper']);

    fireEvent.click(within(rowOf('Buy paper')).getByRole('button', { name: 'Set time for Buy paper' }));
    const input = within(rowOf('Buy paper')).getByLabelText('Time');
    fireEvent.change(input, { target: { value: '08:00' } });
    fireEvent.blur(input);

    await waitFor(() => expect(order()).toEqual(['Buy paper', 'Call Rina']));
    expect(within(rowOf('Buy paper')).getByRole('button', { name: '08:00 for Buy paper' })).toHaveTextContent('08:00');
    const stored = (await listTodosForDay(today)).find((item) => item.text === 'Buy paper');
    expect(stored?.time).toBe('08:00');
  });

  describe('editing a time in place', () => {
    const edit = async (typed: string, validity?: Partial<ValidityState>) => {
      await addTodo('Buy paper', today, { time: '09:30' });
      render(<TodoScreen />);
      await screen.findByText('Buy paper');
      fireEvent.click(within(rowOf('Buy paper')).getByRole('button', { name: '09:30 for Buy paper' }));
      const input = within(rowOf('Buy paper')).getByLabelText('Time');
      if (validity) Object.defineProperty(input, 'validity', { value: validity, configurable: true });
      fireEvent.change(input, { target: { value: typed } });
      fireEvent.blur(input);
    };
    const storedTime = async () => (await listTodosForDay(today)).find((item) => item.text === 'Buy paper')?.time;

    it('keeps the time when a half-typed value blurs', async () => {
      await edit('', { badInput: true, valid: false });
      expect(await within(rowOf('Buy paper')).findByRole('button', { name: '09:30 for Buy paper' })).toBeInTheDocument();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      expect(await storedTime()).toBe('09:30');
    });

    it('clears the time when a valid field is explicitly emptied', async () => {
      await edit('');
      await waitFor(async () => expect(await storedTime()).toBeNull());
      expect(await within(rowOf('Buy paper')).findByRole('button', { name: 'Set time for Buy paper' })).toBeInTheDocument();
    });
  });

  it('shows the task, its mark and its place for a linked to-do', async () => {
    const page = await createPage('Prepare lab');
    await addTodo('Draft', today, { taskId: page.id, time: '08:00' });
    await addTodo('Review', today, { taskId: page.id, time: '09:00' });
    await addTodo('Print', today, { taskId: page.id, time: '10:00' });
    await addTodo('Standalone', today);
    render(<TodoScreen />);
    await screen.findByText('Review');
    await waitFor(() => expect(within(rowOf('Review')).getByText('2/3')).toBeInTheDocument());

    expect(within(rowOf('Review')).getByText('◆')).toBeInTheDocument();
    expect(within(rowOf('Review')).getByText('Prepare lab')).toBeInTheDocument();
    expect(within(rowOf('Standalone')).queryByText('◆')).toBeNull();
  });

  describe('clashes', () => {
    beforeEach(async () => {
      const now = Date.now();
      await db().calendarEvents.put({
        id: 'event-1',
        title: 'Lab meeting',
        notes: '',
        start: todoInstant(today, '10:00').getTime(),
        end: todoInstant(today, '12:00').getTime(),
        allDay: false,
        category: '',
        createdAt: now,
        updatedAt: now,
        deleted: false,
        reminderMinutes: 0,
      });
      await addTodo('Review', today, { time: '10:00' });
    });

    it('groups a clashing to-do with its event on a wide pane', async () => {
      window.innerWidth = 1024;
      render(<TodoScreen paneWidth="full" />);
      expect(await screen.findByText('2 at once')).toBeInTheDocument();
      expect(screen.getByText('until 12:00')).toBeInTheDocument();
      expect(screen.getByText('Lab meeting')).toBeInTheDocument();
      expect(screen.queryByText(/^during /)).toBeNull();
    });

    it('marks the to-do with a during chip on a narrow pane', async () => {
      window.innerWidth = 1024;
      render(<TodoScreen paneWidth="split" />);
      expect(await screen.findByText('during Lab meeting')).toBeInTheDocument();
      expect(screen.queryByText('2 at once')).toBeNull();
    });
  });
});

describe('TodoScreen failed writes', () => {
  it('shows an alert when a toggle rejects and clears it on typing', async () => {
    await addTodo('Fragile item', jakartaDayKey());
    render(<TodoScreen />);
    const box = await screen.findByRole('checkbox', { name: 'Fragile item' });

    vi.mocked(toggleTodo).mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(box);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save, try again');

    fireEvent.change(screen.getByPlaceholderText('Add an item…'), { target: { value: 'x' } });
    fireEvent.input(screen.getByPlaceholderText('Add an item…'));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
