import { AFButton, AFHint, AFPanel } from '../../../components/AF';
import type { SettingsRow } from '../../../data/db';
import type { DashboardWidget } from './registry';

/**
 * "Add Widgets" — the one place a hidden widget (an application launcher or
 * a functional panel alike) comes back from. Everything else — reorder,
 * resize, hide — happens directly on the widget's own frame in
 * `DashboardScreen.tsx`, so this only ever lists what is currently hidden.
 */
export function WidgetPicker({
  widgets,
  catalog,
  onShow,
  onClose,
}: {
  widgets: SettingsRow['dashboardWidgets'];
  catalog: readonly DashboardWidget[];
  onShow: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="cal__overlay" role="dialog" aria-label="Add widgets">
      <AFPanel label="Add widgets" className="cal__editor">
        {widgets.length === 0 ? (
          <AFHint>Every widget is already on the dashboard.</AFHint>
        ) : (
          <ul className="dash__widget-list">
            {widgets.map((widget) => {
              const entry = catalog.find((candidate) => candidate.id === widget.id);
              if (!entry) return null;
              return (
                <li key={widget.id} className="dash__widget-row">
                  <span className="af-body">{entry.label}</span>
                  <AFButton label="Add" variant="quiet" onClick={() => onShow(widget.id)} />
                </li>
              );
            })}
          </ul>
        )}

        <div className="cal__editor-actions">
          <AFButton label="Close" variant="quiet" onClick={onClose} />
        </div>
      </AFPanel>
    </div>
  );
}
