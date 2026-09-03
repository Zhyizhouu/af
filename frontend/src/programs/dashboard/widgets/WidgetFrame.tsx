import type { PointerEvent, ReactNode } from 'react';

/**
 * The draggable, resizable, hideable frame every dashboard widget sits in.
 *
 * A drag handle (the toolbar's left strip) reorders widgets on the grid —
 * the widget itself visibly lifts and follows the cursor via `dragOffset`
 * while `useWidgetReorder.ts` live-reflows the others around it. A corner
 * pivot (bottom-right) drags both the column span and the pixel height
 * together, like a window's own resize corner. A hide button removes it
 * from the grid. All mouse-driven, all committed by the caller
 * (`DashboardScreen.tsx`) rather than owned here.
 *
 * The toolbar and the resize pivot are laid out as siblings of the
 * scrollable body, not descendants of it, so they stay put at a fixed
 * position even when the widget's own content overflows and scrolls.
 */
export function WidgetFrame({
  id,
  width,
  height,
  isDragging,
  isResizing,
  dragOffset,
  onDragStart,
  onResizeStart,
  onHide,
  children,
}: {
  id: string;
  width: number;
  height: number;
  isDragging: boolean;
  isResizing: boolean;
  dragOffset: { x: number; y: number };
  onDragStart: (event: PointerEvent) => void;
  onResizeStart: (event: PointerEvent) => void;
  onHide: () => void;
  children: ReactNode;
}) {
  return (
    <div
      data-widget-id={id}
      className={`dash__widget${isDragging ? ' is-dragging' : ''}${isResizing ? ' is-resizing' : ''}`}
      style={{
        gridColumn: `span ${width}`,
        height,
        transform: isDragging ? `translate(${dragOffset.x}px, ${dragOffset.y}px) scale(1.02)` : undefined,
      }}
    >
      <div className="dash__widget-toolbar">
        <div className="dash__widget-handle" onPointerDown={onDragStart} title="Drag to reorder">
          <span aria-hidden>⠿</span>
        </div>
        <button type="button" className="dash__widget-hide" onClick={onHide} title="Hide widget">
          ✕
        </button>
      </div>

      <div className="dash__widget-body">{children}</div>

      <span className="dash__widget-resize" onPointerDown={onResizeStart} title="Drag to resize" />
    </div>
  );
}
