import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Input } from '../../components/ui/input';
import { useSession } from '../../app/session';
import type { AgendaEntry } from '../../data/agenda';
import type { TodoItemRow } from '../../data/db';
import { findOverlaps, readEntriesForDays } from '../../data/overlap';
import { useIsMobile } from '../../hooks/use-mobile';
import { addDaysToKey, dayFromKey, jakartaDayKey, keyFromDay } from '../habits/time';
import { addTodo, deleteTodo, listTodosInRange, orderForDisplay, toggleTodo, withSteps, type TodoWithStep } from './store';
import { StepMark } from './StepMark';
import { DayPanel, DuringChip, dragIndexes, type MetaOf, type TodoMeta } from './DayPanel';
import { useTodoDrag, type After, type RowProps } from './useTodoDrag';

type View = 'day' | 'week' | 'month';

const views: { id: View; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });
const dayLongFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Steps whole months, clamping to the last day when the target month is shorter. */
const addMonths = (key: string, count: number): string => {
  const day = dayFromKey(key);
  const target = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + count, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day.getUTCDate(), last));
  return keyFromDay(target);
};

const weekStart = (key: string): string => addDaysToKey(key, -((dayFromKey(key).getUTCDay() + 6) % 7));

/** The first and last day keys a view needs loaded around the selected day. */
function rangeFor(view: View, day: string): { from: string; to: string } {
  if (view === 'day') return { from: day, to: day };
  if (view === 'week') {
    const from = weekStart(day);
    return { from, to: addDaysToKey(from, 6) };
  }
  const first = dayFromKey(day);
  first.setUTCDate(1);
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  return { from: keyFromDay(first), to: keyFromDay(last) };
}

/** Cells for one month grid, Monday first, with leading blanks. */
function monthCells(day: string): (string | null)[] {
  const { from, to } = rangeFor('month', day);
  const lead = (dayFromKey(from).getUTCDay() + 6) % 7;
  const count = dayFromKey(to).getUTCDate();
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => addDaysToKey(from, i)),
  ];
}

function rangeLabel(view: View, day: string): string {
  if (view === 'month') return monthFormat.format(dayFromKey(day));
  if (view === 'day') return dayFormat.format(dayFromKey(day));
  const { from, to } = rangeFor('week', day);
  return `${dayFormat.format(dayFromKey(from))} – ${dayFormat.format(dayFromKey(to))}`;
}

/**
 * reAFresh · To-Do: a checklist per Jakarta day, at three zoom levels.
 *
 * A checked item is archived rather than removed: it leaves the open list but
 * stays on its day, where it can be restored.
 */
export function TodoScreen({ paneWidth = 'full' }: { paneWidth?: 'full' | 'split' }) {
  const { revision, requestSync } = useSession();
  const today = jakartaDayKey();

  const [view, setView] = useState<View>('day');
  const [day, setDay] = useState(today);
  const [items, setItems] = useState<TodoItemRow[]>([]);
  const [weekAddDay, setWeekAddDay] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Map<string, TodoWithStep['task']>>(new Map());
  const [entries, setEntries] = useState<AgendaEntry[]>([]);
  const narrow = useIsMobile() || paneWidth === 'split';

  const { from, to } = useMemo(() => rangeFor(view, day), [view, day]);

  const latest = useRef(0);

  const reload = useCallback(async () => {
    const request = ++latest.current;
    const rows = await listTodosInRange(from, to);
    const [stepped, found] = await Promise.all([withSteps(rows), readEntriesForDays(from, to)]);
    if (request !== latest.current) return;
    setItems(rows);
    setTasks(new Map(stepped.map((step) => [step.todo.id, step.task])));
    setEntries(found);
  }, [from, to]);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const [saveFailed, setSaveFailed] = useState(false);

  const after = useCallback<After>(
    async (action) => {
      try {
        await action();
        await reload();
        requestSync();
        setSaveFailed(false);
        return true;
      } catch {
        setSaveFailed(true);
        return false;
      }
    },
    [reload, requestSync],
  );

  const drag = useTodoDrag(after);

  const clashes = useMemo(() => findOverlaps(items, entries), [items, entries]);
  const metaOf = useCallback<MetaOf>(
    (id) => ({ task: tasks.get(id) ?? null, clash: clashes.get(id) ?? [] }),
    [tasks, clashes],
  );

  const forDay = (key: string) => items.filter((item) => item.day === key);

  const step = (direction: 1 | -1) =>
    setDay(
      view === 'day'
        ? addDaysToKey(day, direction)
        : view === 'week'
          ? addDaysToKey(day, 7 * direction)
          : addMonths(day, direction),
    );

  const pick = (key: string) => {
    setDay(key);
    setView('day');
  };

  const open = orderForDisplay(forDay(day).filter((item) => !item.checked));
  const archived = orderForDisplay(forDay(day).filter((item) => item.checked));
  const dayTitle = day === today ? 'Today' : dayFormat.format(dayFromKey(day));

  return (
    <div className="page page--tall px-4! py-4! md:px-8! md:py-6! font-sans text-foreground">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1">
          <Button
            variant="raised"
            size="icon"
            className="h-9 w-9 rounded-[8px]"
            aria-label="Previous"
            onClick={() => step(-1)}
          >
            <ChevronLeft size={16} aria-hidden />
          </Button>
          <Button
            variant="raised"
            size="icon"
            className="h-9 w-9 rounded-[8px]"
            aria-label="Next"
            onClick={() => step(1)}
          >
            <ChevronRight size={16} aria-hidden />
          </Button>
        </div>
        <span className="min-w-[12ch] text-[15px] font-medium">{rangeLabel(view, day)}</span>
        <Button
          variant="raised"
          className="h-9 min-h-11 rounded-[8px] text-[13px] md:min-h-9"
          onClick={() => setDay(today)}
        >
          Today
        </Button>
        <Input
          type="date"
          aria-label="Day"
          className="inset-field h-9 w-auto rounded-[8px]"
          value={day}
          onChange={(event) => event.target.value && setDay(event.target.value)}
        />

        <div
          role="group"
          aria-label="View"
          className="inline-flex gap-0.5 rounded-[10px] border border-white/[0.07] bg-[#050506] p-[3px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]"
        >
          {views.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={view === option.id}
              onClick={() => setView(option.id)}
              className={cn(
                'h-8 rounded-[7px] px-3 text-xs font-medium',
                view === option.id ? 'glow-active text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto"
        onInput={() => setSaveFailed(false)}
      >
        {saveFailed && (
          <p role="alert" className="m-0 text-xs text-muted-foreground">
            Could not save, try again
          </p>
        )}
        {view === 'day' && (
          <DayPanel
            day={day}
            title={dayTitle}
            headerAction={<span className="text-xs text-muted-foreground">{open.length} open</span>}
            open={open}
            after={after}
            rowProps={drag.row}
            over={drag.over(day)}
            metaOf={metaOf}
            narrow={narrow}
            archived={archived}
          />
        )}

        {view === 'week' && (
          <div className="surface-3d shrink-0 rounded-2xl">
            {Array.from({ length: 7 }, (_, index) => addDaysToKey(from, index)).map((key) => {
              const dayItems = forDay(key);
              const dayOpen = orderForDisplay(dayItems.filter((item) => !item.checked));
              const indexes = dragIndexes(dayOpen);
              const done = dayItems.length - dayOpen.length;
              const wide = paneWidth !== 'split';
              const isToday = key === today;
              const muted = key < today;
              return (
                <div
                  key={key}
                  data-todo-day={key}
                  className={cn(
                    'group/row grid grid-cols-[56px_minmax(0,1fr)] gap-x-4 border-t border-white/[0.06] px-4 py-4 first:border-t-0',
                    wide && 'md:grid-cols-[92px_minmax(0,1fr)_auto] md:gap-x-5 md:px-5',
                    drag.over(key),
                  )}
                >
                  <button
                    type="button"
                    aria-label={`Open ${dayLongFormat.format(dayFromKey(key))}`}
                    className={cn(
                      'row-span-2 flex flex-col items-start gap-1 self-start rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      wide && 'md:row-span-1',
                    )}
                    onClick={() => pick(key)}
                  >
                    <span
                      className={cn(
                        'text-[11.5px] font-semibold tracking-widest uppercase',
                        isToday ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {weekdayFormat.format(dayFromKey(key))}
                      {wide && isToday && <span className="max-md:hidden"> · Today</span>}
                    </span>
                    <span
                      className={cn(
                        'text-[24px] leading-none font-semibold tabular-nums',
                        wide && 'md:text-[30px]',
                        isToday ? 'text-glow' : muted && 'text-muted-foreground',
                      )}
                    >
                      {dayFromKey(key).getUTCDate()}
                    </span>
                  </button>

                  <div className="flex min-w-0 flex-col gap-2.5">
                    {dayOpen.length === 0 ? (
                      <p data-todo-empty className="m-0 text-[13px] text-muted-foreground">
                        Nothing open.
                      </p>
                    ) : (
                      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-x-6 gap-y-[9px] p-0">
                        {dayOpen.map((item, index) => (
                          <WeekItem
                            key={item.id}
                            item={item}
                            after={after}
                            rowProps={drag.row(item, indexes[index]!)}
                            meta={metaOf(item.id)}
                          />
                        ))}
                      </ul>
                    )}
                    <WeekAdd
                      open={weekAddDay === key}
                      onOpen={() => setWeekAddDay(key)}
                      onClose={() => setWeekAddDay((current) => (current === key ? null : current))}
                      onAdd={(value, time) => after(() => addTodo(value, key, { time }))}
                    />
                  </div>

                  <div
                    className={cn(
                      'col-start-2 mt-2.5 flex flex-wrap items-center gap-3',
                      wide && 'md:col-start-3 md:row-start-1 md:mt-0 md:flex-col md:items-end md:gap-2',
                    )}
                  >
                    {done > 0 && (
                      <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 text-xs font-medium text-muted-foreground">
                        {done} archived
                      </span>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => pick(key)}>
                      Open day
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {view === 'month' && (
          <div className="surface-3d shrink-0 rounded-2xl p-5">
            <span className="text-[15px] font-semibold">{monthFormat.format(dayFromKey(day))}</span>
            <div className="mt-4 grid grid-cols-7 gap-1 text-center">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name) => (
                <span key={name} className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  {name}
                </span>
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-7 gap-1">
              {monthCells(day).map((key, index) => {
                if (!key) return <span key={index} className="min-h-[62px]" />;
                const dayItems = forDay(key);
                const dayOpen = dayItems.filter((item) => !item.checked).length;
                const done = dayItems.length - dayOpen;
                return (
                  <button
                    key={key}
                    type="button"
                    data-todo-day={key}
                    data-todo-append=""
                    className={cn(
                      'flex min-h-[62px] flex-col items-start gap-1 rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-1.5 text-left',
                      key === today && 'border-white/25',
                      key === day && 'glow-active border-white/[0.08]',
                      drag.over(key),
                    )}
                    onClick={() => setDay(key)}
                  >
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full text-[11.5px]',
                        key === today && 'bg-white text-black shadow-[0_0_18px_rgba(255,255,255,0.55)]',
                      )}
                    >
                      {dayFromKey(key).getUTCDate()}
                    </span>
                    {dayOpen > 0 && <span className="text-[10.5px] text-foreground">{dayOpen} open</span>}
                    {done > 0 && <span className="text-[10.5px] text-muted-foreground">{done} archived</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {view === 'month' && (
          <DayPanel
            day={day}
            title={dayTitle}
            headerAction={
              <Button variant="ghost" size="sm" onClick={() => pick(day)}>
                Open day
              </Button>
            }
            open={open}
            after={after}
            rowProps={drag.row}
            over={drag.over(day)}
            metaOf={metaOf}
            narrow={narrow}
            footer={archived.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{archived.length} archived</p>}
          />
        )}
      </div>
      {drag.layer}
    </div>
  );
}

function WeekAdd({
  open,
  onOpen,
  onClose,
  onAdd,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onAdd: (text: string, time: string | null) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const [time, setTime] = useState('');

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="xs"
        className="w-full justify-start border border-dashed border-transparent text-muted-foreground hover:border-white/10 focus-visible:border-white/10"
        onClick={onOpen}
      >
        <Plus size={14} aria-hidden />
        Add an item
      </Button>
    );
  }

  const submit = () => {
    if (!text.trim()) return;
    void onAdd(text, time || null).then((saved) => {
      if (!saved) return;
      setText('');
      setTime('');
    });
  };

  return (
    <div
      className="flex flex-wrap gap-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !text.trim()) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) submit();
      }}
    >
      <Input
        autoFocus
        className="inset-field h-8 min-w-[8rem] flex-1 text-[13px]"
        placeholder="Add an item…"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <Input
        type="time"
        step={300}
        aria-label="Time"
        className="inset-field h-8 w-auto text-[13px]"
        value={time}
        onChange={(event) => setTime(event.target.value)}
      />
      <Button variant="raised" size="sm" disabled={!text.trim()} onClick={submit}>
        Add
      </Button>
    </div>
  );
}

function WeekItem({
  item,
  after,
  rowProps,
  meta,
}: {
  item: TodoItemRow;
  after: After;
  rowProps: RowProps;
  meta: TodoMeta;
}) {
  const chip = meta.clash.length > 0;
  return (
    <li {...rowProps} className={cn('group/item flex items-start gap-2.5', rowProps.className)}>
      <Checkbox
        checked={false}
        onCheckedChange={() => void after(() => toggleTodo(item.id))}
        aria-label={item.text}
        className="inset-field mt-0.5 size-[18px] shrink-0 rounded-[5px] border-white/10 text-white"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm [overflow-wrap:anywhere]">
          {item.time && <span className="mr-1.5 font-semibold text-muted-foreground tabular-nums">{item.time}</span>}
          <span>{item.text}</span>
        </div>
        {(meta.task || chip) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            {meta.task && <StepMark task={meta.task} compact />}
            {chip && <DuringChip clash={meta.clash} />}
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Delete"
        className="shrink-0 opacity-0 group-focus-within/item:opacity-100 group-hover/item:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        onClick={() => void after(() => deleteTodo(item.id))}
      >
        <X size={14} aria-hidden />
      </Button>
    </li>
  );
}
