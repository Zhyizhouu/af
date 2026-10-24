import type { MouseEvent } from 'react';
import { toneStyle, type BadgeOption } from './StatusBadge';
import './badges.css';

const barCount = 3;

/**
 * How many of the three bars fill for the option at `index` of `total`: the
 * first option is the highest priority and fills them all.
 */
export const flagLevel = (index: number, total: number): number =>
  total <= 0 ? 1 : Math.max(1, Math.round((barCount * (total - Math.max(index, 0))) / total));

interface PriorityFlagProps {
  option: BadgeOption;
  /** Every option of the property, in order: the option's rank comes from its position here. */
  options: readonly BadgeOption[];
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  caption?: string;
}

/**
 * Three ascending bars, filled by rank, beside the option's label. The bars
 * are drawn in CSS from the option's position, so a re-ordered or extended
 * option list re-ranks itself.
 */
export function PriorityFlag({ option, options, onClick, caption = 'Priority' }: PriorityFlagProps) {
  const level = flagLevel(
    options.findIndex((candidate) => candidate.label === option.label),
    options.length,
  );
  const style = toneStyle(option.toneIndex);
  const content = (
    <>
      <span className="tsk-flag__bars" aria-hidden="true">
        {[1, 2, 3].map((bar) => (
          <span key={bar} className={bar <= level ? 'is-on' : undefined} />
        ))}
      </span>
      <span>{option.label}</span>
    </>
  );
  if (!onClick) {
    return (
      <span className="tsk-flag" style={style}>
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="tsk-flag tsk-flag--action"
      style={style}
      aria-haspopup="menu"
      aria-label={`${caption}: ${option.label}`}
      onClick={onClick}
    >
      {content}
    </button>
  );
}
