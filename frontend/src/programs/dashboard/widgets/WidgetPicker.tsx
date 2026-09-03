import { AFButton, AFPanel } from '../../../components/AF';
import { useDragReorder } from '../../../components/dragReorder';
import type { SettingsRow } from '../../../data/db';
import { widgetById } from './registry';

export function WidgetPicker({
  widgets,
  onChange,
  onClose,
}: {
  widgets: SettingsRow['dashboardWidgets'];
  onChange: (next: SettingsRow['dashboardWidgets']) => void;
  onClose: () => void;
}) {
  const dragHandlers = useDragReorder((from, to) => {
    const next = [...widgets];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    onChange(next);
  });

  const toggle = (id: string) => {
    onChange(widgets.map((widget) => (widget.id === id ? { ...widget, hidden: !widget.hidden } : widget)));
  };

  return (
    <div className="cal__overlay" role="dialog" aria-label="Customize dashboard">
      <AFPanel label="Customize dashboard" className="cal__editor">
        <ul className="dash__widget-list">
          {widgets.map((widget, index) => {
            const catalog = widgetById.get(widget.id);
            if (!catalog) return null;
            const { draggable, onDragStart, onDragEnd, onDragOver, onDrop, className } = dragHandlers(index);
            return (
              <li
                key={widget.id}
                className={`dash__widget-row ${className}`}
                onDragOver={onDragOver}
                onDrop={onDrop}
              >
                <span
                  className="af-drag-handle"
                  draggable={draggable}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                >
                  ⠿
                </span>
                <span className="af-body">{catalog.label}</span>
                <label className="dash__widget-toggle">
                  <input type="checkbox" checked={!widget.hidden} onChange={() => toggle(widget.id)} />
                  <span className="af-meta">{widget.hidden ? 'Hidden' : 'Visible'}</span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="cal__editor-actions">
          <AFButton label="Done" variant="quiet" onClick={onClose} />
        </div>
      </AFPanel>
    </div>
  );
}
