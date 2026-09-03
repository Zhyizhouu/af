import { useCallback, useEffect, useMemo, useState } from 'react';
import { AFButton, AFEmptyState, AFHint, AFPanel } from '../../components/AF';
import { useSession } from '../../app/session';
import { readAgenda, type AgendaEntry } from '../../data/agenda';
import {
  builtInCategories,
  categoryBySlug,
  listCategories,
  type EventCategory,
} from './categories';
import { toneColor } from '../../data/tones';
import {
  addDays,
  dayKey,
  deleteEvent,
  isSameDay,
  isTimeGrid,
  packColumns,
  saveEvent,
  stepAnchor,
  viewLabels,
  visibleRange,
  type CalendarView,
} from './store';
import { EventEditor } from './EventEditor';
import './calendar.css';

/**
 * reAFresh · Calendar — own events plus proctor sessions, at five zoom levels.
 *
 * The calendar owns its events rather than being a view over Checklists, but it
 * shows sessions too: what somebody wants from a calendar is everything they
 * are committed to, not everything one program happens to store.
 */
export function CalendarScreen({ paneWidth = 'full' }: { paneWidth?: 'full' | 'split' }) {
  const { revision, requestSync } = useSession();

  const [view, setView] = useState<CalendarView>('month');
  const [anchor, setAnchor] = useState(() => dayKey(new Date()));
  const [entries, setEntries] = useState<AgendaEntry[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([...builtInCategories]);
  const [selected, setSelected] = useState<Date>(() => dayKey(new Date()));
  const [editing, setEditing] = useState<{ id?: string; start: Date } | null>(null);

  const reload = useCallback(async () => {
    setEntries(await readAgenda());
    setCategories(await listCategories());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const range = useMemo(() => visibleRange(view, anchor), [view, anchor]);

  const visible = useMemo(
    () =>
      entries.filter(
        (entry) => entry.end >= range.start && entry.start <= addDays(range.end, 1),
      ),
    [entries, range],
  );

  const commit = useCallback(
    async (action: () => Promise<unknown>) => {
      await action();
      await reload();
      requestSync();
      setEditing(null);
    },
    [reload, requestSync],
  );

  // A split pane has no room for the time grids' hour axis plus a week of
  // columns, so it opens on the reading-width views and keeps the rest
  // reachable rather than pretending they will fit.
  const views: CalendarView[] =
    paneWidth === 'split'
      ? ['month', 'threeDay', 'day']
      : ['year', 'month', 'week', 'threeDay', 'day'];

  return (
    <div className="page page--tall cal">
      <div className="cal__bar">
        <div className="cal__views">
          {views.map((option) => (
            <button
              key={option}
              type="button"
              className={`cal__view${view === option ? ' is-active' : ''}`}
              onClick={() => setView(option)}
            >
              {paneWidth === 'split' ? viewLabels[option].short : viewLabels[option].label}
            </button>
          ))}
        </div>
        <AFButton label="‹" variant="ghost" onClick={() => setAnchor(stepAnchor(view, anchor, -1))} />
        <span className="cal__range">{rangeLabel(view, anchor)}</span>
        <AFButton label="›" variant="ghost" onClick={() => setAnchor(stepAnchor(view, anchor, 1))} />
        <span className="cal__spacer" />
        <AFButton label="Today" variant="quiet" onClick={() => {
          const today = dayKey(new Date());
          setAnchor(today);
          setSelected(today);
        }} />
        <AFButton
          label="New event"
          onClick={() => setEditing({ start: withHour(selected, 9) })}
        />
      </div>

      <div className="cal__body">
        {view === 'year' && <YearView anchor={anchor} entries={entries} onPick={(day) => {
          setAnchor(day);
          setSelected(day);
          setView('month');
        }} />}

        {view === 'month' && (
          <MonthView
            anchor={anchor}
            selected={selected}
            entries={visible}
            categories={categories}
            onPick={setSelected}
          />
        )}

        {isTimeGrid(view) && (
          <TimeGrid
            range={range}
            entries={visible}
            categories={categories}
            onSlot={(start) => setEditing({ start })}
          />
        )}

        {view === 'month' && (
          <DayAgenda
            day={selected}
            entries={entries}
            categories={categories}
            onEdit={(entry) =>
              entry.kind === 'event' ? setEditing({ id: entry.id, start: entry.start }) : undefined
            }
          />
        )}
      </div>

      {editing && (
        <EventEditor
          categories={categories}
          initial={
            editing.id
              ? entries.find((entry) => entry.id === editing.id) ?? null
              : null
          }
          start={editing.start}
          onCancel={() => setEditing(null)}
          onSave={(input) => void commit(() => saveEvent({ ...input, id: editing.id }))}
          onDelete={editing.id ? () => void commit(() => deleteEvent(editing.id!)) : undefined}
        />
      )}
    </div>
  );
}

const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });

function rangeLabel(view: CalendarView, anchor: Date): string {
  if (view === 'year') return String(anchor.getFullYear());
  if (view === 'month') return monthFormat.format(anchor);
  const { start, end } = visibleRange(view, anchor);
  return view === 'day' ? dayFormat.format(start) : `${dayFormat.format(start)} – ${dayFormat.format(end)}`;
}

const withHour = (day: Date, hour: number) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);

const colorFor = (entry: AgendaEntry, categories: EventCategory[]): string =>
  entry.kind === 'event'
    ? toneColor(categoryBySlug(categories, entry.category).toneIndex)
    : 'var(--af-accent)';

/** Twelve mini-months, each marked where something is scheduled. */
function YearView({
  anchor,
  entries,
  onPick,
}: {
  anchor: Date;
  entries: AgendaEntry[];
  onPick: (day: Date) => void;
}) {
  const busy = useMemo(() => {
    const days = new Set<string>();
    for (const entry of entries) {
      if (entry.start.getFullYear() !== anchor.getFullYear()) continue;
      days.add(dayKey(entry.start).toDateString());
    }
    return days;
  }, [entries, anchor]);

  return (
    <div className="cal__year">
      {Array.from({ length: 12 }, (_, month) => (
        <AFPanel key={month} label={new Date(anchor.getFullYear(), month, 1).toLocaleString(undefined, { month: 'short' })}>
          <div className="cal__mini">
            {monthCells(anchor.getFullYear(), month).map((cell, index) =>
              cell ? (
                <button
                  key={index}
                  type="button"
                  className={`cal__mini-day${busy.has(cell.toDateString()) ? ' is-busy' : ''}`}
                  onClick={() => onPick(cell)}
                >
                  {cell.getDate()}
                </button>
              ) : (
                <span key={index} />
              ),
            )}
          </div>
        </AFPanel>
      ))}
    </div>
  );
}

/** Cells for one month grid, Monday first, with leading blanks. */
function monthCells(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => new Date(year, month, i + 1)),
  ];
}

function MonthView({
  anchor,
  selected,
  entries,
  categories,
  onPick,
}: {
  anchor: Date;
  selected: Date;
  entries: AgendaEntry[];
  categories: EventCategory[];
  onPick: (day: Date) => void;
}) {
  const today = new Date();
  const cells = monthCells(anchor.getFullYear(), anchor.getMonth());

  return (
    <AFPanel label={monthFormat.format(anchor)}>
      <div className="cal__weekdays">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name) => (
          <span key={name} className="af-panel-label">
            {name}
          </span>
        ))}
      </div>
      <div className="cal__grid">
        {cells.map((cell, index) =>
          cell ? (
            <button
              key={index}
              type="button"
              className={
                'cal__cell' +
                (isSameDay(cell, selected) ? ' is-selected' : '') +
                (isSameDay(cell, today) ? ' is-today' : '')
              }
              onClick={() => onPick(cell)}
            >
              <span className="cal__cell-date">{cell.getDate()}</span>
              <span className="cal__dots">
                {entries
                  .filter((entry) => isSameDay(entry.start, cell))
                  .slice(0, 4)
                  .map((entry) => (
                    <span
                      key={entry.id}
                      className="cal__dot"
                      style={{ background: colorFor(entry, categories) }}
                    />
                  ))}
              </span>
            </button>
          ) : (
            <span key={index} className="cal__cell cal__cell--blank" />
          ),
        )}
      </div>
    </AFPanel>
  );
}

function DayAgenda({
  day,
  entries,
  categories,
  onEdit,
}: {
  day: Date;
  entries: AgendaEntry[];
  categories: EventCategory[];
  onEdit: (entry: AgendaEntry) => void;
}) {
  const today = entries
    .filter((entry) => isSameDay(entry.start, day))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  return (
    <AFPanel label={dayFormat.format(day)} count={`${today.length} entries`}>
      {today.length === 0 ? (
        <AFHint>Nothing on this day.</AFHint>
      ) : (
        <ul className="cal__agenda">
          {today.map((entry) => (
            <li key={entry.id}>
              <button type="button" className="cal__agenda-row" onClick={() => onEdit(entry)}>
                <span className="cal__stripe" style={{ background: colorFor(entry, categories) }} />
                <span className="cal__agenda-when">
                  {entry.allDay ? 'all day' : clock.format(entry.start)}
                </span>
                <span className="cal__agenda-title af-body">{entry.title}</span>
                {entry.kind !== 'event' && <span className="af-panel-label">{entry.kind}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </AFPanel>
  );
}

const hours = Array.from({ length: 24 }, (_, hour) => hour);
const hourHeight = 44;

function TimeGrid({
  range,
  entries,
  categories,
  onSlot,
}: {
  range: { start: Date; end: Date };
  entries: AgendaEntry[];
  categories: EventCategory[];
  onSlot: (start: Date) => void;
}) {
  const days: Date[] = [];
  for (let day = range.start; day <= range.end; day = addDays(day, 1)) days.push(day);

  const now = new Date();

  return (
    <AFPanel label="Time grid">
      <div className="cal__grid-head" style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}>
        <span />
        {days.map((day) => (
          <span key={day.toISOString()} className="af-panel-label">
            {dayFormat.format(day)}
          </span>
        ))}
      </div>

      <div className="cal__timegrid" style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}>
        <div className="cal__axis">
          {hours.map((hour) => (
            <span key={hour} style={{ height: hourHeight }} className="cal__hour">
              {String(hour).padStart(2, '0')}
            </span>
          ))}
        </div>

        {days.map((day) => {
          const forDay = entries.filter(
            (entry) => !entry.allDay && isSameDay(entry.start, day),
          );
          const placed = packColumns(
            forDay,
            (entry) => entry.start.getTime(),
            // A session is a point in time; give it a nominal half hour so it
            // has a block to draw rather than a zero-height sliver.
            (entry) =>
              Math.max(entry.end.getTime(), entry.start.getTime() + 30 * 60_000),
          );

          return (
            <div key={day.toISOString()} className="cal__column" style={{ height: hourHeight * 24 }}>
              {hours.map((hour) => (
                <button
                  key={hour}
                  type="button"
                  className="cal__slot"
                  style={{ top: hour * hourHeight, height: hourHeight }}
                  onClick={() => onSlot(withHour(day, hour))}
                  aria-label={`New event at ${String(hour).padStart(2, '0')}:00`}
                />
              ))}

              {placed.map(({ entry, column, columns }) => {
                const startMinutes = entry.start.getHours() * 60 + entry.start.getMinutes();
                const endMinutes = Math.max(
                  startMinutes + 30,
                  entry.end.getHours() * 60 + entry.end.getMinutes(),
                );
                return (
                  <div
                    key={entry.id}
                    className="cal__block"
                    style={{
                      top: (startMinutes / 60) * hourHeight,
                      height: ((endMinutes - startMinutes) / 60) * hourHeight - 2,
                      left: `${(column / columns) * 100}%`,
                      width: `${(1 / columns) * 100}%`,
                      borderColor: colorFor(entry, categories),
                    }}
                    title={entry.title}
                  >
                    <span className="cal__block-title">{entry.title}</span>
                  </div>
                );
              })}

              {isSameDay(day, now) && (
                <div
                  className="cal__now"
                  style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * hourHeight }}
                />
              )}
            </div>
          );
        })}
      </div>
    </AFPanel>
  );
}

export { AFEmptyState };
