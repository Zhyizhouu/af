/**
 * The app-wide colour palette: a fixed set of theme-aware tones, referenced
 * everywhere by index rather than by raw colour.
 *
 * Started as Calendar's category colours; Habits and Task Tracker's property
 * options now share it too, which is why it lives here rather than under any
 * one program.
 */

/**
 * A theme-aware colour pair.
 *
 * Referenced by **index**, never a raw colour, so every consumer stays
 * legible on both themes — a stored white is invisible on a white panel.
 * Append only, never reorder: the index is what is stored, so moving one
 * recolours everything that referenced it.
 */
export interface CategoryTone {
  name: string;
  light: string;
  dark: string;
}

export const categoryTones: readonly CategoryTone[] = [
  { name: 'Blue', light: '#3b49ff', dark: '#5d69ff' },
  { name: 'Green', light: '#2f8f4e', dark: '#4fbf74' },
  { name: 'Orange', light: '#c2621c', dark: '#e8883f' },
  // "Yellow" as a legible amber — pure yellow fails against a white panel.
  { name: 'Yellow', light: '#a37a00', dark: '#e0b830' },
  // "White" as a neutral: slate on light, near-white on dark.
  { name: 'Neutral', light: '#64748b', dark: '#e2e5ea' },
  { name: 'Rose', light: '#c02b5b', dark: '#f06a94' },
  { name: 'Violet', light: '#6d28d9', dark: '#a78bfa' },
  { name: 'Teal', light: '#0f766e', dark: '#2dd4bf' },
  { name: 'Cyan', light: '#0369a1', dark: '#38bdf8' },
  { name: 'Brown', light: '#7c4a21', dark: '#c08552' },
];

export const toneAt = (index: number): CategoryTone =>
  categoryTones[Math.min(Math.max(index, 0), categoryTones.length - 1)]!;

/**
 * The colour to paint a tone, resolved against the active theme.
 *
 * Read off the document rather than passed down, because the theme is a CSS
 * variable and this has to agree with it at the moment of painting.
 */
export function toneColor(index: number): string {
  const tone = toneAt(index);
  const explicit = document.documentElement.dataset.theme;
  const dark =
    explicit === 'dark' ||
    (!explicit && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  return dark ? tone.dark : tone.light;
}

/**
 * A tone's solid colour, softened to a background — for a filled chip whose
 * text stays the solid colour. `alpha` out of 1.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
