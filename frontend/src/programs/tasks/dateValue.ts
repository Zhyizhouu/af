import { dayFromKey, jakartaDayKey, jakartaOffsetMs } from '../habits/time';

export const dateValueFromKey = (key: string): number => dayFromKey(key).getTime() - jakartaOffsetMs;

export const dateValueKey = (value: number): string => jakartaDayKey(new Date(value));

export const formatDateValue = (value: number): string =>
  dayFromKey(dateValueKey(value)).toLocaleDateString(undefined, { timeZone: 'UTC' });
