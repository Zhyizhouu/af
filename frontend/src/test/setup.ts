import '@testing-library/jest-dom/vitest';
// jsdom ships no IndexedDB, and Dexie is the local store — without this every
// component that reads or writes a row throws on mount.
import 'fake-indexeddb/auto';

// jsdom has no crypto.randomUUID and no scrollTo on elements. Both are used by
// code under test, so they are stubbed rather than worked around in the code —
// production should not carry shims for a test environment.
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: () => `test-${Math.random().toString(36).slice(2)}-uuid`,
    configurable: true,
  });
}

Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {});
