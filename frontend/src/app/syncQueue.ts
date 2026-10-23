export interface SyncQueue {
  request: () => Promise<void>;
  idle: () => Promise<void>;
}

export function createSyncQueue(run: () => Promise<void>): SyncQueue {
  let current: Promise<void> | null = null;
  let dirty = false;

  const request = () => {
    if (current) {
      dirty = true;
      return current;
    }
    current = (async () => {
      try {
        do {
          dirty = false;
          await run();
        } while (dirty);
      } finally {
        current = null;
      }
    })();
    return current;
  };

  return { request, idle: () => current ?? Promise.resolve() };
}
