import { Link } from 'react-router-dom';
import { useCallback, useRef, useState } from 'react';
import { AFButton } from '../../components/AF';
import { useSession } from '../../app/session';
import { visiblePrograms } from '../../app/programs';
import { useDragReorder } from '../../components/dragReorder';
import { widgetCatalog } from './widgets/registry';
import { useWidgetResize } from './widgets/useWidgetResize';
import { WidgetFrame } from './widgets/WidgetFrame';
import { WidgetPicker } from './widgets/WidgetPicker';
import './dashboard.css';

const defaultWidth = 6;

/**
 * reAFresh — the launcher, plus every widget an account has chosen to keep
 * visible, arranged on a 12-column grid it can drag to reorder and resize.
 *
 * The layout lives in `settings.dashboardWidgets` (`app/session.tsx`), synced
 * like everything else. A first-time account (an empty array) sees the full
 * catalog in its default order and width — seeded here rather than in
 * `session.tsx`, the same "seed on first read" pattern `seedDefaultProperties`
 * uses for Task Tracker.
 */
export function DashboardScreen() {
  const { admin, settings, updateSettings } = useSession();
  const [showHidden, setShowHidden] = useState(false);
  const grid = useRef<HTMLDivElement>(null);

  // A widget the catalog has grown since this account's settings were last
  // saved (or that were never saved at all) is appended visible, at the end
  // — never silently dropped.
  const known = new Set(settings.dashboardWidgets.map((widget) => widget.id));
  const configured = [
    ...settings.dashboardWidgets,
    ...widgetCatalog
      .filter((widget) => !known.has(widget.id))
      .map((widget) => ({ id: widget.id, hidden: false, width: defaultWidth })),
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

  const resize = useWidgetResize(grid, (id, width) => {
    writeLayout(visible.map((widget) => (widget.id === id ? { ...widget, width } : widget)));
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
        {hidden.length > 0 && (
          <AFButton
            label={`Hidden widgets (${hidden.length})`}
            variant="ghost"
            onClick={() => setShowHidden(true)}
          />
        )}
      </div>

      {/* Mark plus name, no descriptions — the gallery is for getting somewhere,
          not for reading about where you might go. */}
      <div className="dash__gallery">
        {visiblePrograms(admin, settings.hiddenPrograms)
          .filter((program) => program.slug !== 'dashboard')
          .map((program) => (
            <Link key={program.slug} to={`/${program.slug}`} className="dash__tile">
              <span className="dash__mark" aria-hidden>
                {program.mark}
              </span>
              <span className="dash__name">{program.name}</span>
            </Link>
          ))}
      </div>

      <div className="dash__grid" ref={grid}>
        {visible.map((widget, index) => {
          const catalog = widgetCatalog.find((entry) => entry.id === widget.id);
          if (!catalog) return null;
          const Widget = catalog.Component;
          return (
            <WidgetFrame
              key={widget.id}
              width={resize.widthFor(widget.id, widget.width)}
              dragProps={dragHandlers(index)}
              onResizeStart={resize.startResize(widget.id, widget.width)}
              onHide={() => hideWidget(widget.id)}
            >
              <Widget />
            </WidgetFrame>
          );
        })}
      </div>

      {showHidden && (
        <WidgetPicker widgets={hidden} onShow={showWidget} onClose={() => setShowHidden(false)} />
      )}
    </div>
  );
}
