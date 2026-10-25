import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '../../components/ui/button';
import { useSession } from '../../app/session';
import { readAgenda, type AgendaEntry } from '../../data/agenda';
import { clock, dayStamp } from '../../data/format';
import { entryEnd, findOverlaps, todoInstant } from '../../data/overlap';
import { hexToRgba } from '../../data/tones';
import { useIsMobile } from '../../hooks/use-mobile';
import { dayFromKey, keyFromDay } from '../habits/time';
import { StepMark } from '../todo/StepMark';
import { listTodosInRange, toggleTodo, withSteps, type TodoWithStep } from '../todo/store';
import {
  builtInCategories,
  entryColour,
  listCategories,
  type EventCategory,
} from './categories';
import {
  addDays,
  dayKey,
  deleteEvent,
  isSameDay,
  isTimeGrid,
  packWeighted,
  saveEvent,
  stepAnchor,
  viewLabels,
  visibleRange,
  type CalendarView,
  type Lane,
} from './store';
import { EventEditor } from './EventEditor';
import {
  DockPanel,
  DockPill,
  TickBox,
  TodoBlock,
  TodoText,
  dashed,
  todoMinHeight,
  type Dock,
} from './TodoBits';
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
  const narrow = useIsMobile() || paneWidth === 'split';

  const [view, setView] = useState<CalendarView>('month');
  const [anchor, setAnchor] = useState(() => dayKey(new Date()));
  const [entries, setEntries] = useState<AgendaEntry[]>([]);
  const [todos, setTodos] = useState<TodoWithStep[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([...builtInCategories]);
  const [selected, setSelected] = useState<Date>(() => dayKey(new Date()));
  const [editing, setEditing] = useState<{ id?: string; start: Date } | null>(null);

  const range = useMemo(() => visibleRange(view, anchor), [view, anchor]);

  const rangeFrom = localDayKey(range.start);
  const rangeTo = localDayKey(range.end);
  const selectedKey = localDayKey(selected);
  const selectedOutside = selectedKey < rangeFrom || selectedKey > rangeTo;
  const extraKey = selectedOutside ? selectedKey : '';
  const [agendaTick, setAgendaTick] = useState(0);
  const [todoTick, setTodoTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [nextEntries, nextCategories] = await Promise.all([readAgenda(), listCategories()]);
      if (cancelled) return;
      setEntries(nextEntries);
      setCategories(nextCategories);
    })();
    return () => {
      cancelled = true;
    };
  }, [revision, agendaTick]);

  // To-dos load for the visible range plus the selected day, which the month
  // agenda lists even after the anchor has moved to another month. The effect
  // depends on the selected day only while it is outside the range (`extraKey`),
  // so picking another day inside it does not reload. The year view draws no
  // to-dos and skips the load. A tick reloads only these, not the agenda.
  useEffect(() => {
    if (view === 'year') return;
    let cancelled = false;
    void (async () => {
      const rows = await listTodosInRange(rangeFrom, rangeTo);
      if (extraKey) rows.push(...(await listTodosInRange(extraKey, extraKey)));
      const withStep = await withSteps(rows);
      if (!cancelled) setTodos(withStep);
    })();
    return () => {
      cancelled = true;
    };
  }, [view, rangeFrom, rangeTo, extraKey, revision, todoTick]);

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
      setAgendaTick((n) => n + 1);
      requestSync();
      setEditing(null);
    },
    [requestSync],
  );

  const tick = useCallback(
    async (id: string) => {
      await toggleTodo(id);
      setTodoTick((n) => n + 1);
      requestSync();
    },
    [requestSync],
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
            todos={todos}
            narrow={narrow}
            onTick={(id) => void tick(id)}
            onSlot={(start) => setEditing({ start })}
          />
        )}

        {view === 'month' && (
          <DayAgenda
            day={selected}
            entries={entries}
            todos={todos}
            categories={categories}
            touch={narrow}
            onTick={(id) => void tick(id)}
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

function rangeLabel(view: CalendarView, anchor: Date): string {
  if (view === 'year') return String(anchor.getFullYear());
  if (view === 'month') return monthFormat.format(anchor);
  const { start, end } = visibleRange(view, anchor);
  return view === 'day' ? dayStamp.format(start) : `${dayStamp.format(start)} – ${dayStamp.format(end)}`;
}

const withHour = (day: Date, hour: number) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);

const tintedText = (color: string): string => `color-mix(in srgb, ${color} 70%, white)`;

const localDayKey = (day: Date): string =>
  keyFromDay(new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())));

const todoDay = (todo: TodoWithStep['todo']): Date => {
  const day = dayFromKey(todo.day);
  return new Date(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
};

const todoStart = (item: TodoWithStep): Date => todoInstant(item.todo.day, item.todo.time!);


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
                    style={{ background: entryColour(entry, categories) }}
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
  todos,
  categories,
  touch,
  onTick,
  onEdit,
}: {
  day: Date;
  entries: AgendaEntry[];
  todos: TodoWithStep[];
  categories: EventCategory[];
  touch: boolean;
  onTick: (id: string) => void;
  onEdit: (entry: AgendaEntry) => void;
}) {
  const dayEntries = entries
    .filter((entry) => isSameDay(entry.start, day))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const dayTodos = todos
    .filter((item) => isSameDay(todoDay(item.todo), day))
    .sort((a, b) => Number(!a.todo.time) - Number(!b.todo.time) || (a.todo.time ?? '').localeCompare(b.todo.time ?? ''));

  return (
    <div className="surface-3d shrink-0 rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-semibold">{dayStamp.format(day)}</span>
        <span className="text-[12px] text-muted-foreground">{dayEntries.length + dayTodos.length} entries
          {dayTodos.length > 0 && ` · ${dayTodos.length} to-do${dayTodos.length === 1 ? '' : 's'}`}
        </span>
      </div>
      {dayEntries.length === 0 && dayTodos.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Nothing on this day.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {dayEntries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="inset-field flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left"
                onClick={() => onEdit(entry)}
              >
                <span
                  className="w-[3px] self-stretch rounded-full"
                  style={{ background: entryColour(entry, categories) }}
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
          {dayTodos.map((item) => (
            <li
              key={item.todo.id}
              className={cn(
                'inset-field flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2',
                touch && 'min-h-11',
              )}
            >
              <TickBox item={item} onTick={onTick} touch={touch} className="size-[18px] rounded-[5px]" />
              <span className="w-[7ch] shrink-0 text-[11.5px] text-muted-foreground">
                {item.todo.time ?? 'any time'}
              </span>
              <TodoText item={item} className="flex-1 text-sm" />
              {item.task && (
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <StepMark task={item.task} compact />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const hours = Array.from({ length: 24 }, (_, hour) => hour);
const hourHeight = 44;
const maxChips = 3;
const dockInset = 1;
const todoSpanMs = (todoMinHeight / hourHeight) * 60 * 60_000;

interface GridItem {
  id: string;
  start: number;
  end: number;
  entry: AgendaEntry | null;
  todo: TodoWithStep | null;
}

interface DayLayout {
  day: Date;
  lanes: Lane<GridItem>[];
  docks: Dock[];
  allDayEntries: AgendaEntry[];
  untimed: TodoWithStep[];
}

const minutesOf = (date: Date): number => date.getHours() * 60 + date.getMinutes();

/**
 * Lays one day out. Wide, timed to-dos get their own lanes, packed by the
 * height they are drawn at. Narrow, a to-do running during an event is docked
 * on it. `compact` (a narrow week, too thin for any block) docks every other
 * timed to-do too, one pill per hour.
 */
function layoutDay(
  day: Date,
  entries: AgendaEntry[],
  todos: TodoWithStep[],
  narrow: boolean,
  compact: boolean,
): DayLayout {
  const timedEntries = entries.filter((entry) => !entry.allDay && isSameDay(entry.start, day));
  const forDay = todos.filter((item) => isSameDay(todoDay(item.todo), day));
  const timedTodos = forDay.filter((item) => item.todo.time);

  const hits = narrow
    ? findOverlaps(
        timedTodos.map((item) => item.todo),
        timedEntries,
      )
    : new Map<string, AgendaEntry[]>();
  const free = timedTodos.filter((item) => !hits.has(item.todo.id));

  const items: GridItem[] = [
    ...timedEntries.map((entry) => ({
      id: `entry:${entry.id}`,
      start: entry.start.getTime(),
      end: entryEnd(entry),
      entry,
      todo: null,
    })),
    ...(compact ? [] : free).map((item) => ({
      id: `todo:${item.todo.id}`,
      start: todoStart(item).getTime(),
      end: todoStart(item).getTime() + todoSpanMs,
      entry: null,
      todo: item,
    })),
  ];
  const lanes = packWeighted(
    items,
    (item) => item.start,
    (item) => item.end,
    (item) => item.todo !== null,
  );

  const docked = new Map<string, Dock>();
  const dockOn = (id: string, make: () => Omit<Dock, 'id' | 'todos' | 'around'>, item: TodoWithStep) => {
    const dock = docked.get(id) ?? { id, todos: [], around: [], ...make() };
    dock.todos.push(item);
    docked.set(id, dock);
  };
  // A free to-do whose hour holds an event dock joins that dock rather than
  // drawing an hour pill on top of it.
  const eventDockIn = (hour: number) =>
    [...docked.values()].find(
      (dock) =>
        timedEntries.some((entry) => entry.id === dock.id) &&
        Math.floor((dock.top - dockInset) / hourHeight) === hour,
    );
  const eventHits = timedTodos.filter((item) => hits.has(item.todo.id));
  const freeTodos = timedTodos.filter((item) => !hits.has(item.todo.id));
  for (const item of [...eventHits, ...freeTodos]) {
    const first = hits.get(item.todo.id)?.[0];
    if (first) {
      const lane = lanes.find((candidate) => candidate.entry.entry?.id === first.id);
      if (lane) {
        dockOn(
          first.id,
          () => ({
            when: `during ${first.title}`,
            top: (minutesOf(first.start) / 60) * hourHeight + dockInset,
            edge: lane.left + lane.width,
          }),
          item,
        );
      }
    } else if (compact) {
      const hour = todoStart(item).getHours();
      const label = `${String(hour).padStart(2, '0')}:00`;
      const eventDock = eventDockIn(hour);
      if (eventDock) {
        eventDock.todos.push(item);
        eventDock.around.push(item);
        continue;
      }
      dockOn(
        `${day.toISOString()}:${hour}`,
        () => ({ when: `around ${label}`, top: hour * hourHeight + dockInset, edge: 100 }),
        item,
      );
    }
  }

  return {
    day,
    lanes,
    docks: [...docked.values()],
    allDayEntries: entries.filter((entry) => entry.allDay && isSameDay(entry.start, day)),
    untimed: forDay.filter((item) => !item.todo.time),
  };
}

function TimeGrid({
  range,
  entries,
  categories,
  todos,
  narrow,
  onTick,
  onSlot,
}: {
  range: { start: Date; end: Date };
  entries: AgendaEntry[];
  categories: EventCategory[];
  todos: TodoWithStep[];
  narrow: boolean;
  onTick: (id: string) => void;
  onSlot: (start: Date) => void;
}) {
  const days = useMemo(() => {
    const list: Date[] = [];
    for (let day = range.start; day <= range.end; day = addDays(day, 1)) list.push(day);
    return list;
  }, [range]);

  const compact = narrow && days.length > 3;
  const layouts = useMemo(
    () => days.map((day) => layoutDay(day, entries, todos, narrow, compact)),
    [days, entries, todos, narrow, compact],
  );
  const hasStrip = layouts.some((layout) => layout.allDayEntries.length + layout.untimed.length > 0);
  const [openDock, setOpenDock] = useState<string | null>(null);
  const panelId = useId();
  const opened = layouts.flatMap((layout) => layout.docks).find((dock) => dock.id === openDock);

  const now = new Date();
  const scroller = useRef<HTMLDivElement>(null);

  // The grid always starts at midnight, so a day whose first entry is at
  // 08:00 opened on eight empty hours and put every event below the fold.
  // Open at the earliest timed entry instead — or the current hour when the
  // range holds today and nothing is scheduled, 08:00 otherwise.
  const firstHour = useMemo(() => {
    const starts = [
      ...entries.filter((entry) => !entry.allDay).map((entry) => entry.start.getHours()),
      ...todos.filter((item) => item.todo.time).map((item) => todoStart(item).getHours()),
    ];
    if (starts.length > 0) return Math.min(...starts);
    const current = new Date();
    const holdsToday = current >= range.start && current < addDays(range.end, 1);
    return holdsToday ? current.getHours() : 8;
  }, [entries, todos, range]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: Math.max(0, firstHour - 1) * hourHeight });
  }, [range, firstHour]);

  const columns = `48px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="surface-3d flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-2xl">
      <div className="grid border-b border-white/[0.07]" style={{ gridTemplateColumns: columns }}>
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
                {dayStamp.format(day).split(',')[0]}
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

      {hasStrip && (
        <div
          role="group"
          className="grid border-b border-white/[0.07]"
          style={{ gridTemplateColumns: columns }}
          aria-label="All day"
        >
          <span className="pt-2 pr-2.5 text-right text-[10px] text-muted-foreground">all day</span>
          {layouts.map((layout) => (
            <AllDayCell
              key={layout.day.toISOString()}
              layout={layout}
              categories={categories}
              touch={narrow}
              dense={compact}
              onTick={onTick}
            />
          ))}
        </div>
      )}

      <div
        ref={scroller}
        className="grid min-h-0 flex-1 gap-0 overflow-y-auto"
        style={{ gridTemplateColumns: columns }}
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

        {layouts.map(({ day, lanes, docks }) => (
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

            {lanes.map((lane) => {
              const { entry, todo } = lane.entry;
              const place = {
                left: `calc(${lane.left}% + 4px)`,
                width: `calc(${lane.width}% - 8px)`,
              };

              if (todo) {
                // The app assumes the device clock is in Jakarta, so the instant's local hours are the Jakarta wall time.
                return (
                  <TodoBlock
                    key={lane.entry.id}
                    item={todo}
                    top={(minutesOf(todoStart(todo)) / 60) * hourHeight}
                    place={place}
                    past={lane.entry.end < now.getTime()}
                    touch={narrow}
                    onTick={onTick}
                  />
                );
              }

              if (!entry) return null;
              const startMinutes = minutesOf(entry.start);
              const spanMinutes = Math.min(
                (entryEnd(entry) - entry.start.getTime()) / 60_000,
                24 * 60 - startMinutes,
              );
              const color = entryColour(entry, categories);
              const isPast = entry.end.getTime() < now.getTime();
              const hasDock = docks.some((dock) => dock.id === entry.id);
              return (
                <div
                  key={lane.entry.id}
                  className={cn(
                    'absolute overflow-hidden rounded-lg px-2.5 py-1.5 text-[12px]',
                    hasDock && 'pr-12',
                    isPast && 'opacity-50',
                  )}
                  style={{
                    top: (startMinutes / 60) * hourHeight,
                    height: (spanMinutes / 60) * hourHeight - 2,
                    ...place,
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

            {docks.map((dock) => (
              <DockPill
                key={dock.id}
                dock={dock}
                open={openDock === dock.id}
                panelId={panelId}
                onToggle={() => setOpenDock(openDock === dock.id ? null : dock.id)}
              />
            ))}

            {isSameDay(day, now) && (
              <div
                className="pointer-events-none absolute right-0 left-0 h-[2px] bg-[#fb7185] shadow-[0_0_10px_#fb7185]"
                style={{ top: (minutesOf(now) / 60) * hourHeight }}
              >
                <span className="absolute -top-1 -left-[5px] size-2.5 rounded-full bg-[#fb7185] shadow-[0_0_12px_#fb7185]" />
              </div>
            )}
          </div>
        ))}
      </div>

      {opened && <DockPanel dock={opened} id={panelId} onTick={onTick} />}
    </div>
  );
}

function AllDayCell({
  layout,
  categories,
  touch,
  dense,
  onTick,
}: {
  layout: DayLayout;
  categories: EventCategory[];
  touch: boolean;
  dense: boolean;
  onTick: (id: string) => void;
}) {
  const chips = [
    ...layout.allDayEntries.map((entry) => ({ kind: 'entry' as const, entry })),
    ...layout.untimed.map((item) => ({ kind: 'todo' as const, item })),
  ];
  return (
    <div className="flex min-w-0 flex-col gap-1 overflow-hidden border-l border-white/[0.06] p-1">
      {/* In touch mode each to-do row is as tall as its 44px tick hit area, so stacked targets never overlap. */}
      {chips.slice(0, maxChips).map((chip) => {
        if (chip.kind === 'todo') {
          const { item } = chip;
          return (
            <div
              key={item.todo.id}
              className={cn(
                'flex min-w-0 items-center gap-1 rounded-full py-0.5 pr-2 pl-1 text-[11px]',
                dashed,
                touch && 'min-h-11',
              )}
              title={item.todo.text}
            >
              <TickBox item={item} onTick={onTick} touch={touch} className="size-3.5 rounded-[4px]" />
              <TodoText item={item} className="flex-1" />
              {item.task && !dense && (
                <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                  <StepMark task={item.task} compact />
                </span>
              )}
            </div>
          );
        }
        const color = entryColour(chip.entry, categories);
        return (
          <div
            key={chip.entry.id}
            className="truncate rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ background: hexToRgba(color, 0.22), color: tintedText(color) }}
            title={chip.entry.title}
          >
            {chip.entry.title}
          </div>
        );
      })}
      {chips.length > maxChips && (
        <span className="px-1 text-[10.5px] text-muted-foreground">+{chips.length - maxChips}</span>
      )}
    </div>
  );
}
