import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import type { TaskPageRow, TodoItemRow } from '../../data/db';
import { dayFromKey, jakartaDayKey } from '../habits/time';
import { addTodo, deleteTodo, listStepsForTask, toggleTodo } from '../todo/store';

interface Step {
  todo: TodoItemRow;
  index: number;
}

const dayParts = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

function dayLabel(key: string, withMonth: boolean): string {
  const parts = dayParts.formatToParts(dayFromKey(key));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return [part('weekday'), part('day'), withMonth ? part('month') : ''].filter(Boolean).join(' ');
}

export function PageSteps({ page, onChange }: { page: TaskPageRow; onChange: () => void }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [text, setText] = useState('');
  const [day, setDay] = useState(jakartaDayKey());
  const [time, setTime] = useState('');
  const [failed, setFailed] = useState(false);
  const today = jakartaDayKey();

  const load = useCallback(async () => {
    const stepped = await listStepsForTask(page.id);
    return stepped.flatMap(({ todo, task }) => (task ? [{ todo, index: task.index }] : []));
  }, [page.id]);

  useEffect(() => {
    let cancelled = false;
    void load().then((next) => {
      if (!cancelled) setSteps(next);
    });
    return () => {
      cancelled = true;
    };
  }, [load, page.updatedAt]);

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    try {
      await action();
      setSteps(await load());
      onChange();
      setFailed(false);
      return true;
    } catch {
      setFailed(true);
      return false;
    }
  };

  const submit = () => {
    if (!text.trim() || !day) return;
    void run(() => addTodo(text, day, { taskId: page.id, time: time || null })).then((saved) => {
      if (!saved) return;
      setText('');
      setTime('');
    });
  };

  const done = steps.filter((step) => step.todo.checked).length;
  const current = steps.find((step) => !step.todo.checked)?.todo.id;

  return (
    <section aria-label="Steps" className="mb-6">
      <div className="flex items-baseline justify-between gap-3">
        <span className="tsk__field-label">Steps</span>
        {steps.length > 0 && (
          <span className="pt-2 text-xs text-muted-foreground tabular-nums">
            {done} of {steps.length} steps done
          </span>
        )}
      </div>

      {steps.length === 0 ? (
        <p className="m-0 mt-1 mb-3 text-[13px] text-muted-foreground">Split this task into steps on different days.</p>
      ) : (
        <>
          <div aria-hidden className="mt-2 mb-3 flex gap-1">
            {steps.map(({ todo }) => (
              <i
                key={todo.id}
                className={cn(
                  'h-[5px] flex-1 rounded-full border',
                  todo.checked ? 'border-[var(--af-ok)] bg-[var(--af-ok)]' : 'border-border bg-[var(--af-sunken)]',
                )}
              />
            ))}
          </div>
          <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
            {steps.map(({ todo, index }, at) => (
              <li
                key={todo.id}
                className="group/step relative grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-x-2.5 py-2"
              >
                {at < steps.length - 1 && (
                  <span aria-hidden className="absolute top-7 -bottom-2.5 left-2.5 w-0.5 bg-border" />
                )}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={todo.checked}
                  aria-label={`Step ${index}: ${todo.text}`}
                  className={cn(
                    'relative z-[1] grid size-[22px] place-items-center rounded-full border-2 text-[11px] leading-none font-bold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    todo.checked
                      ? 'border-[var(--af-ok)] bg-[var(--af-ok)] text-card'
                      : todo.id === current
                        ? 'border-[var(--af-accent)] bg-card text-[var(--af-accent)]'
                        : 'border-input bg-card text-subtle-foreground',
                  )}
                  onClick={() => void run(() => toggleTodo(todo.id))}
                >
                  {index}
                </button>
                <div className="min-w-0">
                  <div className={cn('text-sm font-medium [overflow-wrap:anywhere]', todo.checked && 'text-subtle-foreground line-through')}>
                    {todo.text}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {dayLabel(todo.day, true)} · {todo.checked ? 'done' : (todo.time ?? 'any time')}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full border border-border bg-[var(--af-sunken)] px-2 py-px text-xs font-semibold whitespace-nowrap text-muted-foreground tabular-nums">
                    {todo.day === today ? 'Today' : dayLabel(todo.day, false)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Delete step"
                    className="opacity-0 transition-opacity group-focus-within/step:opacity-100 group-hover/step:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100"
                    onClick={() => void run(() => deleteTodo(todo.id))}
                  >
                    <X size={14} aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {failed && (
        <p role="alert" className="m-0 mt-2 text-xs text-muted-foreground">
          Could not save, try again
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <Input
          className="inset-field min-w-[8rem] flex-1 rounded-[10px]"
          placeholder="Add a step…"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setFailed(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
        />
        <Input
          type="date"
          aria-label="Day"
          className="inset-field w-auto rounded-[10px]"
          value={day}
          onChange={(event) => setDay(event.target.value)}
        />
        <Input
          type="time"
          step={300}
          aria-label="Time"
          className="inset-field w-auto rounded-[10px]"
          value={time}
          onChange={(event) => setTime(event.target.value)}
        />
        <Button variant="raised" size="sm" className="h-9" disabled={!text.trim() || !day} onClick={submit}>
          Add
        </Button>
      </div>
    </section>
  );
}
