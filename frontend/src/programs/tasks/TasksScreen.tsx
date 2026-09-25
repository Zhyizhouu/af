import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { FileText, Maximize2, Plus, SlidersHorizontal, Table2, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { cn } from 'cn';
import { lockCursor } from '../../components/pointerDrag';
import { useSession } from '../../app/session';
import { hexToRgba, toneColor } from '../../data/tones';
import {
  actionsColumnWidth,
  defaultColumnWidth,
  defaultTitleWidth,
  fitColumnWidths,
  minColumnWidth,
  titleColumnKey,
} from './columns';
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

  /** Replaces every column width at once — what "Fit columns" commits. */
  const applyWidths = useCallback((next: Record<string, number>) => {
    setWidths(next);
    localStorage.setItem(widthsStorageKey, JSON.stringify(next));
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

  return { widthFor, startResize, draggingKey, applyWidths };
}

/** Tint for a status/select pill or a multi-select chip, from the option's tone. */
function tintStyle(color: string): CSSProperties {
  return {
    background: hexToRgba(color, 0.14),
    borderColor: hexToRgba(color, 0.35),
    color: `color-mix(in srgb, ${color} 70%, white)`,
  };
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

  const { widthFor, startResize, draggingKey, applyWidths } = useColumnWidths();
  const tableWidth = useMemo(
    () =>
      widthFor(titleColumnKey, defaultTitleWidth) +
      properties.reduce((sum, property) => sum + widthFor(property.id, defaultColumnWidth), 0) +
      actionsColumnWidth,
    [widthFor, properties],
  );

  // The toolbar spans exactly the content width available to the table, so
  // it is what "Fit columns" measures against — the table's own wrapper
  // hugs the table and would only ever report the width it already has.
  const bar = useRef<HTMLDivElement>(null);
  const fitColumns = () =>
    applyWidths(fitColumnWidths(properties, bar.current?.clientWidth ?? 0));

  return (
    <div className={`page page--tall tsk font-sans text-foreground px-4! py-4! md:px-8! md:py-6!${paneWidth === 'split' ? ' tsk--split' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[15px] font-semibold text-foreground">Task Tracker</h1>
          <span className="text-xs text-muted-foreground">
            {pages.length} {pages.length === 1 ? 'page' : 'pages'} · {properties.length}{' '}
            {properties.length === 1 ? 'property' : 'properties'}
          </span>
        </div>
      </div>

      <div className="tsk__bar" ref={bar}>
        <Button
          variant="raised"
          onClick={() => setShowFilters(true)}
        >
          <SlidersHorizontal size={16} aria-hidden />
          {filters.length > 0 ? `Filter (${filters.length})` : 'Filter'}
        </Button>
        <Button variant="raised" title="Size every column to the table's width" onClick={fitColumns}>
          <Table2 size={16} aria-hidden />
          Fit columns
        </Button>
        <Button variant="raised" onClick={() => setShowProperties(true)}>
          Properties
        </Button>
        <span className="page__spacer" />
        <Button
          variant="gradient"
          // Does not open PageDetail — a "new page" click from the table
          // creates and stays put, matching the dashboard's Tasks widget.
          onClick={() => void commit(() => createPage())}
        >
          <Plus size={16} aria-hidden />
          New page
        </Button>
      </div>

      {pages.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No pages yet. New page to get started.</p>
      ) : (
        <div className="tsk__table-wrap surface-3d">
          <table className="tsk__table" style={{ width: tableWidth }}>
            <colgroup>
              <col style={{ width: widthFor(titleColumnKey, defaultTitleWidth) }} />
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
                    className={`tsk__col-resize${draggingKey === titleColumnKey ? ' is-dragging' : ''}`}
                    onPointerDown={startResize(titleColumnKey, defaultTitleWidth)}
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
                    <td key={property.id}>{renderCell(property, page.values[property.id])}</td>
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
              <tr className="tsk__new-row">
                <td colSpan={properties.length + 2}>
                  <button
                    type="button"
                    className="tsk__new-page"
                    onClick={() => void commit(() => createPage())}
                  >
                    <Plus size={14} aria-hidden />
                    New page
                  </button>
                </td>
              </tr>
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
      if (!option) return <span className="tsk__cell-empty">—</span>;
      return (
        <span className="tsk__pill" style={tintStyle(toneColor(option.toneIndex))}>
          {option.label}
        </span>
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
        <span className="tsk__cell-empty">—</span>
      );
    }

    case 'date':
      return (
        <span className="af-meta">
          {typeof value === 'number' ? new Date(value).toLocaleDateString() : '—'}
        </span>
      );

    case 'checkbox':
      return <Checkbox checked={Boolean(value)} disabled aria-label="Checked" />;

    case 'url':
      return typeof value === 'string' && value ? (
        <a href={value} target="_blank" rel="noreferrer" className="af-mono tsk__url">
          {value}
        </a>
      ) : (
        <span className="tsk__cell-empty">—</span>
      );
  }
}
