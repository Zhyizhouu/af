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
import { db, defaultSettings, localScope, openScope, type SettingsRow } from '../data/db';
import { syncAll } from '../data/sync';
import { isAdmin, signOutNow, watchAuth, type User } from '../data/firebase';

export type SyncStatus = 'signedOut' | 'idle' | 'syncing' | 'synced' | 'failed';

/** Stamps `data-theme`/`data-font` on the root element so `tokens.css`'s
 *  attribute selectors take over from the `prefers-color-scheme` fallback
 *  that only covers first paint before anyone has signed in. */
function applySettings(settings: SettingsRow) {
  const root = document.documentElement;
  if (settings.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = settings.theme;

  if (settings.font === 'default') delete root.dataset.font;
  else root.dataset.font = settings.font;
}

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
  /** This account's preferences — theme, font, dashboard widget layout. */
  settings: SettingsRow;
  updateSettings: (patch: Partial<Omit<SettingsRow, 'id'>>) => Promise<void>;
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
  const [settings, setSettings] = useState<SettingsRow>(defaultSettings());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('signedOut');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const uid = useRef<string | null>(null);

  /** Reads the local settings row (seeding the default if this is the first
   *  time) and applies it — called after sign-in and after every sync, since
   *  a sync can pull a change made on another device. */
  const loadSettings = useCallback(async () => {
    const existing = await db().settings.get('app');
    const next = existing ?? defaultSettings();
    if (!existing) await db().settings.put(next);
    setSettings(next);
    applySettings(next);
  }, []);

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
      await loadSettings();
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
  }, [loadSettings]);

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
        await loadSettings();
        setReady(true);
        setRevision((n) => n + 1);
        if (next) await syncNow();
        else setSyncStatus('signedOut');
      })();
    });
  }, [syncNow, loadSettings]);

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
    },
    [],
  );

  const signOut = useCallback(async () => {
    await signOutNow();
  }, []);

  const updateSettings = useCallback(async (patch: Partial<Omit<SettingsRow, 'id'>>) => {
    const next: SettingsRow = { ...(await db().settings.get('app') ?? defaultSettings()), ...patch, id: 'app', updatedAt: Date.now() };
    await db().settings.put(next);
    setSettings(next);
    applySettings(next);
    requestSync();
  }, [requestSync]);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      ready,
      admin,
      settings,
      updateSettings,
      syncStatus,
      syncError,
      revision,
      requestSync,
      syncNow,
      signOut,
    }),
    [user, ready, admin, settings, updateSettings, syncStatus, syncError, revision, requestSync, syncNow, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession outside a SessionProvider');
  return value;
}
