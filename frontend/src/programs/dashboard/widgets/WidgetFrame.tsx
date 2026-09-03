import type { PointerEvent, ReactNode } from 'react';

/**
 * The draggable, resizable, hideable frame every dashboard widget sits in.
 *
 * A drag handle (top-left) reorders widgets on the grid, a corner pivot
 * (bottom-right) drags both the column span and the pixel height together —
 * like a window's own resize corner — and a hide button (top-right) removes
 * it from the grid. All mouse-driven, all committed by the caller
 * (`DashboardScreen.tsx`) rather than owned here.
 *
 * The toolbar and the resize handle are laid out as siblings of the
 * scrollable body, not descendants of it, so they stay put at a fixed height
 * even when the widget's own content overflows and scrolls.
 */
export function WidgetFrame({
  width,
  height,
  dragProps,
  onResizeStart,
  onHide,
  children,
}: {
  width: number;
  height: number;
  dragProps: {
    draggable: boolean;
    onDragStart: (event: React.DragEvent) => void;
    onDragEnd: () => void;
    onDragOver: (event: React.DragEvent) => void;
    onDrop: (event: React.DragEvent) => void;
    className: string;
  };
  onResizeStart: (event: PointerEvent) => void;
  onHide: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`dash__widget ${dragProps.className}`}
      style={{ gridColumn: `span ${width}`, height }}
      onDragOver={dragProps.onDragOver}
      onDrop={dragProps.onDrop}
    >
      <div className="dash__widget-toolbar">
        <span
          className="af-drag-handle"
          draggable={dragProps.draggable}
          onDragStart={dragProps.onDragStart}
          onDragEnd={dragProps.onDragEnd}
          title="Drag to reorder"
        >
          ⠿
        </span>
        <button type="button" className="dash__widget-hide" onClick={onHide} title="Hide widget">
          ✕
        </button>
      </div>

      <div className="dash__widget-body">{children}</div>

      <span className="dash__widget-resize" onPointerDown={onResizeStart} title="Drag to resize" />
    </div>
  );
}
