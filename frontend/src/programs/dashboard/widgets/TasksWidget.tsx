import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { useSession } from '../../../app/session';
import { OptionMark, OptionMenu } from '../../tasks/OptionMenu';
import { optionOfPage, priorityRank, statusPropertyOf, statusUrgency } from '../../tasks/roles';
import {
  findPriorityProperty,
  listPages,
  listProperties,
  prepareTaskData,
  savePageValue,
} from '../../tasks/store';
import { isPageDone } from '../../../data/agenda';
import type { TaskPageRow, TaskPropertyRow } from '../../../data/db';

const emptyOwner = { options: [] };

const optionIndex = (property: TaskPropertyRow | undefined, page: TaskPageRow): number =>
  priorityRank(property ?? emptyOwner, optionOfPage(property, page));

const statusRank = (status: TaskPropertyRow | undefined, page: TaskPageRow): number =>
  statusUrgency(status ?? emptyOwner, optionOfPage(status, page));

/**
 * The single page to work on next, with the few after it.
 *
 * Open pages are ordered by priority (first option highest), then by how far
 * along they are: In progress, then Quality Check, then Not started. "Move to"
 * advances the status one option; "Not now" only skips locally.
 */
export function TasksWidget() {
  const { revision, requestSync } = useSession();
  const [pages, setPages] = useState<TaskPageRow[]>([]);
  const [properties, setProperties] = useState<TaskPropertyRow[]>([]);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [saveFailed, setSaveFailed] = useState(false);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; propertyId: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    await prepareTaskData();
    const nextProperties = await listProperties();
    const nextPages = await listPages();
    if (!alive.current) return;
    setProperties(nextProperties);
    setPages(nextPages);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const status = statusPropertyOf(properties);
  const priority = findPriorityProperty(properties);

  const queue = pages
    .filter((page) => !isPageDone(page, properties))
    .sort(
      (a, b) =>
        optionIndex(priority, a) - optionIndex(priority, b) || statusRank(status, a) - statusRank(status, b),
    );
  const current = queue.find((page) => !skipped.has(page.id)) ?? queue[0];
  const upcoming = queue.filter((page) => page !== current).slice(0, 3);

  const skip = () => {
    if (!current) return;
    const next = new Set(skipped).add(current.id);
    setSkipped(queue.every((page) => next.has(page.id)) ? new Set() : next);
  };

  const set = async (propertyId: string, pageId: string, optionId: string) => {
    try {
      await savePageValue(pageId, propertyId, optionId);
      await reload();
      requestSync();
      if (alive.current) setSaveFailed(false);
    } catch {
      if (alive.current) setSaveFailed(true);
    }
  };

  const statusOption = current && optionOfPage(status, current);
  const priorityOption = current && optionOfPage(priority, current);
  const nextStatus =
    status && statusOption ? status.options[status.options.indexOf(statusOption) + 1] : undefined;
  const menuProperty = menu && properties.find((property) => property.id === menu.propertyId);

  const open = (propertyId: string) => (anchor: HTMLElement) =>
    setMenu((existing) => (existing?.anchor === anchor ? null : { anchor, propertyId }));

  return (
    <div className="flex h-full flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Tasks</h2>
        <span className="text-xs text-muted-foreground">{queue.length} open</span>
      </div>

      {!loaded ? null : !current ? (
        <div className="flex flex-col gap-2">
          <p className="text-[15px] font-semibold">Everything is done.</p>
          <Link to="/tasks" className="text-[13px] text-muted-foreground underline hover:text-foreground">
            Open Task Tracker
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold text-muted-foreground">Do next</span>
            <h3 className="m-0 text-[21px] leading-tight font-semibold">
              <Link to="/tasks" className="text-foreground no-underline hover:text-glow">
                {current.title}
              </Link>
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {priority && priorityOption && (
                <OptionMark
                  property={priority}
                  option={priorityOption}
                  isPriority
                  onClick={(event) => open(priority.id)(event.currentTarget)}
                />
              )}
              {status && statusOption && (
                <OptionMark
                  property={status}
                  option={statusOption}
                  isPriority={false}
                  onClick={(event) => open(status.id)(event.currentTarget)}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {status && nextStatus && (
                <Button size="sm" onClick={() => void set(status.id, current.id, nextStatus.id)}>
                  Move to {nextStatus.label}
                </Button>
              )}
              {queue.length > 1 && (
                <Button variant="raised" size="sm" onClick={skip}>
                  Not now
                </Button>
              )}
            </div>
            {saveFailed && <p className="m-0 text-xs text-destructive">Could not save</p>}
          </div>

          {upcoming.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1.5 border-t border-border p-0 pt-2.5">
              {upcoming.map((page) => (
                <li key={page.id} className="flex items-baseline justify-between gap-2 text-[12.5px]">
                  <span className="min-w-0 [overflow-wrap:anywhere]">{page.title}</span>
                  <span className="shrink-0 text-muted-foreground">{optionOfPage(priority, page)?.label}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {menu && menuProperty && current && (
        <OptionMenu
          anchor={menu.anchor}
          sections={[
            {
              property: menuProperty,
              value: current.values[menuProperty.id],
              isPriority: menuProperty.id === priority?.id,
            },
          ]}
          onClose={() => setMenu(null)}
          onPick={(propertyId, optionId) => {
            setMenu(null);
            void set(propertyId, current.id, optionId);
          }}
        />
      )}
    </div>
  );
}
