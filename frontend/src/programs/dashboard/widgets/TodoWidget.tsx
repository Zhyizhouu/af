import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { cn } from 'cn';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { useSession } from '../../../app/session';
import type { TodoItemRow } from '../../../data/db';
import { dayFromKey, jakartaDayKey, keyFromDay } from '../../habits/time';
import { addTodo, deleteTodo, listTodosInRange, toggleTodo } from '../../todo/store';
import { useTodoDrag } from '../../todo/useTodoDrag';

const nextDay = (key: string): string => {
  const day = dayFromKey(key);
  day.setUTCDate(day.getUTCDate() + 1);
  return keyFromDay(day);
};

/** Today's open items with an add box, and tomorrow's faded underneath. Items
 *  drag to reorder and to move between the two days. */
export function TodoWidget() {
  const { revision, requestSync } = useSession();
  const today = jakartaDayKey();
  const tomorrow = nextDay(today);
  const [items, setItems] = useState<TodoItemRow[]>([]);
  const [text, setText] = useState('');

  const reload = useCallback(async () => {
    setItems(await listTodosInRange(today, tomorrow));
  }, [today, tomorrow]);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const after = useCallback(
    async (action: () => Promise<unknown>) => {
      await action();
      await reload();
      requestSync();
    },
    [reload, requestSync],
  );

  const drag = useTodoDrag(after);

  const submit = () => {
    if (!text.trim()) return;
    void after(() => addTodo(text, today)).then(() => setText(''));
  };

  const open = (day: string) => items.filter((item) => item.day === day && !item.checked);
  const todays = open(today);
  const tomorrows = open(tomorrow);

  const list = (rows: TodoItemRow[]) => (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map((item, index) => {
        const rowProps = drag.row(item, index);
        return (
          <li key={item.id} {...rowProps} className={cn('flex items-center gap-2.5', rowProps.className)}>
            <Checkbox
              checked={false}
              onCheckedChange={() => void after(() => toggleTodo(item.id))}
              aria-label={item.text}
              className="inset-field size-[18px] rounded-[5px] border-white/10 text-white data-[state=checked]:border-white/20 data-[state=checked]:bg-white/10"
            />
            <span className="min-w-0 flex-1 truncate text-sm">{item.text}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Delete"
              onClick={() => void after(() => deleteTodo(item.id))}
            >
              <X size={14} aria-hidden />
            </Button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex h-full flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <Link to="/todo" className="text-[15px] font-semibold text-foreground no-underline hover:text-glow">
          To-Do
        </Link>
        <span className="text-xs text-muted-foreground">{todays.length}</span>
      </div>

      <section data-todo-day={today} className={cn('flex flex-col gap-2.5 rounded-lg', drag.over(today))}>
        <h3 className="m-0 text-xs font-medium text-muted-foreground">Today</h3>
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
        {todays.length === 0 ? (
          <p data-todo-empty className="m-0 text-[13px] text-muted-foreground">
            Nothing on the list.
          </p>
        ) : (
          list(todays)
        )}
      </section>

      <section
        data-todo-day={tomorrow}
        className={cn('flex flex-col gap-2.5 rounded-lg', drag.over(tomorrow) || 'opacity-50')}
      >
        <h3 className="m-0 text-xs font-medium text-muted-foreground">Tomorrow</h3>
        {tomorrows.length === 0 ? (
          <p data-todo-empty className="m-0 text-[13px] text-muted-foreground">
            Nothing yet.
          </p>
        ) : (
          list(tomorrows)
        )}
      </section>
      {drag.layer}
    </div>
  );
}
