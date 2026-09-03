import { useCallback, useEffect, useState } from 'react';
import { AFHint, AFPanel } from '../../../components/AF';
import { useSession } from '../../../app/session';
import { readAgenda, type AgendaEntry } from '../../../data/agenda';
import { listCategories, type EventCategory } from '../../calendar/categories';
import { EntryList, dayStamp } from './shared';

/** Named for what it holds, not for the day: "Up next" is also about today,
 *  and two headings reading TODAY on one dashboard is one heading too many. */
export function TodayWidget() {
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
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todaysEntries = entries
    .filter((entry) => entry.start >= startOfDay && entry.start < new Date(startOfDay.getTime() + 86_400_000))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  return (
    <AFPanel
      label="Today"
      countSlot={
        <span className="af-panel-count">
          {todaysEntries.length} · {dayStamp.format(now)}
        </span>
      }
    >
      {todaysEntries.length === 0 ? (
        <AFHint>Nothing scheduled today.</AFHint>
      ) : (
        <EntryList entries={todaysEntries} categories={categories} />
      )}
    </AFPanel>
  );
}
