import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './af.css';

/**
 * The AF widget kit.
 *
 * A port of `lib/widgets/`. The components are deliberately thin — the look
 * lives in `af.css` against the tokens, so a change to the design language is
 * one stylesheet rather than a sweep through JSX.
 */

export function AFPanel({
  label,
  count,
  countSlot,
  accented = false,
  className = '',
  style,
  children,
}: {
  label?: string;
  count?: string;
  countSlot?: ReactNode;
  accented?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  const head = label !== undefined || count !== undefined || countSlot;

  return (
    <div
      className={`af-panel${accented ? ' af-panel--accented' : ''} ${className}`}
      style={style}
    >
      {head && (
        <div className="af-panel__head">
          <span className="af-panel-label">{label?.toUpperCase() ?? ''}</span>
          {countSlot ?? (count ? <span className="af-panel-count">{count}</span> : null)}
        </div>
      )}
      {children}
    </div>
  );
}

export function AFPanelLabel({ label, count }: { label: string; count?: string }) {
  return (
    <div className="af-panel__head" style={{ marginBottom: 0 }}>
      <span className="af-panel-label">{label.toUpperCase()}</span>
      {count && <span className="af-panel-count">{count}</span>}
    </div>
  );
}

type Variant = 'solid' | 'ghost' | 'quiet' | 'danger';

export function AFButton({
  label,
  variant = 'solid',
  expand = false,
  icon,
  ...rest
}: {
  label: string;
  variant?: Variant;
  expand?: boolean;
  icon?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const modifier = variant === 'solid' ? '' : ` af-btn--${variant}`;
  return (
    <button
      type="button"
      className={`af-btn${modifier}${expand ? ' af-btn--expand' : ''}`}
      {...rest}
    >
      {icon}
      {label}
    </button>
  );
}

export function AFIconButton({
  glyph,
  tooltip,
  bordered = true,
  ...rest
}: {
  glyph: ReactNode;
  tooltip: string;
  bordered?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`af-icon-btn${bordered ? '' : ' af-icon-btn--bare'}`}
      title={tooltip}
      aria-label={tooltip}
      {...rest}
    >
      {glyph}
    </button>
  );
}

export function AFHint({ children, tip = false }: { children: ReactNode; tip?: boolean }) {
  return <div className={`af-hint${tip ? ' af-hint--tip' : ''}`}>{children}</div>;
}

export function AFChip({ label, color }: { label: string; color?: string }) {
  return (
    <span className="af-chip" style={{ color: color ?? 'var(--af-accent)' }}>
      {label}
    </span>
  );
}

export function AFEmptyState({ glyph = '⊞', message }: { glyph?: string; message: string }) {
  return (
    <div className="af-empty">
      {glyph && <div className="af-empty__glyph">{glyph}</div>}
      <div className="af-empty__message">{message}</div>
    </div>
  );
}

export function AFMasthead({
  title,
  tagline,
  actions,
}: {
  title: string;
  tagline?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="af-masthead">
      <span className="af-masthead__tick" />
      <span className="af-brand">{title.toUpperCase()}</span>
      {tagline && <span className="af-masthead__tagline">{tagline}</span>}
      {actions}
    </div>
  );
}

export function AFFooter({ children }: { children: ReactNode }) {
  return <div className="af-footer">{children}</div>;
}
