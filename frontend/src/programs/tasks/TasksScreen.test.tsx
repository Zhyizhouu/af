import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db, openScope } from '../../data/db';
import { TasksWidget } from '../dashboard/widgets/TasksWidget';
import { createPage, fillTaskDefaults, listPages, savePageValue, seedDefaultProperties } from './store';
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

  it('refocuses the grid chip, not the palette row, after Alt+ArrowRight while the palette is open', async () => {
    await placed('Key me', high, notStarted);
    render(<TasksScreen />);
    const input = await screen.findByLabelText('New page command');
    fireEvent.change(input, { target: { value: '/' } });
    const row = await screen.findByRole('option');
    expect(row).toHaveAttribute('data-triage-palette-id');
    expect(row).not.toHaveAttribute('data-triage-id');
    const chip = screen.getByRole('button', { name: 'Key me' });

    fireEvent.keyDown(chip, { key: 'ArrowRight', altKey: true });

    await waitFor(async () => expect(await valuesOf('Key me')).toMatchObject({ [status]: progress }));
    await waitFor(() => {
      const focused = screen.getByRole('button', { name: 'Key me' });
      expect(focused).toHaveFocus();
      expect(focused).toHaveAttribute('data-triage-id');
    });
    expect(screen.getByRole('option')).not.toHaveFocus();
  });
});

describe('Console view unset row and column', () => {
  beforeEach(fillTaskDefaults);

  const cellOf = (priorityId: string, statusId: string) =>
    document.querySelector<HTMLElement>(`[data-triage-priority="${priorityId}"][data-triage-status="${statusId}"]`)!;

  const orphaned = async (title: string) => {
    const page = await createPage(title);
    await savePageValue(page.id, priority, 'seed:priority:gone');
    return page;
  };

  it('shows no Unset row or column while every page has real values', async () => {
    await createPage('Fine');
    render(<TasksScreen />);
    await screen.findByRole('button', { name: 'Fine' });
    expect(screen.queryByRole('rowheader', { name: 'Unset' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Unset' })).toBeNull();
  });

  it('shows a page with an orphaned priority in the Unset row', async () => {
    await orphaned('Lost');
    render(<TasksScreen />);
    const chip = await screen.findByRole('button', { name: 'Lost' });
    const row = chip.closest('tr') as HTMLElement;
    expect(within(row).getByRole('rowheader')).toHaveTextContent('Unset');
    expect(chip.closest('td')).toHaveClass('is-unset');
    expect(screen.queryByRole('columnheader', { name: 'Unset' })).toBeNull();
  });

  it('shows a page with a cleared status in the Unset column', async () => {
    const page = await createPage('Blank');
    await savePageValue(page.id, status, null);
    render(<TasksScreen />);
    const chip = await screen.findByRole('button', { name: 'Blank' });
    const row = chip.closest('tr') as HTMLElement;
    const column = Array.from(row.children).indexOf(chip.closest('td') as HTMLElement);
    const headers = screen.getAllByRole('columnheader');
    expect(headers[headers.length - 1]).toHaveTextContent('Unset');
    expect(headers[column - 1]).toHaveTextContent('Unset');
  });

  it('sets the value when a page is dragged from the Unset row to a real cell', async () => {
    vi.stubGlobal('PointerEvent', TestPointerEvent);
    await orphaned('Lost');
    render(<TasksScreen />);
    const chip = await screen.findByRole('button', { name: 'Lost' });
    const target = cellOf(medium, notStarted);
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });

    fireEvent.pointerDown(chip, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 60 });
    fireEvent.pointerUp(window, { clientX: 40, clientY: 60 });

    await waitFor(async () => expect(await valuesOf('Lost')).toMatchObject({ [priority]: medium, [status]: notStarted }));
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
    vi.unstubAllGlobals();
  });

  it('does not accept a drop into an Unset cell', async () => {
    vi.stubGlobal('PointerEvent', TestPointerEvent);
    await orphaned('Lost');
    const page = await createPage('Mover');
    await savePageValue(page.id, priority, high);
    render(<TasksScreen />);
    const chip = await screen.findByRole('button', { name: 'Mover' });
    const target = document.querySelector<HTMLElement>('.tsk-grid__cell.is-unset')!;
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });

    fireEvent.pointerDown(chip, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 60 });
    expect(target).not.toHaveClass('is-over');
    fireEvent.pointerUp(window, { clientX: 40, clientY: 60 });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await valuesOf('Mover')).toMatchObject({ [priority]: high, [status]: notStarted });
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
    vi.unstubAllGlobals();
  });
});

describe('Filter', () => {
  const untickDone = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Filter' }));
    const dialog = await screen.findByRole('dialog');
    const box = within(dialog).getByRole('checkbox', { name: 'Done' });
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(box).not.toBeChecked();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  };

  const seedPair = async () => {
    const finished = await createPage('Finished');
    await savePageValue(finished.id, status, done);
    await createPage('Waiting');
  };

  it('drops the unticked status from the grid rows and columns', async () => {
    await seedPair();
    render(<TasksScreen />);
    await screen.findByRole('button', { name: 'Finished' });
    expect(screen.getByRole('columnheader', { name: 'Done' })).toBeInTheDocument();

    await untickDone();

    expect(screen.queryByRole('button', { name: 'Finished' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Waiting' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Done' })).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Not started' })).toBeInTheDocument();
  });

  it('keeps the filter after the screen is rendered again', async () => {
    await seedPair();
    const first = render(<TasksScreen />);
    await screen.findByRole('button', { name: 'Finished' });
    await untickDone();
    first.unmount();

    render(<TasksScreen />);
    expect(await screen.findByRole('button', { name: 'Waiting' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finished' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Done' })).toBeNull();
  });

  it('hides unticked pages in the Table view too', async () => {
    localStorage.setItem('af.tasks.view', 'table');
    await seedPair();
    render(<TasksScreen />);
    await screen.findByText('Finished');

    await untickDone();

    expect(screen.queryByText('Finished')).toBeNull();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
  });

  it('removes a page moved to an unticked status after the reload', async () => {
    await seedPair();
    render(<TasksScreen />);
    await screen.findByRole('button', { name: 'Waiting' });
    await untickDone();

    fireEvent.click(screen.getByRole('button', { name: 'Waiting' }));
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Done' }));

    await waitFor(async () => expect((await valuesOf('Waiting'))?.[status]).toBe(done));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Waiting' })).toBeNull());
  });

  it('falls back to no filters when the stored value is malformed', async () => {
    localStorage.setItem(`af.tasks.filters:${db().name}`, '{not json');
    await seedPair();
    render(<TasksScreen />);
    expect(await screen.findByRole('button', { name: 'Finished' })).toBeInTheDocument();
  });

  it('ignores a saved clause whose property no longer exists', async () => {
    localStorage.setItem(
      `af.tasks.filters:${db().name}`,
      JSON.stringify([{ kind: 'contains', propertyId: 'gone:property', text: 'zzz' }]),
    );
    await seedPair();
    render(<TasksScreen />);
    expect(await screen.findByRole('button', { name: 'Finished' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Waiting' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
  });

  it('keeps saved filters separate per account', async () => {
    await seedPair();
    const first = render(<TasksScreen />);
    await screen.findByRole('button', { name: 'Finished' });
    await untickDone();
    first.unmount();

    await openScope(`other-${Math.random()}`);
    await seedDefaultProperties();
    const finished = await createPage('Finished');
    await savePageValue(finished.id, status, done);
    render(<TasksScreen />);
    expect(await screen.findByRole('button', { name: 'Finished' })).toBeInTheDocument();
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
