import { describe, expect, it } from 'vitest';
import { createSyncQueue } from './syncQueue';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('createSyncQueue', () => {
  it('runs exactly one follow-up when requested during a run', async () => {
    const gates = [deferred(), deferred()];
    let runs = 0;
    const queue = createSyncQueue(() => gates[runs++]!.promise);

    const first = queue.request();
    queue.request();
    queue.request();
    expect(runs).toBe(1);

    gates[0]!.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(runs).toBe(2);

    gates[1]!.resolve();
    await first;
    expect(runs).toBe(2);
  });

  it('does not rerun when nothing was requested during the run', async () => {
    let runs = 0;
    const queue = createSyncQueue(async () => {
      runs++;
    });
    await queue.request();
    await queue.request();
    expect(runs).toBe(2);
  });

  it('idle resolves once the running sync and its follow-up are done', async () => {
    const gates = [deferred(), deferred()];
    let runs = 0;
    const queue = createSyncQueue(() => gates[runs++]!.promise);
    queue.request();
    queue.request();

    let idle = false;
    void queue.idle().then(() => {
      idle = true;
    });
    gates[0]!.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(idle).toBe(false);

    gates[1]!.resolve();
    await queue.idle();
    expect(idle).toBe(true);
  });
});
