import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { openScope } from '../../data/db';
import { TasksWidget } from '../dashboard/widgets/TasksWidget';
import { createPage, listPages, savePageValue, seedDefaultProperties } from './store';
import { TasksScreen } from './TasksScreen';

vi.mock('../../app/session', () => ({
  useSession: () => ({ revision: 0, requestSync: () => {} }),
}));

const status = 'seed:status';
const priority = 'seed:priority';
const progress = 'seed:status:in-progress';
const qualityCheck = 'seed:status:in-correction';
const done = 'seed:status:done';
const notStarted = 'seed:status:not-started';
const high = 'seed:priority:high';
const medium = 'seed:priority:medium';

beforeEach(async () => {
  localStorage.clear();
  await openScope(`test-${Math.random().toString(36).slice(2)}`);
  await seedDefaultProperties();
});

const valuesOf = async (title: string) => (await listPages()).find((page) => page.title === title)?.values;

describe('Console view', () => {
  it('creates a page from a typed command with its parsed status and priority', async () => {
    render(<TasksScreen />);
    const input = await screen.findByLabelText('New page command');
    expect(await screen.findByText('Defaults: Not started, Medium')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Write notes !high >qc' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(async () => {
      expect(await valuesOf('Write notes')).toMatchObject({ [status]: qualityCheck, [priority]: high });
    });
    expect(input).toHaveValue('');
  });

  it('shows a hint and creates nothing for an empty title', async () => {
    render(<TasksScreen />);
    const input = await screen.findByLabelText('New page command');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('Type a title first')).toBeInTheDocument();
    expect(await listPages()).toHaveLength(0);
  });

  it('places a page in its priority row and status column', async () => {
    const page = await createPage('Alpha');
    await savePageValue(page.id, status, progress);
    await savePageValue(page.id, priority, high);
    render(<TasksScreen />);

    const chip = await screen.findByRole('button', { name: 'Alpha' });
    const row = chip.closest('tr') as HTMLElement;
    const cell = chip.closest('td') as HTMLElement;
    expect(within(row).getByRole('rowheader')).toHaveTextContent('High');
    const column = Array.from(row.children).indexOf(cell);
    expect(screen.getAllByRole('columnheader')[column - 1]).toHaveTextContent('In progress');
  });

  it('draws no priority bars on this page while the dashboard widget keeps them', async () => {
    const page = await createPage('Bars');
    await savePageValue(page.id, priority, high);
    const { container, unmount } = render(<TasksScreen />);
    await screen.findByRole('button', { name: 'Bars' });
    fireEvent.click(screen.getByRole('button', { name: 'Bars' }));
    await screen.findByRole('menu');
    expect(container.querySelector('.tsk-flag__bars')).toBeNull();
    expect(document.querySelector('.tsk-flag__bars')).toBeNull();
    unmount();

    const widget = render(
      <MemoryRouter>
        <TasksWidget />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Bars' });
    expect(widget.container.querySelector('.tsk-flag__bars')).not.toBeNull();
  });

  it('glows a chip by priority and mutes a Done chip', async () => {
    await createPage('Hot').then((page) => savePageValue(page.id, priority, high));
    const finished = await createPage('Finished');
    await savePageValue(finished.id, priority, medium);
    await savePageValue(finished.id, status, done);
    render(<TasksScreen />);

    expect(await screen.findByRole('button', { name: 'Hot' })).toHaveClass('is-glow-high');
    const chip = screen.getByRole('button', { name: 'Finished' });
    expect(chip).toHaveClass('is-done');
    expect(chip).toHaveClass('is-glow-medium');
    expect(chip).toHaveAttribute('data-page-id', finished.id);
  });

  it('shakes the bar when Enter is pressed with an empty title', async () => {
    render(<TasksScreen />);
    const input = await screen.findByLabelText('New page command');
    const bar = input.closest('.tsk-command') as HTMLElement;
    expect(bar).not.toHaveClass('is-shaking');

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(bar).toHaveClass('is-shaking');
    await waitFor(() => expect(bar).not.toHaveClass('is-shaking'));
  });

  it('confirms with Added after a page is created', async () => {
    render(<TasksScreen />);
    const input = await screen.findByLabelText('New page command');
    await screen.findByText('Defaults: Not started, Medium');

    fireEvent.change(input, { target: { value: 'Brand new !high' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText('Added')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Brand new' })).toHaveClass('is-glow-high');
    await waitFor(() => expect(screen.queryByText('Added')).toBeNull(), { timeout: 2000 });
  });

  it('moves a page when Done is picked from its chip menu', async () => {
    const page = await createPage('Beta');
    await savePageValue(page.id, priority, high);
    render(<TasksScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Beta' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Open page' })).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Done' }));

    await waitFor(async () => expect((await valuesOf('Beta'))?.[status]).toBe(done));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
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

describe('Console view drag and move', () => {
  const cellOf = (priorityId: string, statusId: string) =>
    document.querySelector<HTMLElement>(`[data-triage-priority="${priorityId}"][data-triage-status="${statusId}"]`)!;

  const placed = async (title: string, priorityId: string, statusId: string) => {
    const page = await createPage(title);
    await savePageValue(page.id, priority, priorityId);
    await savePageValue(page.id, status, statusId);
  };

  it('sets priority and status when a chip is dragged onto another cell', async () => {
    vi.stubGlobal('PointerEvent', TestPointerEvent);
    await placed('Drag me', high, notStarted);
    render(<TasksScreen />);
    const chip = await screen.findByRole('button', { name: 'Drag me' });
    const target = cellOf(medium, progress);
    const elementFromPoint = vi.fn(() => target);
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: elementFromPoint });

    fireEvent.pointerDown(chip, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 60 });
    expect(chip).toHaveClass('is-lifted');
    expect(target).toHaveClass('is-over');
    fireEvent.pointerUp(window, { clientX: 40, clientY: 60 });

    await waitFor(async () => expect(await valuesOf('Drag me')).toMatchObject({ [priority]: medium, [status]: progress }));
    expect(elementFromPoint).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
    vi.unstubAllGlobals();
  });

  it('treats a 2px move then release as a click that opens the menu', async () => {
    vi.stubGlobal('PointerEvent', TestPointerEvent);
    await placed('Tap me', high, notStarted);
    render(<TasksScreen />);
    const chip = await screen.findByRole('button', { name: 'Tap me' });
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => cellOf(medium, progress) });

    fireEvent.pointerDown(chip, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerMove(window, { clientX: 12, clientY: 11 });
    expect(chip).not.toHaveClass('is-lifted');
    fireEvent.pointerUp(window, { clientX: 12, clientY: 11 });
    fireEvent.click(chip);

    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(await valuesOf('Tap me')).toMatchObject({ [priority]: high, [status]: notStarted });
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
    vi.unstubAllGlobals();
  });

  it('moves a focused chip one status to the right with Alt+ArrowRight', async () => {
    await placed('Key me', high, notStarted);
    render(<TasksScreen />);
    const chip = await screen.findByRole('button', { name: 'Key me' });

    fireEvent.keyDown(chip, { key: 'ArrowRight', altKey: true });

    await waitFor(async () => expect(await valuesOf('Key me')).toMatchObject({ [priority]: high, [status]: progress }));
  });
});

describe('Table view', () => {
  it('changes a status from its cell menu', async () => {
    localStorage.setItem('af.tasks.view', 'table');
    await createPage('Gamma');
    render(<TasksScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Status: Not started' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Open page' })).toBeNull();
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'In progress' }));

    await waitFor(async () => expect((await valuesOf('Gamma'))?.[status]).toBe(progress));
  });

  it('closes the menu on Escape', async () => {
    localStorage.setItem('af.tasks.view', 'table');
    await createPage('Delta');
    render(<TasksScreen />);

    const trigger = await screen.findByRole('button', { name: 'Priority: Medium' });
    fireEvent.click(trigger);
    const menu = await screen.findByRole('menu');
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
