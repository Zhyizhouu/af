import type { PointerEvent, ReactNode } from 'react';

/**
 * The draggable, resizable, hideable frame every dashboard widget sits in.
 *
 * A drag handle (top-left) reorders widgets on the grid, a resize pivot
 * (right edge) drags the column span, and a hide button (top-right) removes
 * it from the grid — all mouse-driven, all committed by the caller
 * (`DashboardScreen.tsx`) rather than owned here.
 */
export function WidgetFrame({
  width,
  dragProps,
  onResizeStart,
  onHide,
  children,
}: {
  width: number;
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
      style={{ gridColumn: `span ${width}` }}
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

      {children}

      <span className="dash__widget-resize" onPointerDown={onResizeStart} title="Drag to resize" />
    </div>
  );
}
