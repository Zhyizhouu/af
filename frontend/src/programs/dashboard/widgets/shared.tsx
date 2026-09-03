import type { AgendaEntry } from '../../../data/agenda';
import { toneColor } from '../../../data/tones';
import { categoryBySlug, type EventCategory } from '../../calendar/categories';

const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const dayStamp = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** A session or a Task Tracker due date carries no category of its own, so
 *  both read as the app's one accent rather than an arbitrary tone. */
export const colourFor = (entry: AgendaEntry, categories: EventCategory[]): string =>
  entry.kind === 'event' ? toneColor(categoryBySlug(categories, entry.category).toneIndex) : 'var(--af-accent)';

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
          <span className="dash__stripe" style={{ background: colourFor(entry, categories) }} />
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
