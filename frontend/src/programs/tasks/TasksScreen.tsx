import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FileText, Maximize2, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { cn } from 'cn';
import { useSession } from '../../app/session';
import { tintStyle, toneColor } from '../../data/tones';
import type { TaskPageRow, TaskPropertyOption, TaskPropertyRow } from '../../data/db';
import type { TaskCommandResult } from './command';
import { CommandBar } from './CommandBar';
import { formatDateValue } from './dateValue';
import { FilterPanel } from './FilterPanel';
import { OptionMark, OptionMenu, type MenuSection } from './OptionMenu';
import { PageDetail } from './PageDetail';
import { PropertyPanel } from './PropertyPanel';
import { safeUrl } from './sanitize';
import {
  createPage,
  deletePage,
  findPriorityProperty,
  listPages,
  listProperties,
  matchesFilters,
  prepareTaskData,
  savePageValue,
  seedDefaultProperties,
  type PropertyFilter,
} from './store';
import { TriageGrid } from './TriageGrid';
import { useTriageDrag } from './useTriageDrag';
import './tasks.css';

type OpenPage = { id: string; mode: 'peek' | 'fullscreen' };
type View = 'console' | 'table';
type MenuState = { anchor: HTMLElement; pageId: string; propertyIds: string[]; withOpen: boolean };

const viewStorageKey = 'af.tasks.view';

const loadView = (): View => {
  try {
    return localStorage.getItem(viewStorageKey) === 'table' ? 'table' : 'console';
  } catch {
    return 'console';
  }
};

const saveView = (view: View) => {
  try {
    localStorage.setItem(viewStorageKey, view);
  } catch {
    return;
  }
};

/**
 * reAFresh · Task Tracker: user-defined "pages", each one a task with typed,
 * CRUD-able properties, shown either as a triage console (a priority-by-status
 * grid under a quick-add command line) or as a table. A page's own detail
 * view is built once and rendered in two containers (side-peek or fullscreen)
 * rather than twice.
 */
export function TasksScreen({ paneWidth = 'full' }: { paneWidth?: 'full' | 'split' }) {
  const { revision, requestSync } = useSession();

  const [properties, setProperties] = useState<TaskPropertyRow[]>([]);
  const [pages, setPages] = useState<TaskPageRow[]>([]);
  const [openPage, setOpenPage] = useState<OpenPage | null>(null);
  const [showProperties, setShowProperties] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<PropertyFilter[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [view, setView] = useState<View>(loadView);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const reload = useCallback(async () => {
    await seedDefaultProperties();
    await prepareTaskData();
    setProperties(await listProperties());
    setPages(await listPages());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const commit = useCallback(
    async (action: () => Promise<unknown>) => {
      await action();
      await reload();
      requestSync();
    },
    [reload, requestSync],
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  const visiblePages = pages.filter((page) => matchesFilters(page, filters));
  const openPageRow = openPage ? pages.find((page) => page.id === openPage.id) : undefined;
  const status = properties.find((property) => property.type === 'status');
  const priority = findPriorityProperty(properties);
  const drag = useTriageDrag(commit, priority, status);

  const chooseView = (next: View) => {
    setView(next);
    saveView(next);
    setMenu(null);
  };

  const toggleMenu = (next: MenuState) =>
    setMenu((current) => (current?.anchor === next.anchor ? null : next));

  const createFromCommand = async (command: TaskCommandResult) => {
    let pageId = '';
    await commit(async () => {
      const page = await createPage(command.title);
      pageId = page.id;
      if (status && command.statusId) await savePageValue(page.id, status.id, command.statusId);
      if (priority && command.priorityId) await savePageValue(page.id, priority.id, command.priorityId);
    });
    return pageId;
  };

  const menuPage = menu ? pages.find((page) => page.id === menu.pageId) : undefined;
  const menuSections: MenuSection[] = menu && menuPage
    ? menu.propertyIds.flatMap((id) => {
        const property = properties.find((candidate) => candidate.id === id);
        return property
          ? [{ property, value: menuPage.values[id], isPriority: property.id === priority?.id }]
          : [];
      })
    : [];

  return (
    <div className={`page page--tall tsk font-sans text-foreground px-4! py-4! md:px-8! md:py-6!${paneWidth === 'split' ? ' tsk--split' : ''}`}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-[15px] font-semibold text-foreground">Task Tracker</h1>
          <span className="text-xs text-muted-foreground">
            {pages.length} {pages.length === 1 ? 'page' : 'pages'} · {properties.length}{' '}
            {properties.length === 1 ? 'property' : 'properties'}
          </span>
        </div>
        <div className="tsk-seg" role="group" aria-label="View">
          {(['console', 'table'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => chooseView(option)}
            >
              {option === 'console' ? 'Console' : 'Table'}
            </button>
          ))}
        </div>
      </div>

      <div className="tsk__bar">
        <Button variant="raised" onClick={() => setShowFilters(true)}>
          <SlidersHorizontal size={16} aria-hidden />
          {filters.length > 0 ? `Filter (${filters.length})` : 'Filter'}
        </Button>
        <Button variant="raised" onClick={() => setShowProperties(true)}>
          Properties
        </Button>
      </div>

      {drag.layer}
      <CommandBar
        properties={properties}
        pages={pages}
        drag={drag}
        commit={commit}
        onSubmit={createFromCommand}
        onOpen={(id) => setOpenPage({ id, mode: 'peek' })}
      />

      {pages.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No pages yet. Type a title above to add one.</p>
      ) : view === 'console' ? (
        <TriageGrid
          pages={visiblePages}
          properties={properties}
          drag={drag}
          onChip={(page, anchor) =>
            toggleMenu({
              anchor,
              pageId: page.id,
              propertyIds: [status?.id, priority?.id].filter((id): id is string => Boolean(id)),
              withOpen: true,
            })
          }
        />
      ) : (
        <div className="tsk__table-wrap surface-3d">
          <table className="tsk__table">
            <thead>
              <tr>
                <th className="tsk__col-title">Page</th>
                {properties.map((property) => (
                  <th key={property.id} className={`tsk__col--${property.type}`}>
                    {property.name}
                  </th>
                ))}
                <th className="tsk__col-actions" />
              </tr>
            </thead>
            <tbody>
              {visiblePages.map((page) => (
                <tr key={page.id}>
                  <td className="tsk__col-title">
                    <div className="tsk__title-row">
                      <button
                        type="button"
                        className="tsk__title-open"
                        onClick={() => setOpenPage({ id: page.id, mode: 'peek' })}
                      >
                        <span className="tsk__icon">
                          {page.icon?.kind === 'upload' ? (
                            <img src={page.icon.value} alt="" className="tsk__icon-img" />
                          ) : page.icon?.kind === 'preset' ? (
                            page.icon.value
                          ) : (
                            <FileText size={16} aria-hidden />
                          )}
                        </span>
                        <span className="af-body">{page.title}</span>
                      </button>
                      <span className="tsk__peek-actions">
                        <button
                          type="button"
                          className="tsk__peek-open"
                          aria-label="Open with side peek"
                          title="Open with side peek"
                          onClick={() => setOpenPage({ id: page.id, mode: 'peek' })}
                        >
                          <Maximize2 size={13} aria-hidden />
                        </button>
                      </span>
                    </div>
                  </td>

                  {properties.map((property) => (
                    <td key={property.id} className={`tsk__col--${property.type}`}>
                      {renderCell(property, page.values[property.id], property.id === priority?.id, (anchor) =>
                        toggleMenu({ anchor, pageId: page.id, propertyIds: [property.id], withOpen: false }),
                      )}
                    </td>
                  ))}

                  <td className="tsk__col-actions">
                    <button
                      type="button"
                      className={cn('tsk__delete', confirmingDelete === page.id && 'is-confirming')}
                      aria-label={confirmingDelete === page.id ? 'Really delete' : 'Delete page'}
                      title={confirmingDelete === page.id ? 'Really delete' : 'Delete page'}
                      onClick={() =>
                        confirmingDelete === page.id
                          ? void commit(() => deletePage(page.id))
                          : setConfirmingDelete(page.id)
                      }
                    >
                      <X size={14} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {menu && menuPage && (
        <OptionMenu
          anchor={menu.anchor}
          sections={menuSections}
          priorityStyle="text"
          onClose={closeMenu}
          onPick={(propertyId, optionId) => {
            closeMenu();
            void commit(() => savePageValue(menu.pageId, propertyId, optionId));
          }}
          onOpenPage={
            menu.withOpen
              ? () => {
                  closeMenu();
                  setOpenPage({ id: menu.pageId, mode: 'peek' });
                }
              : undefined
          }
        />
      )}

      {openPage && openPageRow && (
        <PageDetail
          page={openPageRow}
          properties={properties}
          mode={openPage.mode}
          onClose={() => setOpenPage(null)}
          onFullscreen={() => setOpenPage({ id: openPage.id, mode: 'fullscreen' })}
          onExitFullscreen={() => setOpenPage({ id: openPage.id, mode: 'peek' })}
          onChange={() => {
            void reload();
            requestSync();
          }}
        />
      )}

      {showProperties && (
        <PropertyPanel
          properties={properties}
          onClose={() => setShowProperties(false)}
          onChange={() => {
            void reload();
            requestSync();
          }}
        />
      )}

      {showFilters && (
        <FilterPanel
          properties={properties}
          filters={filters}
          onChange={setFilters}
          onClose={() => setShowFilters(false)}
        />
      )}
    </div>
  );
}

/** One switch, not eight components: each type's cell is a couple of lines. */
function renderCell(
  property: TaskPropertyRow,
  value: unknown,
  isPriority: boolean,
  onOpenMenu: (anchor: HTMLElement) => void,
): ReactNode {
  switch (property.type) {
    case 'text':
      return <span className="af-body tsk__cell-text">{typeof value === 'string' ? value : ''}</span>;

    case 'number':
      return (
        <span className="af-mono tsk__cell-num">{typeof value === 'number' ? value : '-'}</span>
      );

    case 'select':
    case 'status': {
      const option = property.options.find((o) => o.id === value);
      if (!option) {
        return (
          <button
            type="button"
            className="tsk__cell-set tsk__cell-empty"
            aria-haspopup="menu"
            aria-label={`${property.name}: not set`}
            onClick={(event) => onOpenMenu(event.currentTarget)}
          >
            -
          </button>
        );
      }
      return (
        <OptionMark
          property={property}
          option={option}
          isPriority={isPriority}
          priorityStyle="text"
          onClick={(event) => onOpenMenu(event.currentTarget)}
        />
      );
    }

    case 'multiSelect': {
      const ids = Array.isArray(value) ? (value as unknown[]).map(String) : [];
      const tags = ids
        .map((id) => property.options.find((o) => o.id === id))
        .filter((o): o is TaskPropertyOption => Boolean(o));
      return tags.length > 0 ? (
        <span className="tsk__tags">
          {tags.map((option) => (
            <span key={option.id} className="tsk__chip" style={tintStyle(toneColor(option.toneIndex))}>
              {option.label}
            </span>
          ))}
        </span>
      ) : (
        <span className="tsk__cell-empty">-</span>
      );
    }

    case 'date':
      return (
        <span className="af-meta">
          {typeof value === 'number' ? formatDateValue(value) : '-'}
        </span>
      );

    case 'checkbox':
      return <Checkbox checked={Boolean(value)} disabled aria-label="Checked" />;

    case 'url': {
      if (typeof value !== 'string' || !value) return <span className="tsk__cell-empty">-</span>;
      const href = safeUrl(value);
      return href ? (
        <a href={href} target="_blank" rel="noreferrer" className="af-mono tsk__url">
          {value}
        </a>
      ) : (
        <span className="af-mono">{value}</span>
      );
    }
  }
}
