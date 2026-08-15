/**
 * Jakarta time, and the day boundaries every habit record is bucketed into.
 *
 * Habits are counted per *day*, so the only question that matters is which day
 * an instant belongs to — and that answer must not change when the device's
 * clock does. A laptop taken to Singapore, or a browser reporting UTC, would
 * otherwise silently move a tick onto the wrong day and corrupt a streak.
 *
 * Indonesia does not observe daylight saving, so WIB is UTC+7 all year and a
 * fixed offset is exact rather than an approximation. That is what makes this
 * safe to do without a timezone database.
 */

export const jakartaOffsetMs = 7 * 60 * 60 * 1000;

/**
 * The Jakarta wall clock, as a Date whose **UTC** fields read as Jakarta local
 * time. Read it with `getUTCFullYear` and friends, never the local getters, and
 * never compare it to a plain `new Date()`.
 */
export const jakartaNow = (now: Date = new Date()): Date =>
  new Date(now.getTime() + jakartaOffsetMs);

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The Jakarta day an instant falls on, as `YYYY-MM-DD`.
 *
 * A string, because this is also the record's identity — its IndexedDB key and
 * its Firestore document id. Sortable, readable in the console, and immune to
 * the drift a Date key would carry.
 */
export function jakartaDayKey(instant: Date = new Date()): string {
  const shifted = jakartaNow(instant);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}`;
}

/** A day key as a UTC-midnight Date, for formatting and arithmetic. */
export function dayFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export const keyFromDay = (day: Date): string =>
  `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;

/**
 * The [count] day keys ending at [todayKey], newest first.
 *
 * Takes the day rather than reading the clock, so the rows a view lists and the
 * labels it puts on them come from one value. Deriving them separately lets
 * them disagree for the minute either side of midnight.
 */
export function dayKeysFrom(todayKey: string, count: number): string[] {
  const today = dayFromKey(todayKey);
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - i);
    return keyFromDay(day);
  });
}

export const recentDayKeys = (count: number, now?: Date): string[] =>
  dayKeysFrom(jakartaDayKey(now), count);

/**
 * How long until the Jakarta day rolls over.
 *
 * Used to schedule the rollover rather than poll for it: a timer that sleeps
 * until the boundary costs nothing and lands on it exactly, where a one-minute
 * poll is both wasteful and up to a minute late.
 */
export function msUntilJakartaMidnight(now: Date = new Date()): number {
  const shifted = jakartaNow(now);
  const nextMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1,
  );
  return nextMidnight - shifted.getTime();
}

const longFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * What to call a day in a list.
 *
 * Derived from the key rather than stored, so a record written yesterday reads
 * as "Yesterday" today and as its date tomorrow without anything being renamed
 * in storage.
 */
export function dayLabel(key: string, todayKey: string = jakartaDayKey()): string {
  if (key === todayKey) return 'Today';
  const yesterday = dayKeysFrom(todayKey, 2)[1];
  if (key === yesterday) return 'Yesterday';
  return longFormat.format(dayFromKey(key));
}
