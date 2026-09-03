import { useCallback, useEffect, useState } from 'react';
import { AFHint, AFPanel } from '../../../components/AF';
import { useSession } from '../../../app/session';
import { readAgenda, type AgendaEntry } from '../../../data/agenda';
import { listCategories, type EventCategory } from '../../calendar/categories';
import { EntryList } from './shared';

export function UpNextWidget() {
  const { revision } = useSession();
  const [entries, setEntries] = useState<AgendaEntry[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);

  const reload = useCallback(async () => {
    setEntries(await readAgenda());
    setCategories(await listCategories());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const now = new Date();
  // Forward-looking, so a session marked finished drops out even if its time
  // has not passed — "up next" is what is still owed.
  const upNext = entries
    .filter((entry) => !entry.finished && entry.end >= now)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, 6);

  return (
    <AFPanel label="Up next" count={`${upNext.length}`}>
      {upNext.length === 0 ? <AFHint>Nothing ahead.</AFHint> : <EntryList entries={upNext} categories={categories} withDay />}
    </AFPanel>
  );
}
