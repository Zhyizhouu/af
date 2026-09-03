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
  /**
   * Hidden from every account without the `admin` claim.
   *
   * Presentation only. The program's routes refuse a non-admin server-side on
   * their own; this exists so the app does not offer a door that will not open.
   */
  readonly requiresAdmin?: boolean;
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
  { slug: 'tasks', name: 'Task Tracker', mark: '◆', requiresAuth: true, wide: true },
  { slug: 'audio', name: 'Audio Converter', mark: '♪', requiresAuth: true, wide: false },
  { slug: 'ai', name: 'AI', mark: '✦', requiresAuth: true, wide: false },
  { slug: 'qr', name: 'QR Generator', mark: '▣', requiresAuth: true, wide: false },
];

export const programBySlug = (slug: string | null | undefined): Program | undefined =>
  programs.find((program) => program.slug === slug);

/**
 * The list as this account may see it.
 *
 * Everything that draws a program list goes through here rather than filtering
 * for itself. The nav bar, the dashboard gallery and the split-view picker each
 * remembering separately is precisely the bug one list exists to prevent — and
 * the one that leaks is whichever gets added next.
 *
 * `hidden` is the account's own choice — Profile's "Displayed Applications"
 * section (`settings.hiddenPrograms`) — layered on top of the admin gate.
 * Never lets `hidden` remove the last program: a self-service preference
 * should not be able to strand the account with nowhere to land.
 */
export const visiblePrograms = (
  admin: boolean,
  hidden: ReadonlySet<string> | readonly string[] = [],
): readonly Program[] => {
  const hiddenSet = hidden instanceof Set ? hidden : new Set(hidden);
  const gated = admin ? programs : programs.filter((program) => !program.requiresAdmin);
  const chosen = gated.filter((program) => !hiddenSet.has(program.slug));
  return chosen.length > 0 ? chosen : gated;
};
