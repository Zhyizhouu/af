import '@testing-library/jest-dom/vitest';
// jsdom ships no IndexedDB, and Dexie is the local store — without this every
// component that reads or writes a row throws on mount.
import 'fake-indexeddb/auto';

// jsdom has no crypto.randomUUID, no scrollTo on elements and no matchMedia. All are used by
// code under test, so they are stubbed rather than worked around in the code —
// production should not carry shims for a test environment.
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: () => `test-${Math.random().toString(36).slice(2)}-uuid`,
    configurable: true,
  });
}

Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {});

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
