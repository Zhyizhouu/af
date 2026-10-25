import { useMemo } from 'react';
import { X } from 'lucide-react';
import { cn } from 'cn';
import { isPageDone } from '../../data/agenda';
import type { TaskPageRow, TaskPropertyOption, TaskPropertyRow } from '../../data/db';
import { optionOfPage, priorityRank, statusUrgency } from './roles';
import { StatusBadge, toneStyle } from './StatusBadge';
import type { TriageDrag } from './useTriageDrag';

export const maxRows = 8;

export function useOpenMatches(
  finding: boolean,
  text: string,
  pages: TaskPageRow[],
  properties: TaskPropertyRow[],
  priority: TaskPropertyRow | undefined,
  status: TaskPropertyRow | undefined,
): TaskPageRow[] {
  return useMemo(() => {
    if (!finding) return [];
    const needle = text.slice(1).trim().toLowerCase();
    const priorityOwner = priority ?? { options: [] };
    const statusOwner = status ?? { options: [] };
    const rankPriority = (page: TaskPageRow) => priorityRank(priorityOwner, optionOfPage(priority, page));
    const rankStatus = (page: TaskPageRow) => statusUrgency(statusOwner, optionOfPage(status, page));
    return pages
      .filter((page) => !isPageDone(page, properties) && page.title.toLowerCase().includes(needle))
      .sort((a, b) => rankPriority(a) - rankPriority(b) || rankStatus(a) - rankStatus(b));
  }, [finding, text, pages, properties, priority, status]);
}

interface CommandPaletteProps {
  rows: TaskPageRow[];
  total: number;
  activeRow: number;
  listId: string;
  optionId: (pageId: string) => string;
  status: TaskPropertyRow | undefined;
  priority: TaskPropertyRow | undefined;
  statusOptions: TaskPropertyOption[];
  priorityOptions: TaskPropertyOption[];
  drag: TriageDrag;
  onPick: (page: TaskPageRow) => void;
}

export function CommandPalette({
  rows,
  total,
  activeRow,
  listId,
  optionId,
  status,
  priority,
  statusOptions,
  priorityOptions,
  drag,
  onPick,
}: CommandPaletteProps) {
  return (
    <div className="tsk-palette">
      <ul className="tsk-palette__list" role="listbox" id={listId} aria-label="Open tasks">
        {rows.map((page, index) => {
          const option = status && statusOptions.find((candidate) => candidate.id === page.values[status.id]);
          const rank = priority && priorityOptions.find((candidate) => candidate.id === page.values[priority.id]);
          return (
            <li
              key={page.id}
              {...drag.chip(page, { keyboard: false, palette: true })}
              id={optionId(page.id)}
              role="option"
              aria-selected={index === activeRow}
              className={cn(
                'tsk-palette__row',
                index === activeRow && 'is-active',
                drag.dragId === page.id && 'is-lifted',
              )}
              onClick={() => onPick(page)}
            >
              <span className="tsk-palette__title">{page.title}</span>
              {rank && <span className="sr-only">Priority: {rank.label}</span>}
              {option && <StatusBadge option={option} />}
            </li>
          );
        })}
      </ul>
      {total === 0 && <p className="tsk-palette__note">No open tasks match</p>}
      {total > rows.length && <p className="tsk-palette__note">{total - rows.length} more</p>}
    </div>
  );
}

export function PickedChip({ title, onClear }: { title: string; onClear: () => void }) {
  return (
    <span className="tsk-command__chip">
      <span>{title}</span>
      <button type="button" aria-label="Clear picked task" onClick={onClear}>
        <X size={12} aria-hidden />
      </button>
    </span>
  );
}

interface StatusStepsProps {
  options: TaskPropertyOption[];
  current: number;
  onStep: (optionId: string) => void;
}

export function StatusSteps({ options, current, onStep }: StatusStepsProps) {
  return (
    <div className="tsk-steps" role="group" aria-label="Status">
      {options.map((option, index) => (
        <button
          key={option.id}
          type="button"
          className={cn('tsk-steps__step', index < current && 'is-passed', index === current && 'is-current')}
          style={toneStyle(option.toneIndex)}
          aria-current={index === current ? 'step' : undefined}
          onClick={() => onStep(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
