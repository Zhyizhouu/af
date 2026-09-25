import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../../app/session';
import { readAgenda, type AgendaEntry } from '../../../data/agenda';
import { listCategories, type EventCategory } from '../../calendar/categories';
import { colourFor } from './shared';

const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const dayStamp = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

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
    <div className="flex h-full flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Up next</h2>
        <span className="text-xs text-muted-foreground">{upNext.length}</span>
      </div>

      {upNext.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nothing ahead.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {upNext.map((entry, index) => (
            <li key={entry.id} className="flex min-w-0 items-center gap-3">
              <span className="w-[92px] shrink-0 text-xs text-muted-foreground [font-variant-numeric:tabular-nums]">
                {entry.allDay ? 'all day' : `${dayStamp.format(entry.start)} ${clock.format(entry.start)}`}
              </span>
              <span
                className="h-7 w-1 shrink-0 rounded-sm"
                style={{
                  background: colourFor(entry, categories),
                  boxShadow: index === 0 ? `0 0 10px ${colourFor(entry, categories)}` : undefined,
                }}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{entry.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
