import './base.css';
import './console.css';
import './dawn.css';

export interface Concept {
  readonly id: string;
  readonly name: string;
  readonly fonts: string;
}

export const concepts: readonly Concept[] = [
  { id: 'console', name: 'Console', fonts: 'family=Hanken+Grotesk:wght@400;500;600;700' },
  { id: 'dawn', name: 'Dawn', fonts: 'family=Saira:wght@300..700&family=Saira+Stencil+One' },
];

const loadedFonts = new Set<string>();
let phaseClockStarted = false;

function phaseFor(hour: number): string {
  if (hour >= 20 || hour < 5) return 'night';
  if (hour < 7) return 'first-light';
  if (hour < 10) return 'dawn';
  return 'day';
}

function startPhaseClock(root: HTMLElement) {
  if (phaseClockStarted) return;
  phaseClockStarted = true;

  const syncPhase = () => {
    root.dataset.phase = phaseFor(new Date().getHours());
  };
  syncPhase();
  window.setInterval(syncPhase, 60_000);
}

export function setConcept(id: string | null) {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;

  if (id === null) {
    delete root.dataset.concept;
    return;
  }

  const concept = concepts.find((entry) => entry.id === id);
  if (!concept) return;

  root.dataset.concept = concept.id;

  if (!loadedFonts.has(concept.id)) {
    loadedFonts.add(concept.id);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${concept.fonts}&display=swap`;
    document.head.appendChild(link);
  }

  startPhaseClock(root);
}

let systemQuery: MediaQueryList | null = null;
let currentTheme: 'system' | 'light' | 'dark' = 'system';

export function applyThemeConcept(theme: 'system' | 'light' | 'dark') {
  if (typeof window === 'undefined') return;
  currentTheme = theme;

  const hasMatchMedia = typeof window.matchMedia === 'function';

  const resolve = () => {
    if (theme === 'light') return 'console';
    if (theme === 'dark') return 'dawn';
    if (!hasMatchMedia) return 'console';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dawn' : 'console';
  };

  setConcept(resolve());

  if (theme === 'system' && !systemQuery && hasMatchMedia) {
    systemQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemQuery.addEventListener('change', () => {
      if (currentTheme === 'system') setConcept(resolve());
    });
  }
}
