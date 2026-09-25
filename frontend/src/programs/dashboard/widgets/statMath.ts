import type { AgendaEntry } from '../../../data/agenda';
import type { TaskPageRow, TaskPropertyRow } from '../../../data/db';
import { dayFromKey, jakartaDayKey, jakartaOffsetMs } from '../../habits/time';

const dayMs = 86_400_000;

function startOfJakartaDay(now: Date): number {
  return dayFromKey(jakartaDayKey(now)).getTime() - jakartaOffsetMs;
}

export function countDueThisWeek(entries: readonly AgendaEntry[], now: Date = new Date()): number {
  const start = startOfJakartaDay(now);
  const end = start + 7 * dayMs;
  return entries.filter(
    (entry) =>
      entry.kind === 'task' &&
      !entry.finished &&
      entry.start.getTime() >= start &&
      entry.start.getTime() < end,
  ).length;
}

export function countDueToday(entries: readonly AgendaEntry[], now: Date = new Date()): number {
  const start = startOfJakartaDay(now);
  const end = start + dayMs;
  return entries.filter(
    (entry) =>
      entry.kind === 'task' &&
      !entry.finished &&
      entry.start.getTime() >= start &&
      entry.start.getTime() < end,
  ).length;
}

export function eventsToday(entries: readonly AgendaEntry[], now: Date = new Date()): number {
  const start = startOfJakartaDay(now);
  const end = start + dayMs;
  return entries.filter(
    (entry) => entry.kind !== 'task' && entry.start.getTime() >= start && entry.start.getTime() < end,
  ).length;
}

export function nextEvent(entries: readonly AgendaEntry[], now: Date = new Date()): AgendaEntry | undefined {
  const start = startOfJakartaDay(now);
  const end = start + dayMs;
  return entries
    .filter(
      (entry) =>
        entry.kind !== 'task' &&
        entry.start.getTime() >= start &&
        entry.start.getTime() < end &&
        entry.start.getTime() > now.getTime(),
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
}

export interface StatusCount {
  id: string;
  label: string;
  toneIndex: number | null;
  count: number;
}

export function countByStatus(
  pages: readonly TaskPageRow[],
  properties: readonly TaskPropertyRow[],
): StatusCount[] {
  const status = properties.find((property) => property.type === 'status');
  const options = status ? status.options : [];
  const counts = new Map<string, number>();
  let noStatus = 0;

  for (const page of pages) {
    const value = status ? page.values[status.id] : undefined;
    const option = typeof value === 'string' ? options.find((candidate) => candidate.id === value) : undefined;
    if (option) counts.set(option.id, (counts.get(option.id) ?? 0) + 1);
    else noStatus += 1;
  }

  return [
    ...options.map((option) => ({
      id: option.id,
      label: option.label,
      toneIndex: option.toneIndex,
      count: counts.get(option.id) ?? 0,
    })),
    { id: 'no-status', label: 'No status', toneIndex: null, count: noStatus },
  ];
}
