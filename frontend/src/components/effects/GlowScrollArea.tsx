import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from 'cn';
import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui';

export interface GlowScrollAreaProps {
  className?: string;
  viewportClassName?: string;
  children?: ReactNode;
}

export function GlowScrollArea({ className, viewportClassName, children }: GlowScrollAreaProps) {
  const [scrolling, setScrolling] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  const onScroll = () => {
    setScrolling(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setScrolling(false), 700);
  };

  return (
    <ScrollAreaPrimitive.Root
      type="always"
      data-scrolling={scrolling ? 'true' : 'false'}
      className={cn('relative overflow-hidden', className)}
    >
      <ScrollAreaPrimitive.Viewport
        className={cn('size-full rounded-[inherit]', viewportClassName)}
        onScroll={onScroll}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        orientation="vertical"
        forceMount
        className="flex touch-none select-none justify-center"
        style={{ position: 'absolute', right: 4, top: 8, bottom: 8, width: 8 }}
      >
        <div
          aria-hidden="true"
          className="absolute rounded-full"
          style={{ top: 0, bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 2, background: 'rgba(255,255,255,0.04)' }}
        />
        <ScrollAreaPrimitive.Thumb
          className="relative flex-1 rounded-full"
          style={{
            width: scrolling ? 6 : 3,
            opacity: scrolling ? 1 : 0.5,
            boxShadow: scrolling ? '0 0 16px var(--glow)' : 'none',
            background: 'linear-gradient(180deg, #fdba74, var(--glow) 50%, #a78bfa)',
            transition: 'width 0.25s ease, opacity 0.35s ease, box-shadow 0.35s ease',
          }}
        />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}
