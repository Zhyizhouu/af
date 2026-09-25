import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from 'cn';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { useSession } from '../../../app/session';
import type { TodoItemRow } from '../../../data/db';
import { addTodo, deleteTodo, listTodos, toggleTodo } from '../todoStore';

export function TodoWidget() {
  const { revision, requestSync } = useSession();
  const [items, setItems] = useState<TodoItemRow[]>([]);
  const [text, setText] = useState('');

  const reload = useCallback(async () => {
    setItems(await listTodos());
  }, []);

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

  const submit = () => {
    if (!text.trim()) return;
    void after(() => addTodo(text)).then(() => setText(''));
  };

  return (
    <div className="flex h-full flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">To-do</h2>
        <span className="text-xs text-muted-foreground">{items.filter((item) => !item.checked).length}</span>
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

      {items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nothing on the list.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2.5">
              <Checkbox
                checked={item.checked}
                onCheckedChange={() => void after(() => toggleTodo(item.id))}
                aria-label={item.text}
                className="inset-field size-[18px] rounded-[5px] border-white/10 text-white data-[state=checked]:border-white/20 data-[state=checked]:bg-white/10"
              />
              <span
                className={cn('min-w-0 flex-1 truncate text-sm', item.checked && 'text-subtle-foreground line-through')}
              >
                {item.text}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Delete"
                onClick={() => void after(() => deleteTodo(item.id))}
              >
                <X size={14} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
