import type { PointerEvent, ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from 'cn';

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
  title,
  basis,
  height,
  isDragging,
  dragOffset,
  appTile,
  onDragStart,
  onPinStart,
  onUnpin,
  onHide,
  children,
}: {
  id: string;
  title: string;
  basis: number;
  height: number | null;
  isDragging: boolean;
  dragOffset: { x: number; y: number };
  appTile?: boolean;
  onDragStart: (event: PointerEvent) => void;
  onPinStart: (event: PointerEvent) => void;
  onUnpin: () => void;
  onHide: () => void;
  children: ReactNode;
}) {
  return (
    <div
      data-widget-id={id}
      className={cn(
        'dash__widget group overflow-hidden',
        appTile ? 'raised' : 'surface-3d',
        isDragging && 'is-dragging',
      )}
      style={{
        flexBasis: `${basis}%`,
        height: height ?? undefined,
        transform: isDragging ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : undefined,
        borderRadius: appTile ? 12 : undefined,
      }}
    >
      <div className="dash__gutter">
        <button
          type="button"
          onPointerDown={onDragStart}
          title="Drag to move"
          aria-label={`Move ${title}`}
          className={cn(
            'grid grid-cols-2 gap-[3px] rounded-md p-1.5 text-subtle-foreground opacity-60 transition-opacity',
            'cursor-grab touch-none group-hover:opacity-100 group-focus-within:opacity-100',
            isDragging && 'opacity-100',
          )}
        >
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className="size-[2px] rounded-full bg-current" />
          ))}
        </button>
        <button
          type="button"
          onClick={onHide}
          aria-label={`Hide ${title}`}
          className="flex size-6 items-center justify-center rounded-md text-subtle-foreground opacity-60 transition-opacity hover:bg-white/10 hover:text-foreground hover:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <X size={16} aria-hidden />
        </button>
        {height !== null && (
          <button
            type="button"
            onClick={onUnpin}
            aria-label={`Fit ${title} height to content`}
            title="Fit height to content"
            className="flex size-6 items-center justify-center rounded-md text-[11px] text-subtle-foreground opacity-60 transition-opacity hover:bg-white/10 hover:text-foreground hover:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            {'↕'}
          </button>
        )}
      </div>

      <div className={cn('dash__widget-body', appTile ? 'p-[10px]' : 'p-5')}>{children}</div>

      <button
        type="button"
        onPointerDown={onPinStart}
        aria-label={`Set ${title} height`}
        title="Drag to set height"
        className="dash__pin group/pin appearance-none border-0 bg-transparent p-0"
      >
        <span className="pointer-events-none absolute top-[4px] left-1/2 h-[2px] w-[34px] -translate-x-1/2 rounded-full bg-white/[0.08] transition-[background,box-shadow] group-hover/pin:bg-white/35 group-active/pin:bg-white/35 group-hover/pin:shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
      </button>
    </div>
  );
}
