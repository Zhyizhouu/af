import type { AgendaEntry } from '../../../data/agenda';
import { clock } from '../../../data/format';
import { entryColour, type EventCategory } from '../../calendar/categories';

const dayStamp = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export function EntryList({
  entries,
  categories,
  withDay = false,
}: {
  entries: AgendaEntry[];
  categories: EventCategory[];
  withDay?: boolean;
}) {
  return (
    <ul className="dash__entries">
      {entries.map((entry) => (
        <li key={entry.id} className="dash__entry">
          <span className="dash__stripe" style={{ background: entryColour(entry, categories) }} />
          <span className="dash__when">
            {entry.allDay
              ? 'all day'
              : withDay
                ? `${dayStamp.format(entry.start)} ${clock.format(entry.start)}`
                : clock.format(entry.start)}
          </span>
          <span className="dash__title af-body">{entry.title}</span>
        </li>
      ))}
    </ul>
  );
}

export { dayStamp };
