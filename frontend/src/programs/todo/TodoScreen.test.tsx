import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { db, openScope } from '../../data/db';
import { dayFromKey, jakartaDayKey, keyFromDay } from '../habits/time';
import { addTodo, listTodosForDay, toggleTodo } from './store';
import { TodoScreen } from './TodoScreen';

vi.mock('../../app/session', () => ({
  useSession: () => ({ revision: 0, requestSync: () => {} }),
}));

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
    const open = () => within(screen.getByRole('list')).getAllByRole('listitem').map((li) => li.textContent);
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
