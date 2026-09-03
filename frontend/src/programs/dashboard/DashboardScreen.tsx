import { useCallback, useRef, useState } from 'react';
import { AFButton } from '../../components/AF';
import { useSession } from '../../app/session';
import { useDragReorder } from '../../components/dragReorder';
import { widgetCatalogFor } from './widgets/registry';
import { useWidgetResize } from './widgets/useWidgetResize';
import { WidgetFrame } from './widgets/WidgetFrame';
import { WidgetPicker } from './widgets/WidgetPicker';
import './dashboard.css';

const defaultWidth = { app: 3, panel: 6 };
const defaultHeight = { app: 120, panel: 260 };

/**
 * reAFresh — every widget an account has chosen to keep visible, arranged on
 * a 12-column grid it can drag to reorder and resize (both width and height,
 * from each widget's own corner pivot).
 *
 * Applications are widgets here too (`widgetCatalogFor`'s `app:<slug>`
 * entries) — added and removed exactly like the functional ones, and
 * independent of Profile's "Displayed Applications" header setting; the two
 * lists don't read each other. The layout lives in `settings.dashboardWidgets`
 * (`app/session.tsx`), synced like everything else. A first-time account (an
 * empty array) sees the full catalog in its default order and size — seeded
 * here rather than in `session.tsx`, the same "seed on first read" pattern
 * `seedDefaultProperties` uses for Task Tracker.
 */
export function DashboardScreen() {
  const { admin, settings, updateSettings } = useSession();
  const [showAdd, setShowAdd] = useState(false);
  const grid = useRef<HTMLDivElement>(null);

  const catalog = widgetCatalogFor(admin);

  // A widget the catalog has grown since this account's settings were last
  // saved (or that were never saved at all) is appended visible, at the end
  // — never silently dropped.
  const known = new Set(settings.dashboardWidgets.map((widget) => widget.id));
  const configured = [
    ...settings.dashboardWidgets,
    ...catalog
      .filter((widget) => !known.has(widget.id))
      .map((widget) => ({
        id: widget.id,
        hidden: false,
        width: widget.app ? defaultWidth.app : defaultWidth.panel,
        height: widget.app ? defaultHeight.app : defaultHeight.panel,
      })),
  ];

  const visible = configured.filter((widget) => !widget.hidden);
  const hidden = configured.filter((widget) => widget.hidden);

  const writeLayout = useCallback(
    (nextVisible: typeof configured) => void updateSettings({ dashboardWidgets: [...nextVisible, ...hidden] }),
    [updateSettings, hidden],
  );

  const dragHandlers = useDragReorder((from, to) => {
    const next = [...visible];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    writeLayout(next);
  });

  const resize = useWidgetResize(grid, (id, width, height) => {
    writeLayout(visible.map((widget) => (widget.id === id ? { ...widget, width, height } : widget)));
  });

  const hideWidget = (id: string) => {
    writeLayout(visible.map((widget) => (widget.id === id ? { ...widget, hidden: true } : widget)));
  };

  const showWidget = (id: string) => {
    void updateSettings({
      dashboardWidgets: configured.map((widget) => (widget.id === id ? { ...widget, hidden: false } : widget)),
    });
  };

  return (
    <div className="page dash">
      <div className="dash__bar">
        <span className="page__spacer" />
        <AFButton label="Add widgets" variant="ghost" onClick={() => setShowAdd(true)} />
      </div>

      <div className="dash__grid" ref={grid}>
        {visible.map((widget, index) => {
          const entry = catalog.find((candidate) => candidate.id === widget.id);
          if (!entry) return null;
          const Widget = entry.Component;
          return (
            <WidgetFrame
              key={widget.id}
              width={resize.widthFor(widget.id, widget.width)}
              height={resize.heightFor(widget.id, widget.height)}
              dragProps={dragHandlers(index)}
              onResizeStart={resize.startResize(widget.id, widget.width, widget.height)}
              onHide={() => hideWidget(widget.id)}
            >
              <Widget />
            </WidgetFrame>
          );
        })}
      </div>

      {showAdd && (
        <WidgetPicker widgets={hidden} catalog={catalog} onShow={showWidget} onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
}
