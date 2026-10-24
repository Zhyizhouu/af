import type { CSSProperties, MouseEvent } from 'react';
import { toneColor } from '../../data/tones';
import './badges.css';

export interface BadgeOption {
  label: string;
  toneIndex: number;
}

/** The `--tone` custom property every badge and flag reads its colours from. */
export const toneStyle = (toneIndex: number): CSSProperties =>
  ({ '--tone': toneColor(toneIndex) }) as CSSProperties;

interface StatusBadgeProps {
  option: BadgeOption;
  /** Makes the badge a menu trigger: rendered as a `<button>` rather than a `<span>`. */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  /** The property name spoken before the label by a screen reader. */
  caption?: string;
}

/**
 * A compact, rectangular text badge for an option's label, tinted with the
 * option's tone. Deliberately carries no icon, dot or caret: the colour and
 * the word are the whole signal.
 */
export function StatusBadge({ option, onClick, caption = 'Status' }: StatusBadgeProps) {
  const style = toneStyle(option.toneIndex);
  if (!onClick) {
    return (
      <span className="tsk-badge" style={style}>
        {option.label}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="tsk-badge tsk-badge--action"
      style={style}
      aria-haspopup="menu"
      aria-label={`${caption}: ${option.label}`}
      onClick={onClick}
    >
      {option.label}
    </button>
  );
}
