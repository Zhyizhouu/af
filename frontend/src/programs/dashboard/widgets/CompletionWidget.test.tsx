import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompletionWidget } from './CompletionWidget';

if (typeof localStorage === 'undefined' || !localStorage) {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  });
}

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

if (typeof ResizeObserver === 'undefined') {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}

let habits: { id: string; name: string }[] = [{ id: 'h1', name: 'Morning run' }];

function dayKey(offset: number): string {
  const day = new Date(Date.UTC(2026, 8, 26 + offset));
  return day.toISOString().slice(0, 10);
}

function weekCompletion() {
  return Array.from({ length: 7 }, (_, i) => ({
    day: dayKey(i - 6),
    fraction: i === 6 ? 1 : 0,
  }));
}

function monthCompletion() {
  return Array.from({ length: 30 }, (_, i) => ({
    day: dayKey(i - 29),
    fraction: i / 29,
  }));
}

vi.mock('../../../app/session', () => ({
  useSession: () => ({ revision: 0 }),
}));

vi.mock('../../habits/store', () => ({
  listHabits: async () => habits,
  completionOver: async (range: 'week' | 'month') => (range === 'week' ? weekCompletion() : monthCompletion()),
}));

describe('CompletionWidget', () => {
  it('renders the 7 days and 30 days range buttons', async () => {
    habits = [{ id: 'h1', name: 'Morning run' }];
    render(<CompletionWidget />);
    expect(await screen.findByRole('button', { name: '7 days' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30 days' })).toBeInTheDocument();
  });

  it('flips aria-pressed and the chart label when the range is switched', async () => {
    habits = [{ id: 'h1', name: 'Morning run' }];
    const user = userEvent.setup();
    render(<CompletionWidget />);

    const sevenDays = await screen.findByRole('button', { name: '7 days' });
    const thirtyDays = screen.getByRole('button', { name: '30 days' });
    expect(sevenDays).toHaveAttribute('aria-pressed', 'true');
    expect(thirtyDays).toHaveAttribute('aria-pressed', 'false');

    await user.click(thirtyDays);

    expect(sevenDays).toHaveAttribute('aria-pressed', 'false');
    expect(thirtyDays).toHaveAttribute('aria-pressed', 'true');

    const chart = await screen.findByRole('img');
    expect(chart.getAttribute('aria-label')).toContain('30 days');
  });

  it('shows the empty copy and no chart when there are no habits', async () => {
    habits = [];
    render(<CompletionWidget />);
    expect(await screen.findByText('Add a habit and this fills in.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
