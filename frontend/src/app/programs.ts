/**
 * The programs AF is a shell for.
 *
 * One list. The nav bar, the dashboard gallery and the split-view picker all
 * derive from it, so adding a program cannot leave one of them behind — the
 * same rule the Flutter build followed with `afPrograms`.
 */
export interface Program {
  /** URL segment, and the handle the split view stores in the query string. */
  readonly slug: string;
  readonly name: string;
  readonly mark: string;
  readonly requiresAuth: boolean;
  /** Wide programs want the room; reading-width ones do not. */
  readonly wide: boolean;
}

export const programs: readonly Program[] = [
  // First, so it is the default route. In the Flutter build the dashboard sat
  // outside the program list as the shell's home; here the nav bar is already
  // the launcher, and a dashboard missing from it is one nobody visits.
  { slug: 'dashboard', name: 'Dashboard', mark: '⌂', requiresAuth: true, wide: true },
  { slug: 'checklists', name: 'Checklists', mark: '☑', requiresAuth: true, wide: false },
  { slug: 'calendar', name: 'Calendar', mark: '▦', requiresAuth: true, wide: true },
  { slug: 'habits', name: 'Habits', mark: '◈', requiresAuth: true, wide: false },
  { slug: 'audio', name: 'Audio Converter', mark: '♪', requiresAuth: true, wide: false },
  { slug: 'ai', name: 'AI', mark: '✦', requiresAuth: true, wide: false },
  { slug: 'qr', name: 'QR Generator', mark: '▣', requiresAuth: true, wide: false },
];

export const programBySlug = (slug: string | null | undefined): Program | undefined =>
  programs.find((program) => program.slug === slug);
