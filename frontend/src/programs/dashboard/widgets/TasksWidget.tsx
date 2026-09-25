import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AFTag } from '../../../components/AF';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { useSession } from '../../../app/session';
import { createPage, listPages, listProperties } from '../../tasks/store';
import type { TaskPageRow, TaskPropertyRow } from '../../../data/db';

const isDone = (page: TaskPageRow, properties: TaskPropertyRow[]): boolean => {
  const status = properties.find((property) => property.type === 'status');
  if (!status) return false;
  const option = status.options.find((candidate) => candidate.id === page.values[status.id]);
  return option?.label.trim().toLowerCase() === 'done';
};

/**
 * Incomplete Task Tracker pages, plus a quick way to add one.
 *
 * Creating a page here never opens `PageDetail` — a dashboard widget is a
 * glance, not a place to land mid-edit.
 */
export function TasksWidget() {
  const { revision, requestSync } = useSession();
  const [pages, setPages] = useState<TaskPageRow[]>([]);
  const [properties, setProperties] = useState<TaskPropertyRow[]>([]);
  const [title, setTitle] = useState('');

  const reload = useCallback(async () => {
    setProperties(await listProperties());
    setPages(await listPages());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const open = pages.filter((page) => !isDone(page, properties));
  const status = properties.find((property) => property.type === 'status');

  const submit = () => {
    if (!title.trim()) return;
    void createPage(title).then(async () => {
      setTitle('');
      await reload();
      requestSync();
    });
  };

  return (
    <div className="flex h-full flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Tasks</h2>
        <span className="text-xs text-muted-foreground">{open.length}</span>
      </div>

      <div className="flex gap-2">
        <Input
          className="inset-field flex-1"
          placeholder="New page…"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
        />
        <Button variant="raised" size="sm" disabled={!title.trim()} onClick={submit}>
          Add
        </Button>
      </div>

      {open.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nothing open. New page above, or in Task Tracker.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {open.slice(0, 8).map((page) => {
            const option = status?.options.find((candidate) => candidate.id === page.values[status.id]);
            return (
              <li key={page.id} className="flex items-center justify-between gap-2.5">
                <Link
                  to="/tasks"
                  className="min-w-0 flex-1 truncate text-sm text-foreground no-underline hover:text-glow"
                >
                  {page.title}
                </Link>
                {option && <AFTag label={option.label} toneIndex={option.toneIndex} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
