import { cn } from 'cn';
import type { TaskPageRow, TaskPropertyOption, TaskPropertyRow } from '../../data/db';
import { findPriorityProperty } from './store';
import type { TriageDrag } from './useTriageDrag';
import './badges.css';

const everything: TaskPropertyOption = { id: '', label: 'All', toneIndex: 4 };

const glowOf = (index: number, total: number): 'high' | 'medium' | 'low' =>
  index <= 0 ? 'high' : index >= total - 1 ? 'low' : 'medium';

const labelOf = (option: TaskPropertyOption): string => option.label.trim().toLowerCase();

interface TriageGridProps {
  pages: TaskPageRow[];
  properties: TaskPropertyRow[];
  onChip: (page: TaskPageRow, anchor: HTMLElement) => void;
  drag: TriageDrag;
}

/**
 * Priority rows by status columns, each cell holding that combination's pages
 * as chips. The first priority row is the hot zone: its unfinished cells with
 * pages are tinted. Rows carry no visible label: each chip glows in its row's
 * priority tone instead (first option high, last low, the rest medium), calmer
 * in Quality Check and not at all once Done. With no priority property the grid
 * collapses to one "All" row, and likewise for status.
 */
export function TriageGrid({ pages, properties, onChip, drag }: TriageGridProps) {
  const status = properties.find((property) => property.type === 'status');
  const priority = findPriorityProperty(properties);
  const rows = priority?.options.length ? priority.options : [everything];
  const columns = status?.options.length ? status.options : [everything];

  const inCell = (row: TaskPropertyOption, column: TaskPropertyOption) =>
    pages.filter(
      (page) =>
        (!priority?.options.length || page.values[priority.id] === row.id) &&
        (!status?.options.length || page.values[status.id] === column.id),
    );

  return (
    <div className="tsk-grid-wrap">
      <table className="tsk-grid">
        <thead>
          <tr>
            <td />
            {columns.map((column) => (
              <th key={column.id} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id}>
              <th scope="row">
                {priority?.options.length ? (
                  <span className="sr-only">{row.label}</span>
                ) : (
                  <span className="tsk-grid__all">{row.label}</span>
                )}
              </th>
              {columns.map((column) => {
                const here = inCell(row, column);
                const priorityId = priority?.options.length ? row.id : undefined;
                const statusId = status?.options.length ? column.id : undefined;
                const hot =
                  Boolean(priority?.options.length) &&
                  rowIndex === 0 &&
                  labelOf(column) !== 'done' &&
                  here.length > 0;
                return (
                  <td
                    key={column.id}
                    className={cn('tsk-grid__cell', hot && 'is-hot', drag.over(priorityId, statusId))}
                    data-triage-priority={priorityId}
                    data-triage-status={statusId}
                  >
                    {here.map((page) => {
                      const chip = drag.chip(page);
                      return (
                        <button
                          key={page.id}
                          type="button"
                          {...chip}
                          className={cn(
                            chip.className,
                            priorityId && `is-glow-${glowOf(rowIndex, rows.length)}`,
                            statusId && labelOf(column) === 'done' && 'is-done',
                            statusId && labelOf(column) === 'quality check' && 'is-calm',
                          )}
                          data-page-id={page.id}
                          aria-haspopup="menu"
                          onClick={(event) => onChip(page, event.currentTarget)}
                        >
                          {page.icon && (
                            <span className="tsk-grid__icon" aria-hidden="true">
                              {page.icon.kind === 'upload' ? (
                                <img src={page.icon.value} alt="" className="tsk__icon-img" />
                              ) : (
                                page.icon.value
                              )}
                            </span>
                          )}
                          <span className="tsk-grid__title">{page.title}</span>
                        </button>
                      );
                    })}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
