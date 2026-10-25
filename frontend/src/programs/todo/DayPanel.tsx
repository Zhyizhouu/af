import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Input } from '../../components/ui/input';
import type { AgendaEntry } from '../../data/agenda';
import type { TodoItemRow } from '../../data/db';
import { entryEnd } from '../../data/overlap';
import { jakartaClock } from '../habits/time';
import { StepMark } from './StepMark';
import { addTodo, deleteTodo, setTodoTime, toggleTodo, type TodoWithStep } from './store';
import type { After, RowProps } from './useTodoDrag';

export interface TodoMeta {
  task: TodoWithStep['task'];
  clash: AgendaEntry[];
}

export type MetaOf = (id: string) => TodoMeta;

const accent = 'text-[var(--af-accent)]';

/** The drag index of each row of an `orderForDisplay` list: untimed rows count up from 0, and every timed row shares the index after them, so timed rows cannot be reordered. */
export function dragIndexes(rows: TodoItemRow[]): number[] {
  const untimed = rows.filter((row) => !row.time).length;
  let next = 0;
  return rows.map((row) => (row.time ? untimed : next++));
}

export function DuringChip({ clash }: { clash: AgendaEntry[] }) {
  const first = clash[0];
  if (!first) return null;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 font-semibold', accent)}>
      <span aria-hidden className="size-2 shrink-0 rounded-[2px] bg-[var(--af-accent)]" />
      <span className="truncate">{`during ${first.title}${clash.length > 1 ? ` +${clash.length - 1}` : ''}`}</span>
    </span>
  );
}

interface DayPanelProps {
  day: string;
  title: string;
  headerAction: ReactNode;
  open: TodoItemRow[];
  after: After;
  rowProps: (item: TodoItemRow, index: number) => RowProps;
  over: string;
  metaOf: MetaOf;
  narrow: boolean;
  archived?: TodoItemRow[];
  footer?: ReactNode;
}

export function DayPanel({
  day,
  title,
  headerAction,
  open,
  after,
  rowProps,
  over,
  metaOf,
  narrow,
  archived,
  footer,
}: DayPanelProps) {
  const [text, setText] = useState('');
  const [time, setTime] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const submit = () => {
    if (!text.trim()) return;
    void after(() => addTodo(text, day, { time: time || null })).then((saved) => {
      if (!saved) return;
      setText('');
      setTime('');
    });
  };

  const indexes = dragIndexes(open);
  const clashes = (item: TodoItemRow) => !narrow && !!item.time && metaOf(item.id).clash.length > 0;
  const blocks: ReactNode[] = [];
  for (let at = 0; at < open.length; ) {
    const item = open[at]!;
    let size = 1;
    if (clashes(item)) {
      while (open[at + size]?.time === item.time && clashes(open[at + size]!)) size += 1;
      blocks.push(
        <ClashBlock
          key={item.id}
          group={open.slice(at, at + size)}
          indexes={indexes.slice(at, at + size)}
          after={after}
          rowProps={rowProps}
          metaOf={metaOf}
        />,
      );
    } else {
      blocks.push(
        <TodoRow
          key={item.id}
          item={item}
          after={after}
          rowProps={rowProps(item, indexes[at]!)}
          meta={metaOf(item.id)}
          narrow={narrow}
        />,
      );
    }
    at += size;
  }

  return (
    <>
      <div data-todo-day={day} className={cn('surface-3d shrink-0 rounded-2xl p-5', over)}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[15px] font-semibold">{title}</span>
          {headerAction}
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            className="inset-field min-w-[8rem] flex-1"
            placeholder="Add an item…"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
            }}
          />
          <Input
            type="time"
            step={300}
            aria-label="Time"
            className="inset-field w-auto"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
            }}
          />
          <Button variant="raised" size="sm" className="h-9" disabled={!text.trim()} onClick={submit}>
            Add
          </Button>
        </div>

        {open.length === 0 ? (
          <p data-todo-empty className="mt-3 text-[13px] text-muted-foreground">
            Nothing open on this day.
          </p>
        ) : (
          <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">{blocks}</ul>
        )}
        {footer}
      </div>

      {archived && archived.length > 0 && (
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
              <ChevronDown size={14} aria-hidden className={cn('transition-transform motion-reduce:transition-none', showArchived && 'rotate-180')} />
            </span>
          </button>
          {showArchived && (
            <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
              {archived.map((item) => (
                <TodoRow key={item.id} item={item} after={after} meta={metaOf(item.id)} narrow />
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

function TimeCell({
  time,
  label,
  muted,
  tone,
  onCommit,
}: {
  time: string | null;
  label: string;
  muted?: boolean;
  tone?: 'accent';
  onCommit: (next: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(time ?? '');
  const skip = useRef(false);

  const commit = (input: HTMLInputElement) => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    setEditing(false);
    const { badInput, valid } = input.validity;
    if (badInput || (draft === '' && !valid)) return;
    if (draft !== (time ?? '')) onCommit(draft || null);
  };

  if (editing) {
    return (
      <Input
        autoFocus
        type="time"
        step={300}
        aria-label="Time"
        className="inset-field relative z-10 -mt-1 h-7 w-[6.5rem] px-1.5 text-xs"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(event.currentTarget);
          if (event.key === 'Escape') {
            event.stopPropagation();
            skip.current = true;
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={`${time ?? 'Set time'} for ${label}`}
      className={cn(
        'h-5 w-full rounded-sm text-left text-[12.5px] leading-5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        time ? 'font-semibold text-muted-foreground tabular-nums' : 'text-[11.5px] text-subtle-foreground',
        muted && 'opacity-60',
        tone === 'accent' && time && accent,
      )}
      onClick={() => {
        skip.current = false;
        setDraft(time ?? '');
        setEditing(true);
      }}
    >
      {time ?? 'Any time'}
    </button>
  );
}

function RowBody({ item, meta, narrow }: { item: TodoItemRow; meta: TodoMeta; narrow: boolean }) {
  const chip = narrow && !item.checked && meta.clash.length > 0;
  return (
    <div className="min-w-0">
      <span className={cn('block truncate text-sm', item.checked && 'text-subtle-foreground line-through')}>{item.text}</span>
      {(meta.task || chip) && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          {meta.task && <StepMark task={meta.task} />}
          {chip && <DuringChip clash={meta.clash} />}
        </div>
      )}
    </div>
  );
}

function TodoRow({
  item,
  after,
  rowProps,
  meta,
  narrow,
  grouped,
}: {
  item: TodoItemRow;
  after: After;
  rowProps?: RowProps;
  meta: TodoMeta;
  narrow: boolean;
  grouped?: boolean;
}) {
  return (
    <li
      {...rowProps}
      className={cn(
        'grid items-start gap-x-2.5',
        grouped ? 'grid-cols-[18px_minmax(0,1fr)_auto]' : 'grid-cols-[44px_18px_minmax(0,1fr)_auto]',
        rowProps?.className,
      )}
    >
      {!grouped && (
        <TimeCell
          time={item.time ?? null}
          label={item.text}
          muted={item.checked}
          onCommit={(next) => void after(() => setTodoTime(item.id, next))}
        />
      )}
      <Checkbox
        checked={item.checked}
        onCheckedChange={() => void after(() => toggleTodo(item.id))}
        aria-label={item.text}
        className="inset-field mt-px size-[18px] rounded-[5px] border-white/10 text-white data-[state=checked]:border-white/20 data-[state=checked]:bg-white/10"
      />
      <RowBody item={item} meta={meta} narrow={narrow} />
      <Button variant="ghost" size="icon-xs" aria-label="Delete" onClick={() => void after(() => deleteTodo(item.id))}>
        <X size={14} aria-hidden />
      </Button>
    </li>
  );
}

function ClashBlock({
  group,
  indexes,
  after,
  rowProps,
  metaOf,
}: {
  group: TodoItemRow[];
  indexes: number[];
  after: After;
  rowProps: (item: TodoItemRow, index: number) => RowProps;
  metaOf: MetaOf;
}) {
  const entries = new Map<string, AgendaEntry>();
  for (const item of group) for (const entry of metaOf(item.id).clash) entries.set(entry.id, entry);
  const refs = [...entries.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
  const time = group[0]!.time ?? null;

  return (
    <li className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-2.5">
      <TimeCell
        time={time}
        label={group.map((item) => item.text).join(', ')}
        tone="accent"
        onCommit={(next) => void after(() => Promise.all(group.map((item) => setTodoTime(item.id, next))))}
      />
      <div className="-ml-3 flex min-w-0 flex-col gap-1.5 border-l-2 border-[var(--af-accent)] pl-2.5">
        <span className={cn('text-[11px] leading-5 font-semibold tracking-wider uppercase', accent)}>
          {group.length + refs.length} at once
        </span>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {group.map((item, index) => (
            <TodoRow
              key={item.id}
              item={item}
              after={after}
              rowProps={rowProps(item, indexes[index]!)}
              meta={metaOf(item.id)}
              narrow={false}
              grouped
            />
          ))}
        </ul>
        {refs.map((entry) => (
          <div key={entry.id} className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-2.5 text-[13px] text-muted-foreground">
            <span aria-hidden className="h-[18px] w-[3px] justify-self-center rounded-sm bg-[var(--af-accent)]" />
            <div className="min-w-0">
              <span>{entry.title}</span> <span className="tabular-nums">{`until ${jakartaClock(entryEnd(entry))}`}</span>
            </div>
          </div>
        ))}
      </div>
    </li>
  );
}
