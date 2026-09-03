import { AFButton, AFPanel } from '../../../components/AF';
import type { SettingsRow } from '../../../data/db';
import { widgetById } from './registry';

/**
 * The one place a hidden widget comes back from — everything else (reorder,
 * resize, hide) happens directly on the widget's own frame in
 * `DashboardScreen.tsx`, so this only ever lists what is currently hidden.
 */
export function WidgetPicker({
  widgets,
  onShow,
  onClose,
}: {
  widgets: SettingsRow['dashboardWidgets'];
  onShow: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="cal__overlay" role="dialog" aria-label="Hidden widgets">
      <AFPanel label="Hidden widgets" className="cal__editor">
        <ul className="dash__widget-list">
          {widgets.map((widget) => {
            const catalog = widgetById.get(widget.id);
            if (!catalog) return null;
            return (
              <li key={widget.id} className="dash__widget-row">
                <span className="af-body">{catalog.label}</span>
                <AFButton label="Show" variant="quiet" onClick={() => onShow(widget.id)} />
              </li>
            );
          })}
        </ul>

        <div className="cal__editor-actions">
          <AFButton label="Close" variant="quiet" onClick={onClose} />
        </div>
      </AFPanel>
    </div>
  );
}
