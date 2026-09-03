import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AFButton, AFHint, AFPanel, AFTag } from '../../../components/AF';
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
    <AFPanel label="Tasks" count={`${open.length}`}>
      <div className="dash__task-add">
        <input
          className="af-input af-input--prose"
          placeholder="New page…"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
        />
        <AFButton label="Add" variant="quiet" disabled={!title.trim()} onClick={submit} />
      </div>

      {open.length === 0 ? (
        <AFHint>Nothing open. New page above, or in Task Tracker.</AFHint>
      ) : (
        <ul className="dash__tasks">
          {open.slice(0, 8).map((page) => {
            const option = status?.options.find((candidate) => candidate.id === page.values[status.id]);
            return (
              <li key={page.id} className="dash__task">
                <Link to="/tasks" className="af-body dash__task-title">
                  {page.title}
                </Link>
                {option && <AFTag label={option.label} toneIndex={option.toneIndex} />}
              </li>
            );
          })}
        </ul>
      )}
    </AFPanel>
  );
}
