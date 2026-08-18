import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The address the app talks to, and the rules for changing it.
 *
 * This is the one value that, wrong, takes the whole deployed site down — and
 * it is now read from a document a script writes rather than from the bundle.
 * So the interesting cases are all the ways that read can go wrong: a missing
 * document, a half-written field, an unreachable Firestore. None of them may
 * blank out an address the build already had.
 */

let snapshot: { exists: () => boolean; get: (field: string) => unknown } | null = null;
let failWith: Error | null = null;
let hang = false;

vi.mock('./firebase', () => ({ firestore: () => ({}) }));

vi.mock('firebase/firestore', () => ({
  doc: (...path: unknown[]) => ({ path }),
  getDoc: async () => {
    if (hang) return new Promise(() => {}); // never settles
    if (failWith) throw failWith;
    return snapshot;
  },
}));

const load = async () => {
  vi.resetModules();
  return import('./runtimeConfig');
};

const docWith = (value: unknown) => ({
  exists: () => true,
  get: (field: string) => (field === 'convertApi' ? value : undefined),
});

describe('runtime config', () => {
  beforeEach(() => {
    snapshot = null;
    failWith = null;
    hang = false;
  });

  // AF_CONVERT_API is unset under vitest, so the build-time value is empty —
  // which is the state a deployed bundle is in before anyone sets one.
  it('falls back to the build-time value when the document is missing', async () => {
    snapshot = { exists: () => false, get: () => undefined };
    const mod = await load();

    expect(await mod.loadRuntimeConfig()).toBe('');
    expect(mod.convertApiBase()).toBe('');
    expect(mod.runtimeConfigLoaded()).toBe(false);
  });

  it('uses the document when it carries an address', async () => {
    snapshot = docWith('https://tunnel.example.com');
    const mod = await load();

    await mod.loadRuntimeConfig();
    expect(mod.convertApiBase()).toBe('https://tunnel.example.com');
    expect(mod.runtimeConfigLoaded()).toBe(true);
  });

  it('strips a trailing slash, so paths do not double up', async () => {
    snapshot = docWith('https://tunnel.example.com/');
    const mod = await load();

    await mod.loadRuntimeConfig();
    expect(mod.convertApiBase()).toBe('https://tunnel.example.com');
  });

  // A half-written document must not take down a site that was working.
  it('ignores an empty or blank field', async () => {
    for (const value of ['', '   ', null, 42]) {
      snapshot = docWith(value);
      const mod = await load();

      await mod.loadRuntimeConfig();
      expect(mod.convertApiBase()).toBe('');
      expect(mod.runtimeConfigLoaded()).toBe(false);
    }
  });

  it('survives Firestore refusing the read', async () => {
    failWith = new Error('permission denied');
    const mod = await load();

    await expect(mod.loadRuntimeConfig()).resolves.toBe('');
    expect(mod.convertApiBase()).toBe('');
  });

  // A blocked or very slow Firestore must not leave a caller waiting; the
  // fallback is already good enough to render with.
  it('gives up rather than hanging', async () => {
    hang = true;
    const mod = await load();

    await expect(mod.loadRuntimeConfig(20)).resolves.toBe('');
  });
});
