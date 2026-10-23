import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useSession } from '../../app/session';
import { readAgenda, type AgendaEntry } from '../../data/agenda';

const AgendaContext = createContext<AgendaEntry[] | null>(null);

/**
 * Loads the merged agenda once per sync revision for every widget under it,
 * so the dashboard's agenda widgets share one read instead of each scanning
 * the same four tables.
 */
export function AgendaProvider({ children }: { children: ReactNode }) {
  const { revision } = useSession();
  const [entries, setEntries] = useState<AgendaEntry[]>([]);

  useEffect(() => {
    let current = true;
    void readAgenda().then((next) => {
      if (current) setEntries(next);
    });
    return () => {
      current = false;
    };
  }, [revision]);

  return <AgendaContext value={entries}>{children}</AgendaContext>;
}

export function useAgenda(): AgendaEntry[] {
  const entries = useContext(AgendaContext);
  if (!entries) throw new Error('useAgenda must be used inside an AgendaProvider');
  return entries;
}
