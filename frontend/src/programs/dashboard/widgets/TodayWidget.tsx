import { useCallback, useEffect, useState } from 'react';
import { cn } from 'cn';
import { useSession } from '../../../app/session';
import { readAgenda, type AgendaEntry } from '../../../data/agenda';
import { listCategories, type EventCategory } from '../../calendar/categories';
import { colourFor, dayStamp } from './shared';

const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });

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

  const nextIndex = todaysEntries.findIndex((entry) => entry.end >= now);

  return (
    <div className="flex h-full flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Today</h2>
        <span className="text-xs text-muted-foreground">
          {todaysEntries.length} · {dayStamp.format(now)}
        </span>
      </div>

      {todaysEntries.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nothing scheduled today.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {todaysEntries.map((entry, index) => {
            const isPast = entry.end < now;
            const isNext = index === nextIndex;
            return (
              <li key={entry.id} className={cn('flex min-w-0 items-center gap-3', isPast && 'opacity-45')}>
                <span className="w-[92px] shrink-0 text-xs text-muted-foreground [font-variant-numeric:tabular-nums]">
                  {entry.allDay ? 'all day' : clock.format(entry.start)}
                </span>
                <span
                  className="h-7 w-1 shrink-0 rounded-sm"
                  style={{
                    background: colourFor(entry, categories),
                    boxShadow: isNext ? `0 0 10px ${colourFor(entry, categories)}` : undefined,
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-sm">{entry.title}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
