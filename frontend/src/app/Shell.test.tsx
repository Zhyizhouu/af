import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Shell } from './Shell';
import { programs } from './programs';

const syncNow = vi.fn();
const signOut = vi.fn();

// This Node runtime's built-in `localStorage` shadows jsdom's window one and
// stays undefined without an on-disk backing file, which SplitView reads from
// on mount. A tiny in-memory stand-in is enough for a test that never asserts
// on stored ratios.
if (typeof localStorage === 'undefined' || !localStorage) {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  });
}

// This jsdom build has no matchMedia either. useIsMobile (used by the
// sidebar's collapsible="icon" behavior) calls it unconditionally on mount.
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

vi.mock('./session', async () => {
  const actual = await vi.importActual<typeof import('./session')>('./session');
  return {
    ...actual,
    useSession: () => ({
      admin: false,
      settings: { hiddenPrograms: [] },
      user: { email: 'test@example.com', displayName: null },
      syncStatus: 'synced',
      syncError: null,
      syncNow,
      signOut,
    }),
  };
});

vi.mock('./registry', () => ({
  renderProgram: (program: { name: string }) => <div>stub: {program.name}</div>,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:slug" element={<Shell />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Shell', () => {
  it('renders a link for every visible program', () => {
    renderAt('/calendar');
    for (const program of programs) {
      expect(screen.getByRole('link', { name: new RegExp(program.name) })).toBeInTheDocument();
    }
  });

  it('marks the Calendar link as the current page', () => {
    renderAt('/calendar');
    expect(screen.getByRole('link', { name: /Calendar/ })).toHaveAttribute('aria-current', 'page');
  });

  it('shows the primary program name as the heading', () => {
    renderAt('/calendar');
    expect(screen.getByRole('heading', { level: 1, name: 'Calendar' })).toBeInTheDocument();
  });

  it('calls syncNow when the sync badge is clicked', async () => {
    const user = userEvent.setup();
    renderAt('/calendar');
    await user.click(screen.getByRole('button', { name: /Sync status/ }));
    expect(syncNow).toHaveBeenCalled();
  });

  it('shows the recovery button for an unknown slug', () => {
    renderAt('/nope');
    expect(screen.getByRole('button', { name: /is not a program here/ })).toBeInTheDocument();
  });

  describe('first-visit intro', () => {
    beforeEach(() => {
      localStorage.removeItem('af.intro.seen');
    });

    it('renders at /dashboard when the flag is unset and sets the flag', () => {
      renderAt('/dashboard');
      expect(screen.getByRole('dialog', { name: 'Welcome to reAFresh' })).toBeInTheDocument();
      expect(localStorage.getItem('af.intro.seen')).toBe('1');
    });

    it('does not render at /dashboard when the flag is already set', () => {
      localStorage.setItem('af.intro.seen', '1');
      renderAt('/dashboard');
      expect(screen.queryByRole('dialog', { name: 'Welcome to reAFresh' })).not.toBeInTheDocument();
    });

    it('never renders at /calendar', () => {
      renderAt('/calendar');
      expect(screen.queryByRole('dialog', { name: 'Welcome to reAFresh' })).not.toBeInTheDocument();
    });
  });
});
