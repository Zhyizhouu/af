import { useState, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Input } from '../../components/ui/input';
import type { TodoItemRow } from '../../data/db';
import { addTodo, deleteTodo, toggleTodo } from './store';
import type { After, RowProps } from './useTodoDrag';

interface DayPanelProps {
  day: string;
  title: string;
  headerAction: ReactNode;
  open: TodoItemRow[];
  after: After;
  rowProps: (item: TodoItemRow, index: number) => RowProps;
  over: string;
  archived?: TodoItemRow[];
  footer?: ReactNode;
}

export function DayPanel({ day, title, headerAction, open, after, rowProps, over, archived, footer }: DayPanelProps) {
  const [text, setText] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const submit = () => {
    if (!text.trim()) return;
    void after(() => addTodo(text, day)).then(() => setText(''));
  };

  return (
    <>
      <div data-todo-day={day} className={cn('surface-3d shrink-0 rounded-2xl p-5', over)}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[15px] font-semibold">{title}</span>
          {headerAction}
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
          <p data-todo-empty className="mt-3 text-[13px] text-muted-foreground">
            Nothing open on this day.
          </p>
        ) : (
          <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
            {open.map((item, index) => (
              <TodoRow key={item.id} item={item} after={after} rowProps={rowProps(item, index)} />
            ))}
          </ul>
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
              <ChevronDown size={14} aria-hidden className={cn('transition-transform', showArchived && 'rotate-180')} />
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
  );
}

function TodoRow({ item, after, rowProps }: { item: TodoItemRow; after: After; rowProps?: RowProps }) {
  return (
    <li {...rowProps} className={cn('flex items-center gap-2.5', rowProps?.className)}>
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
