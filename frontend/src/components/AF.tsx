import type { ReactNode } from 'react';
import { hexToRgba, toneColor } from '../data/tones';
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

/**
 * A filled, coloured pill for a property option's value. Option values
 * (Select/Multi-select/Status/Priority) need to read as a tinted background
 * at a glance.
 */
export function AFTag({ label, toneIndex }: { label: string; toneIndex: number }) {
  const color = toneColor(toneIndex);
  return (
    <span className="af-tag" style={{ color, background: hexToRgba(color, 0.16) }}>
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
