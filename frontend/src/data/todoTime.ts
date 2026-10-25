const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `value` when it is a valid 24h `HH:MM` time, else null ("any time"). */
export function normalizeTime(value: unknown): string | null {
  return typeof value === 'string' && TIME.test(value) ? value : null;
}
