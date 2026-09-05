import { AFButton, AFHint, AFPanel } from '../../../components/AF';
import type { DashboardWidget } from './registry';

/**
 * "Add widgets" — where a removed widget comes back from. Everything else
 * (move, resize, remove) happens on the widget itself, so this only ever
 * lists what is currently off the grid.
 */
export function WidgetPicker({
  hidden,
  catalog,
  onShow,
  onClose,
}: {
  hidden: readonly string[];
  catalog: readonly DashboardWidget[];
  onShow: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="cal__overlay" role="dialog" aria-label="Add widgets">
      <AFPanel label="Add widgets" className="cal__editor">
        {hidden.length === 0 ? (
          <AFHint>Every widget is already on the dashboard.</AFHint>
        ) : (
          <ul className="dash__widget-list">
            {hidden.map((id) => {
              const entry = catalog.find((candidate) => candidate.id === id);
              if (!entry) return null;
              return (
                <li key={id} className="dash__widget-row">
                  <span className="af-body">{entry.label}</span>
                  <AFButton label="Add" variant="quiet" onClick={() => onShow(id)} />
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
