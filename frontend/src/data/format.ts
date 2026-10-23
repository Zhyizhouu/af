/**
 * 24-hour `HH:mm` in the viewer's locale, built once: an `Intl.DateTimeFormat`
 * is costly to construct and every agenda row formats with it.
 */
export const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
