import './base.css';
import './console.css';
import './concourse.css';
import './coupon.css';
import './dawn.css';
import './manual.css';
import './sheet.css';

export interface Concept {
  readonly id: string;
  readonly name: string;
  readonly fonts: string;
}

export const concepts: readonly Concept[] = [
  { id: 'console', name: 'Console', fonts: 'family=Hanken+Grotesk:wght@400;500;600;700' },
  { id: 'concourse', name: 'Concourse', fonts: 'family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600' },
  { id: 'coupon', name: 'Coupon', fonts: 'family=Archivo:wdth,wght@100..125,400..800&family=Courier+Prime:wght@400;700' },
  { id: 'dawn', name: 'Dawn', fonts: 'family=Saira:wght@300..700&family=Saira+Stencil+One' },
  { id: 'manual', name: 'Manual', fonts: 'family=Source+Serif+4:opsz,wght@8..60,400..700&family=Public+Sans:wght@400..700' },
  { id: 'sheet', name: 'Sheet', fonts: 'family=Sofia+Sans:wght@400..700&family=Sofia+Sans+Condensed:wght@500..800' },
];

const STORAGE_KEY = 'af.concept';

let overrideActive = false;
const loadedFonts = new Set<string>();
let progressStarted = false;

function requestedConcept(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get('concept');
  const topLevel = window.top === window;
  if (fromUrl !== null) {
    if (topLevel) {
      try {
        if (fromUrl === 'off') sessionStorage.removeItem(STORAGE_KEY);
        else sessionStorage.setItem(STORAGE_KEY, fromUrl);
      } catch {}
    }
    return fromUrl;
  }
  if (!topLevel) return null;
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function phaseFor(hour: number): string {
  if (hour >= 20 || hour < 5) return 'night';
  if (hour < 7) return 'first-light';
  if (hour < 10) return 'dawn';
  return 'day';
}

function trackProgram(root: HTMLElement) {
  const sync = () => {
    const slug = window.location.pathname.split('/').filter(Boolean)[0] ?? 'landing';
    root.dataset.program = slug;
  };
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method].bind(history);
    history[method] = (...args: Parameters<History['pushState']>) => {
      original(...args);
      sync();
    };
  }
  window.addEventListener('popstate', sync);
  sync();
}

function startProgress(root: HTMLElement) {
  if (progressStarted) return;
  progressStarted = true;

  trackProgram(root);

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

  startProgress(root);
}

let systemQuery: MediaQueryList | null = null;
let currentTheme: 'system' | 'light' | 'dark' = 'system';

export function applyThemeConcept(theme: 'system' | 'light' | 'dark') {
  if (typeof window === 'undefined') return;
  if (overrideActive) return;

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
      if (currentTheme === 'system' && !overrideActive) setConcept(resolve());
    });
  }
}

export function applyConcept() {
  if (typeof window === 'undefined') return;
  const id = requestedConcept();
  const concept = concepts.find((entry) => entry.id === id);

  if (concept) {
    overrideActive = true;
    setConcept(concept.id);
    return;
  }

  overrideActive = false;
  applyThemeConcept('system');
}
