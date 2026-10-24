import type { TaskPageRow, TaskPropertyOption, TaskPropertyRow } from '../../data/db';

export type StatusRole = 'todo' | 'doing' | 'review' | 'done';

export interface OptionOwner {
  options: readonly TaskPropertyOption[];
}

const labelRoles: Record<string, StatusRole> = {
  'not started': 'todo',
  'in progress': 'doing',
  'quality check': 'review',
  'in correction': 'review',
  done: 'done',
};

const normalize = (label: string): string => label.trim().toLowerCase();

export function statusRole(
  owner: OptionOwner,
  option: TaskPropertyOption | undefined,
): StatusRole | null {
  if (!option) return null;
  const byLabel = labelRoles[normalize(option.label)];
  if (byLabel) return byLabel;
  const at = owner.options.findIndex((candidate) => candidate.id === option.id);
  if (at < 0) return null;
  if (at === 0) return 'todo';
  if (at === owner.options.length - 1) return 'done';
  return at === 1 ? 'doing' : 'review';
}

export const isDoneOption = (owner: OptionOwner, option: TaskPropertyOption | undefined): boolean =>
  statusRole(owner, option) === 'done';

export const statusUrgencyOrder: readonly StatusRole[] = ['doing', 'review', 'todo'];

export function statusUrgency(owner: OptionOwner, option: TaskPropertyOption | undefined): number {
  const role = statusRole(owner, option);
  const at = role ? statusUrgencyOrder.indexOf(role) : -1;
  return at < 0 ? statusUrgencyOrder.length : at;
}

export function priorityRank(owner: OptionOwner, option: TaskPropertyOption | undefined): number {
  const at = option ? owner.options.findIndex((candidate) => candidate.id === option.id) : -1;
  return at < 0 ? owner.options.length : at;
}

export function defaultPriorityOption(owner: OptionOwner): TaskPropertyOption | undefined {
  return (
    owner.options.find((option) => normalize(option.label) === 'medium') ??
    owner.options[Math.floor((owner.options.length - 1) / 2)]
  );
}

export function optionOfPage(
  property: TaskPropertyRow | undefined,
  page: TaskPageRow,
): TaskPropertyOption | undefined {
  if (!property) return undefined;
  const value = page.values[property.id];
  return typeof value === 'string' ? property.options.find((option) => option.id === value) : undefined;
}
