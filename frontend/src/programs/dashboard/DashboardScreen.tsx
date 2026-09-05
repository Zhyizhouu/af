import { useCallback, useMemo, useRef, useState } from 'react';
import { AFButton } from '../../components/AF';
import { useSession } from '../../app/session';
import type { DashboardLayout } from '../../data/db';
import { hideWidget, moveWidget, resizeAt, seed, setHeight, showWidget, visibleIds, type DropTarget } from './layout';
import { widgetCatalogFor } from './widgets/registry';
import { useDashboardDrag } from './widgets/useDashboardDrag';
import { useHeightPin, useRowResize } from './widgets/useDashboardResize';
import { WidgetFrame } from './widgets/WidgetFrame';
import { WidgetPicker } from './widgets/WidgetPicker';
import './dashboard.css';

/**
 * reAFresh — a dashboard of rows and columns the account arranges itself.
 *
 * The layout model is Notion's: a widget dropped on a row's middle joins it
 * as a column, dropped near a row's edge becomes a row of its own, and the
 * dividers between columns trade width continuously. Every arrangement is
 * reachable and none of them can come out broken, because `layout.ts` holds
 * the two invariants — a row's widths sum to 100, and no row sits empty —
 * rather than the interaction constraining what the pointer is allowed to do.
 *
 * It lives in `settings.dashboard` (`app/session.tsx`), synced like
 * everything else. Applications are widgets here too (`widgetCatalogFor`'s
 * `app:<slug>` entries), independent of Profile's "Displayed Applications"
 * header setting; the two lists don't read each other.
 */
export function DashboardScreen() {
  const { admin, settings, updateSettings } = useSession();
  const [showAdd, setShowAdd] = useState(false);
  const grid = useRef<HTMLDivElement>(null);

  const catalog = widgetCatalogFor(admin);

  // Seeded on first read rather than in `session.tsx` — the same pattern
  // `seedDefaultProperties` uses for Task Tracker. A widget the catalog has
  // grown since this account last saved is appended in a row of its own
  // rather than silently dropped.
  const layout = useMemo(() => {
    const stored = settings.dashboard;
    if (stored.rows.length === 0 && stored.hidden.length === 0) {
      return seed(catalog.map((widget) => widget.id));
    }
    const known = new Set([...visibleIds(stored), ...stored.hidden]);
    const missing = catalog.filter((widget) => !known.has(widget.id));
    return missing.reduce((current, widget) => showWidget(current, widget.id), stored);
  }, [settings.dashboard, catalog]);

  const write = useCallback(
    (next: DashboardLayout) => void updateSettings({ dashboard: next }),
    [updateSettings],
  );

  // The drag and resize hooks re-run their pointer-listener effects whenever
  // the callback they were handed changes identity, so these read the live
  // layout through a ref rather than closing over it — otherwise every
  // pointermove would rebuild the listeners it is being delivered through.
  const latest = useRef(layout);
  latest.current = layout;

  const onDrop = useCallback(
    (id: string, target: DropTarget) => write(moveWidget(latest.current, id, target)),
    [write],
  );
  const onResize = useCallback(
    (row: number, divider: number, basis: number) => write(resizeAt(latest.current, row, divider, basis)),
    [write],
  );
  const onPin = useCallback(
    (id: string, height: number) => write(setHeight(latest.current, id, height)),
    [write],
  );

  const drag = useDashboardDrag(grid, onDrop);
  const rowResize = useRowResize(onResize);
  const heightPin = useHeightPin(onPin);

  // What is actually on screen right now: the stored layout with whichever
  // gesture is mid-flight applied over the top of it.
  const rendered = useMemo(() => {
    let current = layout;
    if (rowResize.live) {
      current = resizeAt(current, rowResize.live.row, rowResize.live.divider, rowResize.live.basis);
    }
    if (heightPin.live) current = setHeight(current, heightPin.live.id, heightPin.live.height);
    return current;
  }, [layout, rowResize.live, heightPin.live]);

  return (
    <div className="page dash">
      <div className="dash__bar">
        <span className="page__spacer" />
        <AFButton label="Add widgets" variant="ghost" onClick={() => setShowAdd(true)} />
      </div>

      <div className="dash__grid" ref={grid}>
        {rendered.rows.map((row, rowIndex) => (
          <div className="dash__row" data-row-index={rowIndex} key={row.widgets.map((w) => w.id).join('+')}>
            {row.widgets.map((placement, columnIndex) => {
              const entry = catalog.find((candidate) => candidate.id === placement.id);
              if (!entry) return null;
              const Widget = entry.Component;
              return [
                columnIndex > 0 && (
                  <span
                    key={`${placement.id}-divider`}
                    className="dash__divider"
                    title="Drag to resize"
                    onPointerDown={rowResize.startResize(
                      rowIndex,
                      columnIndex - 1,
                      row.widgets[columnIndex - 1]!.basis,
                    )}
                  />
                ),
                <WidgetFrame
                  key={placement.id}
                  id={placement.id}
                  basis={placement.basis}
                  height={placement.height}
                  isDragging={drag.dragId === placement.id}
                  dragOffset={drag.dragId === placement.id ? drag.offset : { x: 0, y: 0 }}
                  onDragStart={drag.startDrag(placement.id)}
                  onPinStart={heightPin.startPin(placement.id)}
                  onUnpin={() => write(setHeight(layout, placement.id, null))}
                  onHide={() => write(hideWidget(layout, placement.id))}
                >
                  <Widget />
                </WidgetFrame>,
              ];
            })}
          </div>
        ))}

        {drag.indicator && (
          <span
            className="dash__drop"
            style={{
              left: drag.indicator.x,
              top: drag.indicator.y,
              width: drag.indicator.width,
              height: drag.indicator.height,
            }}
          />
        )}
      </div>

      {showAdd && (
        <WidgetPicker
          hidden={layout.hidden}
          catalog={catalog}
          onShow={(id) => write(showWidget(layout, id))}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
