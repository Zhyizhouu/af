import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '../../components/ui/button';
import { useSession } from '../../app/session';
import { readAgenda, type AgendaEntry } from '../../data/agenda';
import { hexToRgba, toneColor } from '../../data/tones';
import {
  builtInCategories,
  categoryBySlug,
  listCategories,
  type EventCategory,
} from './categories';
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
    <div className="page page--tall cal px-4! py-4! md:px-8! md:py-6! font-sans text-foreground">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1">
          <Button
            variant="raised"
            size="icon"
            className="h-9 w-9 rounded-[8px]"
            aria-label="Previous"
            onClick={() => setAnchor(stepAnchor(view, anchor, -1))}
          >
            <ChevronLeft size={16} aria-hidden />
          </Button>
          <Button
            variant="raised"
            size="icon"
            className="h-9 w-9 rounded-[8px]"
            aria-label="Next"
            onClick={() => setAnchor(stepAnchor(view, anchor, 1))}
          >
            <ChevronRight size={16} aria-hidden />
          </Button>
        </div>
        <span className="min-w-[12ch] text-[15px] font-medium">{rangeLabel(view, anchor)}</span>
        <Button
          variant="raised"
          className="h-9 min-h-11 rounded-[8px] text-[13px] md:min-h-9"
          onClick={() => {
            const today = dayKey(new Date());
            setAnchor(today);
            setSelected(today);
          }}
        >
          Today
        </Button>

        <div
          role="group"
          aria-label="View"
          className="inline-flex gap-0.5 rounded-[10px] border border-white/[0.07] bg-[#050506] p-[3px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]"
        >
          {views.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setView(option)}
              className={cn(
                'h-8 rounded-[7px] px-3 text-xs font-medium',
                view === option
                  ? 'glow-active text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {paneWidth === 'split' ? viewLabels[option].short : viewLabels[option].label}
            </button>
          ))}
        </div>

        <span className="flex-1" />

        <Button variant="raised" className="h-9 min-h-11 rounded-[8px] text-[13px] md:min-h-9">
          <RefreshCw size={16} aria-hidden />
          Sync Outlook
        </Button>
        <Button
          variant="gradient"
          className="h-9 min-h-11 rounded-[8px] text-[13px] md:min-h-9"
          onClick={() => setEditing({ start: withHour(selected, 9) })}
        >
          <Plus size={16} aria-hidden />
          New event
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto">
        {view === 'year' && (
          <YearView
            anchor={anchor}
            entries={entries}
            onPick={(day) => {
              setAnchor(day);
              setSelected(day);
              setView('month');
            }}
          />
        )}

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
    : '#fb923c';

const tintedText = (color: string): string => `color-mix(in srgb, ${color} 70%, white)`;

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
    <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
      {Array.from({ length: 12 }, (_, month) => (
        <div key={month} className="surface-3d rounded-2xl p-5">
          <span className="mb-3 block text-[12px] text-muted-foreground">
            {new Date(anchor.getFullYear(), month, 1).toLocaleString(undefined, { month: 'short' })}
          </span>
          <div className="grid grid-cols-7 gap-0.5">
            {monthCells(anchor.getFullYear(), month).map((cell, index) =>
              cell ? (
                <button
                  key={index}
                  type="button"
                  className={cn(
                    'rounded-sm py-0.5 text-center text-[10px] text-muted-foreground',
                    busy.has(cell.toDateString()) && 'bg-white/10 text-foreground',
                  )}
                  onClick={() => onPick(cell)}
                >
                  {cell.getDate()}
                </button>
              ) : (
                <span key={index} />
              ),
            )}
          </div>
        </div>
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

const maxDots = 4;

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
    <div className="surface-3d shrink-0 rounded-2xl p-5">
      <span className="text-[15px] font-semibold">{monthFormat.format(anchor)}</span>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name) => (
          <span key={name} className="text-[11px] tracking-wide text-muted-foreground uppercase">
            {name}
          </span>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1">
        {cells.map((cell, index) => {
          if (!cell) return <span key={index} className="min-h-[62px]" />;
          const onDay = entries.filter((entry) => isSameDay(entry.start, cell));
          return (
            <button
              key={index}
              type="button"
              className={cn(
                'flex min-h-[62px] flex-col items-start gap-1 rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-1.5',
                isSameDay(cell, today) && 'border-white/25',
                isSameDay(cell, selected) && 'glow-active border-white/[0.08]',
              )}
              onClick={() => onPick(cell)}
            >
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full text-[11.5px]',
                  isSameDay(cell, today) &&
                    'bg-white text-black shadow-[0_0_18px_rgba(255,255,255,0.55)]',
                )}
              >
                {cell.getDate()}
              </span>
              <span className="flex flex-wrap gap-[3px]">
                {onDay.slice(0, maxDots).map((entry) => (
                  <span
                    key={entry.id}
                    className="size-1.5 rounded-full"
                    style={{ background: colorFor(entry, categories) }}
                  />
                ))}
                {/* Four dots and silence read as "four things"; a busy day
                    has to say it is busier than the cell can draw. */}
                {onDay.length > maxDots && (
                  <span className="text-[9.5px] leading-[6px] text-muted-foreground">
                    +{onDay.length - maxDots}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
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
    <div className="surface-3d shrink-0 rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-semibold">{dayFormat.format(day)}</span>
        <span className="text-[12px] text-muted-foreground">{today.length} entries</span>
      </div>
      {today.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Nothing on this day.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {today.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="inset-field flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left"
                onClick={() => onEdit(entry)}
              >
                <span
                  className="w-[3px] self-stretch rounded-full"
                  style={{ background: colorFor(entry, categories) }}
                />
                <span className="w-[7ch] shrink-0 text-[11.5px] text-muted-foreground">
                  {entry.allDay ? 'all day' : clock.format(entry.start)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{entry.title}</span>
                {entry.kind !== 'event' && (
                  <span className="text-[11px] text-muted-foreground uppercase">{entry.kind}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
  const scroller = useRef<HTMLDivElement>(null);

  // The grid always starts at midnight, so a day whose first entry is at
  // 08:00 opened on eight empty hours and put every event below the fold.
  // Open at the earliest timed entry instead — or the current hour when the
  // range holds today and nothing is scheduled, 08:00 otherwise.
  const firstHour = useMemo(() => {
    const timed = entries.filter((entry) => !entry.allDay);
    if (timed.length > 0) return Math.min(...timed.map((entry) => entry.start.getHours()));
    const current = new Date();
    const holdsToday = current >= range.start && current < addDays(range.end, 1);
    return holdsToday ? current.getHours() : 8;
  }, [entries, range]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: Math.max(0, firstHour - 1) * hourHeight });
  }, [range, firstHour]);

  return (
    <div className="surface-3d flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-2xl">
      <div
        className="grid border-b border-white/[0.07]"
        style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}
      >
        <span />
        {days.map((day) => {
          const isToday = isSameDay(day, now);
          return (
            <div
              key={day.toISOString()}
              className="flex flex-col items-center justify-center gap-0.5 border-l border-white/[0.06] py-2.5"
            >
              <span
                className={cn(
                  'text-[11px] tracking-wide uppercase',
                  isToday ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {dayFormat.format(day).split(',')[0]}
              </span>
              <span
                className={cn(
                  'flex items-center justify-center text-[16px] font-medium',
                  isToday && 'size-8 rounded-full bg-white text-black shadow-[0_0_18px_rgba(255,255,255,0.55)]',
                )}
              >
                {day.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      <div
        ref={scroller}
        className="grid min-h-0 flex-1 gap-0 overflow-y-auto"
        style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}
      >
        <div className="flex flex-col">
          {hours.map((hour) => (
            <span
              key={hour}
              style={{ height: hourHeight }}
              className="pr-2.5 pt-1 text-right font-mono text-[10px] tabular-nums text-muted-foreground"
            >
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
            <div
              key={day.toISOString()}
              className="relative border-l border-white/[0.06]"
              style={{
                height: hourHeight * 24,
                backgroundImage: `repeating-linear-gradient(to bottom, rgba(255,255,255,0.06) 0, rgba(255,255,255,0.06) 1px, transparent 1px, transparent ${hourHeight}px)`,
              }}
            >
              {hours.map((hour) => (
                <button
                  key={hour}
                  type="button"
                  className="absolute right-0 left-0 border-0 bg-transparent p-0 hover:bg-white/[0.04]"
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
                const color = colorFor(entry, categories);
                const isPast = entry.end.getTime() < now.getTime();
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      'absolute overflow-hidden rounded-lg px-2.5 py-1.5 text-[12px]',
                      isPast && 'opacity-50',
                    )}
                    style={{
                      top: (startMinutes / 60) * hourHeight,
                      height: ((endMinutes - startMinutes) / 60) * hourHeight - 2,
                      left: `calc(${(column / columns) * 100}% + 4px)`,
                      width: `calc(${(1 / columns) * 100}% - 8px)`,
                      background: hexToRgba(color, 0.14),
                      border: `1px solid ${hexToRgba(color, 0.35)}`,
                      color: tintedText(color),
                    }}
                    title={entry.title}
                  >
                    <span className="block truncate font-semibold">{entry.title}</span>
                  </div>
                );
              })}

              {isSameDay(day, now) && (
                <div
                  className="pointer-events-none absolute right-0 left-0 h-[2px] bg-[#fb7185] shadow-[0_0_10px_#fb7185]"
                  style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * hourHeight }}
                >
                  <span className="absolute -top-1 -left-[5px] size-2.5 rounded-full bg-[#fb7185] shadow-[0_0_12px_#fb7185]" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
