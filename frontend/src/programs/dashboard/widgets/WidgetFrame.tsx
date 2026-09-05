import type { PointerEvent, ReactNode } from 'react';

/**
 * The frame every dashboard widget sits in.
 *
 * The grab handle lives in the left gutter, outside the widget's own box —
 * Notion's arrangement, and the reason Notion needs no edit mode: controls
 * that never sit on top of the content can be permanent without competing
 * with it, and can't be hit by accident while reaching for something inside
 * the widget.
 *
 * Height comes from the content (every card in a row stretches to match the
 * tallest) until somebody drags the bottom edge, which pins it and lets the
 * content scroll inside.
 */
export function WidgetFrame({
  id,
  basis,
  height,
  isDragging,
  dragOffset,
  onDragStart,
  onPinStart,
  onUnpin,
  onHide,
  children,
}: {
  id: string;
  basis: number;
  height: number | null;
  isDragging: boolean;
  dragOffset: { x: number; y: number };
  onDragStart: (event: PointerEvent) => void;
  onPinStart: (event: PointerEvent) => void;
  onUnpin: () => void;
  onHide: () => void;
  children: ReactNode;
}) {
  return (
    <div
      data-widget-id={id}
      className={`dash__widget${isDragging ? ' is-dragging' : ''}`}
      style={{
        flexBasis: `${basis}%`,
        height: height ?? undefined,
        transform: isDragging ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : undefined,
      }}
    >
      <div className="dash__gutter">
        <span className="dash__grip" onPointerDown={onDragStart} title="Drag to move">
          ⠿
        </span>
        <button type="button" className="dash__gutter-btn" onClick={onHide} title="Remove from dashboard">
          ✕
        </button>
        {height !== null && (
          <button type="button" className="dash__gutter-btn" onClick={onUnpin} title="Fit height to content">
            ↕
          </button>
        )}
      </div>

      <div className="dash__widget-body">{children}</div>

      <span className="dash__pin" onPointerDown={onPinStart} title="Drag to set height" />
    </div>
  );
}
