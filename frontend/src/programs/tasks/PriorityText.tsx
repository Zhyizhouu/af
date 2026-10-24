import type { MouseEvent } from 'react';
import { toneStyle, type BadgeOption } from './StatusBadge';
import './badges.css';

interface PriorityTextProps {
  option: BadgeOption;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  caption?: string;
}

export function PriorityText({ option, onClick, caption = 'Priority' }: PriorityTextProps) {
  const style = toneStyle(option.toneIndex);
  if (!onClick) {
    return (
      <span className="tsk-prio" style={style}>
        {option.label}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="tsk-prio tsk-prio--action"
      style={style}
      aria-haspopup="menu"
      aria-label={`${caption}: ${option.label}`}
      onClick={onClick}
    >
      {option.label}
    </button>
  );
}
