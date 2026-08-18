import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { localScope, openScope } from '../data/db';
import { syncAll } from '../data/sync';
import { isAdmin, signOutNow, watchAuth, type User } from '../data/firebase';

export type SyncStatus = 'signedOut' | 'idle' | 'syncing' | 'synced' | 'failed';

interface SessionValue {
  user: User | null;
  /** False only until Firebase has told us whether anybody is signed in. */
  ready: boolean;
  /**
   * Holds the `admin` custom claim, which unlocks admin-only programs.
   *
   * Defaults to false and stays false on any error. A program wrongly hidden
   * is a puzzle; a program wrongly shown is a button that 403s, so the
   * uncertain direction is the closed one.
   */
  admin: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  /** Bumped whenever a sync pulls something down, so views refetch. */
  revision: number;
  requestSync: () => void;
  syncNow: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Who is signed in, which database is open, and when it last reconciled.
 *
 * Sync is explicit rather than continuous: it runs on sign-in, after local
 * writes (debounced), and on demand. A live Firestore listener would be nicer,
 * but AF is local-first — Dexie stays the source of truth for reads, so there
 * is nothing to stream into.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('signedOut');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const uid = useRef<string | null>(null);

  const syncNow = useCallback(async () => {
    const current = uid.current;
    if (!current) {
      setSyncStatus('signedOut');
      return;
    }
    if (running.current) return;

    running.current = true;
    setSyncStatus('syncing');
    try {
      await syncAll(current);
      setSyncStatus('synced');
      setSyncError(null);
      // Dexie is read through one-shot queries, so anything pulled down is
      // invisible until the views are told to look again.
      setRevision((n) => n + 1);
    } catch (error) {
      setSyncStatus('failed');
      setSyncError(error instanceof Error ? error.message : String(error));
    } finally {
      running.current = false;
    }
  }, []);

  /** Coalesces the burst of writes that a single user action produces. */
  const requestSync = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void syncNow(), 2000);
  }, [syncNow]);

  useEffect(() => {
    return watchAuth((next) => {
      void (async () => {
        uid.current = next?.uid ?? null;
        // Signing out swaps to the local scope rather than deleting anything,
        // so signing back in finds everything where it was.
        await openScope(next?.uid ?? localScope);
        setUser(next);
        // Forced refresh on sign-in: a token minted before the claim was
        // granted still carries the old claims for up to an hour, and "sign out
        // and back in" is the one remedy a user will actually try.
        setAdmin(next ? await isAdmin(true).catch(() => false) : false);
        setReady(true);
        setRevision((n) => n + 1);
        if (next) await syncNow();
        else setSyncStatus('signedOut');
      })();
    });
  }, [syncNow]);

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
    },
    [],
  );

  const signOut = useCallback(async () => {
    await signOutNow();
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ user, ready, admin, syncStatus, syncError, revision, requestSync, syncNow, signOut }),
    [user, ready, admin, syncStatus, syncError, revision, requestSync, syncNow, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession outside a SessionProvider');
  return value;
}
