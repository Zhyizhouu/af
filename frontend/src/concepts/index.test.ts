import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeMediaQueryList {
  matches: boolean;
  media: string;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

function mockMatchMedia(matches: boolean) {
  const listeners: (() => void)[] = [];
  const mql: FakeMediaQueryList = {
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type, listener) => {
      listeners.push(listener);
    },
    removeEventListener: (_type, listener) => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    },
  };
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
  return {
    setMatches(next: boolean) {
      mql.matches = next;
      for (const listener of listeners) listener();
    },
  };
}

function resetLocation(search: string) {
  history.pushState({}, '', `/${search}`);
}

async function load() {
  vi.resetModules();
  return import('./index');
}

describe('concepts', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.concept;
    delete document.documentElement.dataset.phase;
    delete document.documentElement.dataset.program;
    document.head.innerHTML = '';
    resetLocation('');
    try {
      sessionStorage.clear();
    } catch {}
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies console for light', async () => {
    mockMatchMedia(false);
    const mod = await load();
    mod.applyThemeConcept('light');
    expect(document.documentElement.dataset.concept).toBe('console');
  });

  it('applies dawn for dark', async () => {
    mockMatchMedia(false);
    const mod = await load();
    mod.applyThemeConcept('dark');
    expect(document.documentElement.dataset.concept).toBe('dawn');
  });

  it('follows the device for system', async () => {
    const media = mockMatchMedia(true);
    const mod = await load();
    mod.applyThemeConcept('system');
    expect(document.documentElement.dataset.concept).toBe('dawn');

    media.setMatches(false);
    expect(document.documentElement.dataset.concept).toBe('console');

    media.setMatches(true);
    expect(document.documentElement.dataset.concept).toBe('dawn');
  });

  it('leaves an active concept override in place', async () => {
    mockMatchMedia(false);
    resetLocation('?concept=sheet');
    const mod = await load();
    mod.applyConcept();
    expect(document.documentElement.dataset.concept).toBe('sheet');

    mod.applyThemeConcept('light');
    expect(document.documentElement.dataset.concept).toBe('sheet');
  });

  it('injects a concept font link only once per id', async () => {
    mockMatchMedia(false);
    const mod = await load();
    mod.setConcept('console');
    mod.setConcept('console');
    mod.setConcept('console');

    const links = document.head.querySelectorAll('link[rel="stylesheet"]');
    expect(links.length).toBe(1);
  });
});
