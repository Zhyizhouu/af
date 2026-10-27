import { Fragment } from 'react';
import { Check } from 'lucide-react';
import { cn } from 'cn';
import { Checkbox } from '../../components/ui/checkbox';
import { StepMark } from '../todo/StepMark';
import type { TodoWithStep } from '../todo/store';

/** The shortest a to-do block is drawn, in px. The wide layout packs by this
 *  height, so the two must not drift apart. */
export const todoMinHeight = 40;

export const dashed = 'border border-dashed border-white/20';

/**
 * A group of timed to-dos shown as one pill in a narrow grid: either those
 * running during an event (`when` is "during {title}") or, in the compact week,
 * those within one hour. `top` and `edge` (a right edge, as a percent of the
 * day column) place the pill. `todos` is everything the pill counts; `around`
 * is the part of it that is not running during the event but shares its hour
 * (the panel lists those apart, under "Around HH:00").
 */
export interface Dock {
  id: string;
  kind: 'event' | 'hour';
  hour: number;
  when: string;
  todos: TodoWithStep[];
  around: TodoWithStep[];
  top: number;
  edge: number;
}

const touchTarget =
  'relative after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2';

/**
 * The to-do's checkbox. In a narrow (touch) layout its hit area grows to
 * 44px square through a pseudo-element, so the box keeps its drawn size.
 */
export function TickBox({
  item,
  onTick,
  touch,
  className,
}: {
  item: TodoWithStep;
  onTick: (id: string) => void;
  touch?: boolean;
  className?: string;
}) {
  return (
    <Checkbox
      checked={item.todo.checked}
      onCheckedChange={() => onTick(item.todo.id)}
      aria-label={item.todo.text}
      className={cn(
        'inset-field border-white/10 text-white data-[state=checked]:border-white/20 data-[state=checked]:bg-white/10',
        touch && touchTarget,
        className,
      )}
    />
  );
}

/** A to-do's text: muted and struck through once ticked, truncated to one line. */
export function TodoText({ item, className }: { item: TodoWithStep; className?: string }) {
  return (
    <span
      className={cn(
        'block min-w-0 truncate',
        item.todo.checked && 'text-muted-foreground line-through',
        className,
      )}
    >
      {item.todo.text}
    </span>
  );
}

/** A to-do drawn as a dashed block in its own lane beside the events. */
export function TodoBlock({
  item,
  top,
  place,
  past,
  touch,
  onTick,
}: {
  item: TodoWithStep;
  top: number;
  place: { left: string; width: string };
  past: boolean;
  touch: boolean;
  onTick: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        'absolute flex items-center gap-1.5 overflow-hidden rounded-lg px-2 py-1 text-[12px]',
        dashed,
        past && 'opacity-50',
      )}
      style={{ top, minHeight: todoMinHeight, ...place }}
      title={item.todo.text}
    >
      <TickBox item={item} onTick={onTick} touch={touch} className="size-[15px] rounded-[4px]" />
      <span className="min-w-0 flex-1">
        <TodoText item={item} />
        <TodoStep item={item} />
      </span>
    </div>
  );
}

/**
 * The count pill that stands for a dock's to-dos. Its hit area is padded out
 * to 44px with a pseudo-element, without growing the drawn pill.
 */
export function DockPill({
  dock,
  open,
  panelId,
  onToggle,
}: {
  dock: Dock;
  open: boolean;
  panelId: string;
  onToggle: () => void;
}) {
  const allDone = dock.todos.every((item) => item.todo.checked);
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      aria-label={`${dock.todos.length} to-do${dock.todos.length === 1 ? '' : 's'} ${dock.when}`}
      onClick={onToggle}
      className={cn(
        'raised absolute z-[2] inline-flex min-h-6 items-center gap-1.5 rounded-full border-white/20 px-2 text-[11.5px] font-bold text-muted-foreground',
        'before:absolute before:-inset-x-1.5 before:-inset-y-2.5',
        open && 'text-foreground',
      )}
      style={{
        top: dock.top,
        left: `calc(${dock.edge}% - 6px)`,
        transform: 'translateX(-100%)',
        borderStyle: 'dashed',
        borderWidth: '1.5px',
      }}
    >
      <span className="inset-field flex size-3.5 items-center justify-center rounded-[4px]">
        {allDone && <Check size={10} aria-hidden />}
      </span>
      {dock.todos.length}
    </button>
  );
}

/** A to-do's task step mark, or nothing for a standalone to-do. */
export function TodoStep({ item, className }: { item: TodoWithStep; className?: string }) {
  if (!item.task) return null;
  return (
    <span className={cn('flex items-center gap-1.5 text-[11px] text-muted-foreground', className)}>
      <StepMark task={item.task} compact />
    </span>
  );
}

/** The list a dock pill opens, with each to-do tickable. */
export function DockPanel({
  dock,
  id,
  onTick,
}: {
  dock: Dock;
  id: string;
  onTick: (id: string) => void;
}) {
  const aroundIds = new Set(dock.around.map((item) => item.todo.id));
  const hour = dock.around[0]?.todo.time?.slice(0, 2);
  const sections = [
    { when: dock.when, items: dock.todos.filter((item) => !aroundIds.has(item.todo.id)) },
    { when: `around ${hour}:00`, items: dock.around },
  ].filter((section) => section.items.length > 0);
  return (
    <div id={id} className="border-t border-white/[0.07] bg-white/[0.02] px-4 py-3">
      {sections.map((section) => (
        <Fragment key={section.items === dock.around ? 'around' : 'during'}>
          <span className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase not-first:mt-2">
            {section.when.charAt(0).toUpperCase() + section.when.slice(1)}
          </span>
          <ul className="mt-2 flex flex-col">
            {section.items.map((item) => (
              <li key={item.todo.id} className="flex min-h-11 min-w-0 items-center gap-2 text-[13px]">
                <TickBox item={item} onTick={onTick} touch className="size-[18px] rounded-[5px]" />
                <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">
                  {item.todo.time}
                </span>
                <TodoText item={item} className="flex-1" />
                <TodoStep item={item} className="shrink-0" />
              </li>
            ))}
          </ul>
        </Fragment>
      ))}
    </div>
  );
}
