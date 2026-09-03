import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { AFButton, AFEmptyState, AFIconButton, AFTag } from '../../components/AF';
import { lockCursor } from '../../components/pointerDrag';
import { useSession } from '../../app/session';
import type { TaskPageRow, TaskPropertyOption, TaskPropertyRow } from '../../data/db';
import { FilterPanel } from './FilterPanel';
import { PageDetail } from './PageDetail';
import { PropertyPanel } from './PropertyPanel';
import {
  createPage,
  deletePage,
  listPages,
  listProperties,
  matchesFilters,
  seedDefaultProperties,
  type PropertyFilter,
} from './store';
import './tasks.css';

type OpenPage = { id: string; mode: 'peek' | 'fullscreen' };

const widthsStorageKey = 'af.tasks.columnWidths';
const defaultTitleWidth = 240;
const defaultColumnWidth = 160;
const minColumnWidth = 80;
const actionsColumnWidth = 36;

const loadColumnWidths = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(widthsStorageKey);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
};

/**
 * Per-device column widths, dragged from a handle on each `<th>`.
 *
 * Persisted to `localStorage` rather than synced settings — the same choice
 * `SplitView`'s remembered divider ratio already made, for the same reason:
 * this is a display preference for one screen, not data.
 */
function useColumnWidths() {
  const [widths, setWidths] = useState<Record<string, number>>(loadColumnWidths);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const drag = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const widthFor = useCallback(
    (key: string, fallback: number) => widths[key] ?? fallback,
    [widths],
  );

  useEffect(() => {
    function onMove(event: globalThis.PointerEvent) {
      if (!drag.current) return;
      const { key, startX, startWidth } = drag.current;
      const next = Math.max(minColumnWidth, startWidth + (event.clientX - startX));
      setWidths((prev) => ({ ...prev, [key]: next }));
    }
    function onUp() {
      if (!drag.current) return;
      drag.current = null;
      setDraggingKey(null);
      setWidths((prev) => {
        localStorage.setItem(widthsStorageKey, JSON.stringify(prev));
        return prev;
      });
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const startResize = useCallback(
    (key: string, fallback: number) => (event: PointerEvent) => {
      event.preventDefault();
      drag.current = { key, startX: event.clientX, startWidth: widths[key] ?? fallback };
      setDraggingKey(key);
      // Locked for the whole drag, not left to `:hover` on the 10px handle —
      // the pointer is off that strip for nearly the entire gesture, and an
      // unlocked cursor flickering back to the default arrow is what makes a
      // drag read as broken.
      const unlock = lockCursor('col-resize');
      window.addEventListener('pointerup', unlock, { once: true });
    },
    [widths],
  );

  return { widthFor, startResize, draggingKey };
}

/**
 * reAFresh · Task Tracker — a table of user-defined "pages", each one a task
 * with typed, CRUD-able properties. A page's own detail view is built once
 * and rendered in two containers (side-peek or fullscreen) rather than twice.
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

  const reload = useCallback(async () => {
    await seedDefaultProperties();
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

  const visiblePages = pages.filter((page) => matchesFilters(page, filters));
  const openPageRow = openPage ? pages.find((page) => page.id === openPage.id) : undefined;

  const { widthFor, startResize, draggingKey } = useColumnWidths();
  const tableWidth = useMemo(
    () =>
      widthFor('title', defaultTitleWidth) +
      properties.reduce((sum, property) => sum + widthFor(property.id, defaultColumnWidth), 0) +
      actionsColumnWidth,
    [widthFor, properties],
  );

  return (
    <div className={`page page--tall tsk${paneWidth === 'split' ? ' tsk--split' : ''}`}>
      <div className="tsk__bar">
        <AFButton
          label="New page"
          // Does not open PageDetail — a "new page" click from the table
          // creates and stays put, matching the dashboard's Tasks widget.
          onClick={() => void commit(() => createPage())}
        />
        <AFButton
          label={filters.length > 0 ? `Filter (${filters.length})` : 'Filter'}
          variant="quiet"
          onClick={() => setShowFilters(true)}
        />
        <span className="page__spacer" />
        <AFButton label="Manage properties" variant="ghost" onClick={() => setShowProperties(true)} />
      </div>

      {pages.length === 0 ? (
        <AFEmptyState glyph="◆" message="No pages yet. New page to get started." />
      ) : (
        <div className="tsk__table-wrap">
          <table className="tsk__table" style={{ width: tableWidth }}>
            <colgroup>
              <col style={{ width: widthFor('title', defaultTitleWidth) }} />
              {properties.map((property) => (
                <col key={property.id} style={{ width: widthFor(property.id, defaultColumnWidth) }} />
              ))}
              <col style={{ width: actionsColumnWidth }} />
            </colgroup>
            <thead>
              <tr>
                <th className="tsk__col-title">
                  Page
                  <span
                    className={`tsk__col-resize${draggingKey === 'title' ? ' is-dragging' : ''}`}
                    onPointerDown={startResize('title', defaultTitleWidth)}
                  />
                </th>
                {properties.map((property) => (
                  <th key={property.id}>
                    {property.name}
                    <span
                      className={`tsk__col-resize${draggingKey === property.id ? ' is-dragging' : ''}`}
                      onPointerDown={startResize(property.id, defaultColumnWidth)}
                    />
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
                          ) : (
                            (page.icon?.value ?? '▢')
                          )}
                        </span>
                        <span className="af-body">{page.title}</span>
                      </button>
                      <span className="tsk__peek-actions">
                        <AFIconButton
                          glyph="⤢"
                          tooltip="Open with side peek"
                          bordered={false}
                          onClick={() => setOpenPage({ id: page.id, mode: 'peek' })}
                        />
                      </span>
                    </div>
                  </td>

                  {properties.map((property) => (
                    <td key={property.id}>{renderCell(property, page.values[property.id])}</td>
                  ))}

                  <td className="tsk__col-actions">
                    {confirmingDelete === page.id ? (
                      <AFIconButton
                        glyph="✕"
                        tooltip="Really delete"
                        bordered={false}
                        onClick={() => void commit(() => deletePage(page.id))}
                      />
                    ) : (
                      <AFIconButton
                        glyph="✕"
                        tooltip="Delete page"
                        bordered={false}
                        onClick={() => setConfirmingDelete(page.id)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openPage && openPageRow && (
        <PageDetail
          page={openPageRow}
          properties={properties}
          mode={openPage.mode}
          onClose={() => setOpenPage(null)}
          onFullscreen={() => setOpenPage({ id: openPage.id, mode: 'fullscreen' })}
          onExitFullscreen={() => setOpenPage({ id: openPage.id, mode: 'peek' })}
          onChange={() => void reload()}
        />
      )}

      {showProperties && (
        <PropertyPanel
          properties={properties}
          onClose={() => setShowProperties(false)}
          onChange={() => void reload()}
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

/** One switch, not eight components — each type's cell is a couple of lines. */
function renderCell(property: TaskPropertyRow, value: unknown): ReactNode {
  switch (property.type) {
    case 'text':
      return <span className="af-body">{typeof value === 'string' ? value : ''}</span>;

    case 'number':
      return (
        <span className="af-mono tsk__cell-num">{typeof value === 'number' ? value : '—'}</span>
      );

    case 'select':
    case 'status': {
      const option = property.options.find((o) => o.id === value);
      return option ? (
        <AFTag label={option.label} toneIndex={option.toneIndex} />
      ) : (
        <span className="af-meta">—</span>
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
            <AFTag key={option.id} label={option.label} toneIndex={option.toneIndex} />
          ))}
        </span>
      ) : (
        <span className="af-meta">—</span>
      );
    }

    case 'date':
      return (
        <span className="af-meta">
          {typeof value === 'number' ? new Date(value).toLocaleDateString() : '—'}
        </span>
      );

    case 'checkbox':
      return value ? (
        <span className="tsk__check is-yes">✓</span>
      ) : (
        <span className="tsk__check">–</span>
      );

    case 'url':
      return typeof value === 'string' && value ? (
        <a href={value} target="_blank" rel="noreferrer" className="af-mono tsk__url">
          {value}
        </a>
      ) : (
        <span className="af-meta">—</span>
      );
  }
}
