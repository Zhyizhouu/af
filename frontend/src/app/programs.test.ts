import { describe, expect, it } from 'vitest';
import { programBySlug, programs, visiblePrograms } from './programs';

/**
 * Admin visibility is presentation, but it is presentation with a rule: one
 * list feeds the nav bar, the dashboard gallery and the split picker, and the
 * bug this guards against is a future program being added to the list and
 * leaking through whichever surface forgot to filter.
 */
describe('visiblePrograms', () => {
  it('gives an admin everything', () => {
    expect(visiblePrograms(true)).toEqual(programs);
  });

  it('hides admin-only programs from everybody else', () => {
    const visible = visiblePrograms(false);
    expect(visible.every((program) => !program.requiresAdmin)).toBe(true);
    expect(visible).toHaveLength(programs.filter((p) => !p.requiresAdmin).length);
  });

  // The default route is available[0]. A shell that filtered the list but
  // still landed on a hidden program would defeat the whole thing.
  it('leaves a non-admin a program to land on', () => {
    const visible = visiblePrograms(false);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible[0]!.requiresAdmin).toBeFalsy();
  });

  // Filtering is by flag, never by a hardcoded list of slugs, so adding a
  // program cannot leave this behind.
  it('is driven by the flag, not by a slug list', () => {
    const flagged = programs.filter((program) => program.requiresAdmin);
    const hidden = programs.filter(
      (program) => !visiblePrograms(false).some((v) => v.slug === program.slug),
    );
    expect(hidden.map((p) => p.slug)).toEqual(flagged.map((p) => p.slug));
  });

  // programBySlug still sees everything on purpose: it answers "does this slug
  // name a program", and the Shell layers reachability on top. Conflating the
  // two would make a hidden program indistinguishable from a deleted one at
  // every other call site.
  it('does not change what programBySlug resolves', () => {
    for (const program of programs) {
      expect(programBySlug(program.slug)).toBe(program);
    }
  });
});
