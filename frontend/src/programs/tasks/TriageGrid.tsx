import type { Ref } from 'react';
import { cn } from 'cn';
import type { TaskPageRow, TaskPropertyOption, TaskPropertyRow } from '../../data/db';
import { optionOfPage, statusRole } from './roles';
import { findPriorityProperty, type PropertyFilter } from './store';
import type { TriageDrag } from './useTriageDrag';
import './badges.css';

const everything: TaskPropertyOption = { id: '', label: 'All', toneIndex: 4 };

const glowOf = (index: number, total: number): 'high' | 'medium' | 'low' =>
  index <= 0 ? 'high' : index >= total - 1 ? 'low' : 'medium';

const unset: TaskPropertyOption = { id: '', label: 'Unset', toneIndex: 4 };

interface TriageGridProps {
  pages: TaskPageRow[];
  properties: TaskPropertyRow[];
  filters?: readonly PropertyFilter[];
  onChip: (page: TaskPageRow, anchor: HTMLElement) => void;
  drag: TriageDrag;
  containerRef?: Ref<HTMLDivElement>;
}

/**
 * Priority rows by status columns, each cell holding that combination's pages
 * as chips. The first priority row is the hot zone: its unfinished cells with
 * pages are tinted. Rows carry no visible label: each chip glows in its row's
 * priority tone instead (first option high, last low, the rest medium), calmer
 * in Quality Check and not at all once Done. With no priority property the grid
 * collapses to one "All" row, and likewise for status. A page whose value is
 * missing, cleared or points at a deleted option sits in a muted "Unset" row
 * or column, shown only while a page needs it; chips can be dragged out of it
 * but nothing can be dropped into it. Options unticked in the filter are left
 * off the axes, while glow and the hot zone keep following each option's place
 * in the full priority list; if nothing is left on an axis the grid is replaced
 * by a short note.
 */
export function TriageGrid({ pages, properties, filters = [], onChip, drag, containerRef }: TriageGridProps) {
  const status = properties.find((property) => property.type === 'status');
  const priority = findPriorityProperty(properties);
  const hasPriority = Boolean(priority?.options.length);
  const hasStatus = Boolean(status?.options.length);
  const needsUnset = (property: TaskPropertyRow | undefined, enabled: boolean) =>
    enabled && pages.some((page) => !optionOfPage(property, page));
  const shown = (property: TaskPropertyRow) => {
    const clause = filters.find((filter) => filter.kind === 'options' && filter.propertyId === property.id);
    return property.options.filter((option) => !(clause?.kind === 'options' && clause.excluded.has(option.id)));
  };
  const rows = hasPriority
    ? [...shown(priority!), ...(needsUnset(priority, hasPriority) ? [unset] : [])]
    : [everything];
  const columns = hasStatus
    ? [...shown(status!), ...(needsUnset(status, hasStatus) ? [unset] : [])]
    : [everything];

  if (rows.length === 0 || columns.length === 0) {
    return (
      <div className="tsk-grid-wrap" ref={containerRef}>
        <p className="text-[13px] text-muted-foreground">Nothing matches the filter.</p>
      </div>
    );
  }

  const onAxis = (
    property: TaskPropertyRow | undefined,
    enabled: boolean,
    option: TaskPropertyOption,
    page: TaskPageRow,
  ) => {
    if (!enabled) return true;
    const own = optionOfPage(property, page);
    return option === unset ? !own : own?.id === option.id;
  };

  const inCell = (row: TaskPropertyOption, column: TaskPropertyOption) =>
    pages.filter(
      (page) => onAxis(priority, hasPriority, row, page) && onAxis(status, hasStatus, column, page),
    );

  return (
    <div className="tsk-grid-wrap" ref={containerRef}>
      <table className="tsk-grid">
        <thead>
          <tr>
            <td />
            {columns.map((column) => (
              <th key={column.id} scope="col" className={cn(column === unset && 'tsk-grid__unset')}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">
                {hasPriority ? (
                  <span className="sr-only">{row.label}</span>
                ) : (
                  <span className="tsk-grid__all">{row.label}</span>
                )}
              </th>
              {columns.map((column) => {
                const here = inCell(row, column);
                const dead = row === unset || column === unset;
                const priorityId = hasPriority && row !== unset ? row.id : undefined;
                const statusId = hasStatus && column !== unset ? column.id : undefined;
                const role = statusId ? statusRole(status!, column) : null;
                const hot = hasPriority && row === priority!.options[0] && role !== 'done' && here.length > 0;
                return (
                  <td
                    key={column.id}
                    className={cn(
                      'tsk-grid__cell',
                      hot && 'is-hot',
                      dead ? 'is-unset' : drag.over(priorityId, statusId),
                    )}
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
                            priorityId && `is-glow-${glowOf(priority!.options.indexOf(row), priority!.options.length)}`,
                            role === 'done' && 'is-done',
                            role === 'review' && 'is-calm',
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
