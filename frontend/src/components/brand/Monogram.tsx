import { cn } from 'cn';

export interface MonogramProps {
  size?: number;
  glow?: boolean;
  className?: string;
}

export function Monogram({ size = 32, glow = false, className }: MonogramProps) {
  return (
    <div
      role="img"
      aria-label="reAFresh"
      className={cn('inline-flex shrink-0 items-center justify-center text-black', className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: 'linear-gradient(135deg, #ffffff, #a1a1aa)',
        boxShadow: glow ? '0 0 18px rgba(255,255,255,0.25)' : undefined,
        fontSize: size * 0.375,
        fontWeight: 600,
      }}
    >
      AF
    </div>
  );
}
