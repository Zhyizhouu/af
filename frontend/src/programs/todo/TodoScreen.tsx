import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Input } from '../../components/ui/input';
import { useSession } from '../../app/session';
import type { TodoItemRow } from '../../data/db';
import { dayFromKey, jakartaDayKey, keyFromDay } from '../habits/time';
import { addTodo, deleteTodo, listTodosInRange, toggleTodo } from './store';

type View = 'day' | 'week' | 'month';
type After = (action: () => Promise<unknown>) => Promise<void>;

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
const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

const addDays = (key: string, count: number): string => {
  const day = dayFromKey(key);
  day.setUTCDate(day.getUTCDate() + count);
  return keyFromDay(day);
};

/** Steps whole months, clamping to the last day when the target month is shorter. */
const addMonths = (key: string, count: number): string => {
  const day = dayFromKey(key);
  const target = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + count, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day.getUTCDate(), last));
  return keyFromDay(target);
};

const weekStart = (key: string): string => addDays(key, -((dayFromKey(key).getUTCDay() + 6) % 7));

/** The first and last day keys a view needs loaded around the selected day. */
function rangeFor(view: View, day: string): { from: string; to: string } {
  if (view === 'day') return { from: day, to: day };
  if (view === 'week') {
    const from = weekStart(day);
    return { from, to: addDays(from, 6) };
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
    ...Array.from({ length: count }, (_, i) => addDays(from, i)),
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
  const [text, setText] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [weekAddDay, setWeekAddDay] = useState<string | null>(null);
  const [monthText, setMonthText] = useState('');

  const { from, to } = useMemo(() => rangeFor(view, day), [view, day]);

  const reload = useCallback(async () => {
    setItems(await listTodosInRange(from, to));
  }, [from, to]);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const after = useCallback<After>(
    async (action) => {
      await action();
      await reload();
      requestSync();
    },
    [reload, requestSync],
  );

  const forDay = (key: string) => items.filter((item) => item.day === key);

  const step = (direction: 1 | -1) =>
    setDay(
      view === 'day'
        ? addDays(day, direction)
        : view === 'week'
          ? addDays(day, 7 * direction)
          : addMonths(day, direction),
    );

  const pick = (key: string) => {
    setDay(key);
    setView('day');
  };

  const submit = () => {
    if (!text.trim()) return;
    void after(() => addTodo(text, day)).then(() => setText(''));
  };

  const submitMonth = () => {
    if (!monthText.trim()) return;
    void after(() => addTodo(monthText, day)).then(() => setMonthText(''));
  };

  const open = forDay(day).filter((item) => !item.checked);
  const archived = forDay(day).filter((item) => item.checked);

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

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto">
        {view === 'day' && (
          <>
            <div className="surface-3d shrink-0 rounded-2xl p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[15px] font-semibold">
                  {day === today ? 'Today' : dayFormat.format(dayFromKey(day))}
                </span>
                <span className="text-xs text-muted-foreground">{open.length} open</span>
              </div>

              <div className="flex gap-2">
                <Input
                  className="inset-field flex-1"
                  placeholder="Add an item…"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submit();
                  }}
                />
                <Button variant="raised" size="sm" disabled={!text.trim()} onClick={submit}>
                  Add
                </Button>
              </div>

              {open.length === 0 ? (
                <p className="mt-3 text-[13px] text-muted-foreground">Nothing open on this day.</p>
              ) : (
                <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
                  {open.map((item) => (
                    <TodoRow key={item.id} item={item} after={after} />
                  ))}
                </ul>
              )}
            </div>

            {archived.length > 0 && (
              <div className="surface-3d shrink-0 rounded-2xl p-5">
                <button
                  type="button"
                  aria-expanded={showArchived}
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => setShowArchived((value) => !value)}
                >
                  <span className="text-[15px] font-semibold">Archived</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {archived.length}
                    <ChevronDown
                      size={14}
                      aria-hidden
                      className={cn('transition-transform', showArchived && 'rotate-180')}
                    />
                  </span>
                </button>
                {showArchived && (
                  <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
                    {archived.map((item) => (
                      <TodoRow key={item.id} item={item} after={after} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        {view === 'week' && (
          <div
            className={cn('grid shrink-0 gap-2', paneWidth === 'split' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-7')}
          >
            {Array.from({ length: 7 }, (_, index) => addDays(from, index)).map((key) => {
              const dayItems = forDay(key);
              const dayOpen = dayItems.filter((item) => !item.checked);
              const done = dayItems.length - dayOpen.length;
              return (
                <div
                  key={key}
                  className={cn(
                    'surface-3d flex min-w-0 flex-col gap-2 rounded-2xl border border-transparent p-3',
                    key === today && 'border-white/25',
                  )}
                >
                  <button
                    type="button"
                    className={cn(
                      'text-left text-[13px] font-semibold',
                      key === today ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => pick(key)}
                  >
                    {dayFormat.format(dayFromKey(key))}
                  </button>
                  {dayOpen.length > 0 && (
                    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                      {dayOpen.map((item) => (
                        <li key={item.id} className="flex items-center gap-2">
                          <Checkbox
                            checked={false}
                            onCheckedChange={() => void after(() => toggleTodo(item.id))}
                            aria-label={item.text}
                            className="inset-field size-4 rounded-[5px] border-white/10 text-white"
                          />
                          <span className="min-w-0 flex-1 truncate text-[13px]">{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {done > 0 && <span className="text-[11.5px] text-muted-foreground">{done} archived</span>}
                  <WeekAdd
                    open={weekAddDay === key}
                    onOpen={() => setWeekAddDay(key)}
                    onClose={() => setWeekAddDay((current) => (current === key ? null : current))}
                    onAdd={(value) => after(() => addTodo(value, key))}
                  />
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
                    className={cn(
                      'flex min-h-[62px] flex-col items-start gap-1 rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-1.5 text-left',
                      key === today && 'border-white/25',
                      key === day && 'glow-active border-white/[0.08]',
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
          <div className="surface-3d shrink-0 rounded-2xl p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[15px] font-semibold">
                {day === today ? 'Today' : dayFormat.format(dayFromKey(day))}
              </span>
              <Button variant="ghost" size="sm" onClick={() => pick(day)}>
                Open day
              </Button>
            </div>

            <div className="flex gap-2">
              <Input
                className="inset-field flex-1"
                placeholder="Add an item…"
                value={monthText}
                onChange={(event) => setMonthText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitMonth();
                }}
              />
              <Button variant="raised" size="sm" disabled={!monthText.trim()} onClick={submitMonth}>
                Add
              </Button>
            </div>

            {open.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted-foreground">Nothing open on this day.</p>
            ) : (
              <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
                {open.map((item) => (
                  <TodoRow key={item.id} item={item} after={after} />
                ))}
              </ul>
            )}
            {archived.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{archived.length} archived</p>}
          </div>
        )}
      </div>
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
  onAdd: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');

  if (!open) {
    return (
      <Button variant="ghost" size="xs" className="mt-auto justify-start" onClick={onOpen}>
        <Plus size={14} aria-hidden />
        Add
      </Button>
    );
  }

  return (
    <Input
      autoFocus
      className="inset-field mt-auto h-8 text-[13px]"
      placeholder="Add an item…"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        if (!text.trim()) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
        if (event.key === 'Enter' && text.trim()) void onAdd(text).then(() => setText(''));
      }}
    />
  );
}

function TodoRow({ item, after }: { item: TodoItemRow; after: After }) {
  return (
    <li className="flex items-center gap-2.5">
      <Checkbox
        checked={item.checked}
        onCheckedChange={() => void after(() => toggleTodo(item.id))}
        aria-label={item.text}
        className="inset-field size-[18px] rounded-[5px] border-white/10 text-white data-[state=checked]:border-white/20 data-[state=checked]:bg-white/10"
      />
      <span className={cn('min-w-0 flex-1 truncate text-sm', item.checked && 'text-subtle-foreground line-through')}>
        {item.text}
      </span>
      <Button variant="ghost" size="icon-xs" aria-label="Delete" onClick={() => void after(() => deleteTodo(item.id))}>
        <X size={14} aria-hidden />
      </Button>
    </li>
  );
}
