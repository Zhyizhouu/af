import { useCallback, useEffect, useState } from 'react';
import { AFButton, AFHint, AFIconButton, AFPanel } from '../../../components/AF';
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
    <AFPanel label="To-do" count={`${items.filter((item) => !item.checked).length}`}>
      <div className="dash__task-add">
        <input
          className="af-input af-input--prose"
          placeholder="Add an item…"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
        />
        <AFButton label="Add" variant="quiet" disabled={!text.trim()} onClick={submit} />
      </div>

      {items.length === 0 ? (
        <AFHint>Nothing on the list.</AFHint>
      ) : (
        <ul className="dash__todos">
          {items.map((item) => (
            <li key={item.id} className="dash__todo">
              <button
                type="button"
                className={`dash__todo-tick${item.checked ? ' is-done' : ''}`}
                aria-pressed={item.checked}
                onClick={() => void after(() => toggleTodo(item.id))}
              />
              <span className={`af-body dash__todo-text${item.checked ? ' is-done' : ''}`}>{item.text}</span>
              <AFIconButton
                glyph="✕"
                tooltip="Delete"
                bordered={false}
                onClick={() => void after(() => deleteTodo(item.id))}
              />
            </li>
          ))}
        </ul>
      )}
    </AFPanel>
  );
}
