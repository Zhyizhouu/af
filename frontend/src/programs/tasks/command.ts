import type { TaskPropertyOption } from '../../data/db';

export interface TaskCommandToken {
  kind: 'status' | 'priority';
  optionId: string;
  label: string;
}

export interface TaskCommandResult {
  title: string;
  statusId?: string;
  priorityId?: string;
  tokens: TaskCommandToken[];
}

const compact = (label: string): string => label.toLowerCase().replace(/\s+/g, '');

export const startsMatch = (label: string, needle: string): boolean =>
  compact(label).startsWith(needle) ||
  label
    .toLowerCase()
    .split(/\s+/)
    .some((word) => word.startsWith(needle));

export const initials = (label: string): string =>
  label
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('');

const statusAliases: Record<string, string> = { start: 'not started' };

function matchOption(
  word: string,
  options: readonly TaskPropertyOption[],
  aliases: Record<string, string> = {},
): TaskPropertyOption | undefined {
  const needle = word.toLowerCase();
  const aliased = aliases[needle];
  if (aliased) {
    const target = options.find((option) => option.label.trim().toLowerCase() === aliased);
    if (target) return target;
  }
  return (
    options.find((option) => startsMatch(option.label, needle)) ??
    options.find((option) => initials(option.label) === needle)
  );
}

/**
 * Reads quick-add syntax out of a typed page title: `!word` picks a priority
 * option and `>word` a status option. A word matches an option whose label
 * (lowercased, spaces removed) or any single word of it starts with it, or
 * whose word initials equal it (`>qc` is "Quality Check"); `>start` is an alias for "Not started".
 * Matched tokens leave the title, unmatched ones stay as typed, and the last
 * match of each kind wins.
 */
export function parseTaskCommand(
  text: string,
  statusOptions: TaskPropertyOption[],
  priorityOptions: TaskPropertyOption[],
): TaskCommandResult {
  const tokens: TaskCommandToken[] = [];
  const kept: string[] = [];
  let statusId: string | undefined;
  let priorityId: string | undefined;

  for (const word of text.split(/\s+/)) {
    const prefix = word[0];
    if ((prefix === '!' || prefix === '>') && word.length > 1) {
      const kind = prefix === '!' ? 'priority' : 'status';
      const option =
        kind === 'priority'
          ? matchOption(word.slice(1), priorityOptions)
          : matchOption(word.slice(1), statusOptions, statusAliases);
      if (option) {
        tokens.push({ kind, optionId: option.id, label: option.label });
        if (kind === 'priority') priorityId = option.id;
        else statusId = option.id;
        continue;
      }
    }
    if (word) kept.push(word);
  }

  return {
    title: kept.join(' '),
    ...(statusId !== undefined ? { statusId } : {}),
    ...(priorityId !== undefined ? { priorityId } : {}),
    tokens,
  };
}
