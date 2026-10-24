import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { openScope } from '../../data/db';
import { createPage, listPages, savePageValue, seedDefaultProperties } from './store';
import { TasksScreen } from './TasksScreen';

vi.mock('../../app/session', () => ({
  useSession: () => ({ revision: 0, requestSync: () => {} }),
}));

const status = 'seed:status';
const priority = 'seed:priority';
const notStarted = 'seed:status:not-started';
const progress = 'seed:status:in-progress';
const qualityCheck = 'seed:status:in-correction';
const done = 'seed:status:done';
const high = 'seed:priority:high';
const medium = 'seed:priority:medium';

beforeEach(async () => {
  localStorage.clear();
  await openScope(`test-${Math.random().toString(36).slice(2)}`);
  await seedDefaultProperties();
});

const placed = async (title: string, priorityId: string, statusId: string) => {
  const page = await createPage(title);
  await savePageValue(page.id, priority, priorityId);
  await savePageValue(page.id, status, statusId);
};

const statusOf = async (title: string) => (await listPages()).find((page) => page.title === title)?.values[status];

const seed = async () => {
  await placed('Beta', medium, notStarted);
  await placed('Gamma', high, notStarted);
  await placed('Alpha', high, progress);
  await placed('Finished', high, done);
};

const bar = async () => {
  render(<TasksScreen />);
  await screen.findByText('Defaults: Not started, Medium');
  return screen.findByLabelText('New page command');
};

const pickGamma = async () => {
  const input = await bar();
  fireEvent.change(input, { target: { value: '/' } });
  await screen.findAllByRole('option');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  await screen.findByRole('button', { name: 'Clear picked task' });
  return input;
};

describe('Command bar find mode', () => {
  it('shows only open pages, most urgent first, filtered by the text after the slash', async () => {
    await seed();
    const input = await bar();
    await screen.findByRole('button', { name: 'Beta' });

    fireEvent.change(input, { target: { value: '/' } });
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.querySelector('.tsk-palette__title')?.textContent)).toEqual([
      'Alpha',
      'Gamma',
      'Beta',
    ]);
    expect(within(options[0]!).getByText('Priority: High')).toHaveClass('sr-only');
    expect(input).toHaveAttribute('role', 'combobox');
    expect(input).toHaveAttribute('aria-expanded', 'true');

    fireEvent.change(input, { target: { value: '/BE' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);

    fireEvent.change(input, { target: { value: '/zzz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No open tasks match')).toBeInTheDocument();
  });

  it('picks with the arrow keys and Enter, then sets Quality Check from >qc', async () => {
    await seed();
    const input = await pickGamma();
    expect(screen.getByText('Gamma', { selector: '.tsk-command__chip span' })).toBeInTheDocument();
    expect(input).toHaveValue('');

    fireEvent.change(input, { target: { value: '>qc' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(async () => expect(await statusOf('Gamma')).toBe(qualityCheck));
    expect(input).toHaveValue('');
  });

  it('advances the status with Tab and goes back with Shift+Tab', async () => {
    await seed();
    const input = await pickGamma();

    fireEvent.keyDown(input, { key: 'Tab' });
    await waitFor(async () => expect(await statusOf('Gamma')).toBe(progress));
    await waitFor(() => expect(screen.getByRole('button', { name: 'In progress' })).toHaveAttribute('aria-current', 'step'));

    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    await waitFor(async () => expect(await statusOf('Gamma')).toBe(notStarted));
  });

  it('sets the status when a step is clicked', async () => {
    await seed();
    await pickGamma();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(async () => expect(await statusOf('Gamma')).toBe(done));
  });

  it('opens the page on Enter with empty text', async () => {
    await seed();
    const input = await pickGamma();

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByRole('button', { name: 'Enter fullscreen' })).toBeInTheDocument();
  });

  it('returns to new mode with empty text on Escape', async () => {
    await seed();
    const input = await pickGamma();
    fireEvent.change(input, { target: { value: '!low' } });

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('button', { name: 'Clear picked task' })).toBeNull();
    expect(input).toHaveValue('');
    expect(screen.getByText('Defaults: Not started, Medium')).toBeInTheDocument();
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

describe('Command bar drag', () => {
  it('sets priority and status when a palette row is dropped on a grid cell', async () => {
    vi.stubGlobal('PointerEvent', TestPointerEvent);
    await seed();
    const input = await bar();
    fireEvent.change(input, { target: { value: '/gam' } });
    const row = await screen.findByRole('option');
    const target = document.querySelector<HTMLElement>(
      `[data-triage-priority="${medium}"][data-triage-status="${progress}"]`,
    )!;
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });

    fireEvent.pointerDown(row, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 80 });
    expect(row).toHaveClass('is-lifted');
    fireEvent.pointerUp(window, { clientX: 40, clientY: 80 });

    await waitFor(async () => {
      const gamma = (await listPages()).find((page) => page.title === 'Gamma');
      expect(gamma?.values).toMatchObject({ [priority]: medium, [status]: progress });
    });
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
    vi.unstubAllGlobals();
  });
});

describe('Command bar tags', () => {
  it('suggests priorities for a bare ! and accepts the first with Tab', async () => {
    const input = await bar();
    fireEvent.change(input, { target: { value: '!' } });

    const suggestions = within(screen.getByRole('listbox', { name: 'Tag suggestions' })).getAllByRole('option');
    expect(suggestions.map((option) => option.textContent)).toEqual(['!high', '!medium', '!low']);

    fireEvent.keyDown(input, { key: 'Tab' });
    expect(input).toHaveValue('!high ');
    expect(screen.queryByRole('listbox', { name: 'Tag suggestions' })).toBeNull();
  });

  it('moves the highlighted suggestion with the arrow keys before accepting', async () => {
    const input = await bar();
    fireEvent.change(input, { target: { value: 'Task >' } });

    fireEvent.keyDown(input, { key: 'ArrowRight' });
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    fireEvent.keyDown(input, { key: 'Tab' });

    expect(input).toHaveValue('Task >qc ');
  });

  it('lists readable tags in the help line and initials only for Title Case labels', async () => {
    await bar();
    const help = document.querySelector('.tsk-command__help') as HTMLElement;
    expect(Array.from(help.querySelectorAll('code')).map((code) => code.textContent)).toEqual([
      '!high',
      '!medium',
      '!low',
      '>started',
      '>progress',
      '>qc',
      '>done',
    ]);
  });

  it('highlights a recognised tag in the overlay and leaves an unknown one plain', async () => {
    const input = await bar();
    const mirror = document.querySelector('.tsk-command__mirror') as HTMLElement;

    fireEvent.change(input, { target: { value: 'Fix !high !zzz' } });

    const tags = Array.from(mirror.querySelectorAll('.tsk-command__tag'));
    expect(tags.map((tag) => tag.textContent)).toEqual(['!high']);
    expect(mirror.textContent).toBe('Fix !high !zzz');
  });

  it('keeps the overlay scrolled with the input', async () => {
    const input = await bar();
    const mirror = document.querySelector('.tsk-command__mirror') as HTMLElement;
    fireEvent.change(input, { target: { value: 'a long title '.repeat(20) } });

    input.scrollLeft = 120;
    fireEvent.scroll(input);

    expect(mirror.scrollLeft).toBe(120);
  });
});
