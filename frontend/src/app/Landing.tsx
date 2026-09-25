import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Monogram } from '../components/brand/Monogram';
import { CursorGlow } from '../components/effects/CursorGlow';
import { GlowScrollArea } from '../components/effects/GlowScrollArea';

const PROGRAM_PILLS = [
  'Dashboard',
  'Checklists',
  'Calendar',
  'Habits',
  'Task Tracker',
  'Audio Converter',
  'AI',
  'QR Generator',
];

export function Landing() {
  return (
    <CursorGlow color="var(--glow)" className="h-dvh bg-black font-sans text-foreground">
      <GlowScrollArea className="h-dvh">
        <div className="relative">
          <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-white/[0.08] bg-black/60 px-6 backdrop-blur-md sm:px-12">
            <div className="flex items-center gap-2.5">
              <Monogram size={32} glow />
              <span className="text-lg font-semibold tracking-[-0.01em]">reAFresh</span>
            </div>
            <nav
              aria-label="Site"
              className="absolute left-1/2 hidden -translate-x-1/2 gap-8 text-sm text-muted-foreground md:flex"
            >
              <a href="#programs" className="hover:text-foreground">
                Programs
              </a>
              <a href="#sync" className="hover:text-foreground">
                How sync works
              </a>
              <a href="#changelog" className="hover:text-foreground">
                Changelog
              </a>
            </nav>
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="h-11 px-4 text-foreground sm:h-10">
                <Link to="/signin">Sign in</Link>
              </Button>
              <Button asChild variant="gradient" size="sm" className="h-11 px-4.5 sm:h-10">
                <Link to="/signin?mode=register">Create account</Link>
              </Button>
            </div>
          </header>

          <section className="relative z-10 flex flex-col items-center px-4 pt-[88px]">
            <a
              href="#changelog"
              className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-gradient-to-b from-zinc-800/70 to-zinc-900/50 px-4 py-2 text-xs no-underline shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_24px_-6px_var(--glow)]"
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: 'var(--glow)', boxShadow: '0 0 8px var(--glow)' }}
              />
              <span className="font-medium text-zinc-200">
                New: Task Tracker and a rebuilt dashboard
              </span>
            </a>

            <h1 className="my-6 max-w-[900px] text-center text-[40px] font-medium leading-[1.06] tracking-[-0.05em] text-gradient drop-shadow-[0_0_28px_rgba(255,255,255,0.12)] sm:text-[68px]">
              Everything you track,
              <br />
              in one calm place
            </h1>
            <p className="max-w-[620px] text-center text-[17px] leading-[1.6] text-muted-foreground">
              Proctor checklists, a calendar, habits, tasks and an assistant that reads your
              schedule. Synced to every device you sign in on.
            </p>

            <div className="relative z-10 mt-10 flex flex-wrap justify-center gap-3">
              <Button asChild variant="gradient" size="lg" className="h-12 rounded-xl px-7">
                <Link to="/signin">Get started</Link>
              </Button>
              <Button asChild variant="raised" size="lg" className="h-12 rounded-xl px-6">
                <a href="#programs">See the programs</a>
              </Button>
            </div>

            <div className="relative mt-16 w-full max-w-[1094px] sm:mt-[84px]">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-[-220px] h-[420px] w-[1614px] -translate-x-1/2 opacity-85"
                style={{ background: 'radial-gradient(closest-side, var(--glow), transparent)' }}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-[3%] top-[-60px] hidden h-[200px] w-[92%] opacity-[0.18] sm:block"
                style={{ background: 'radial-gradient(closest-side, #fff7ed, transparent)' }}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-[7%] top-0 hidden h-[2px] w-[86%] sm:block"
                style={{
                  background:
                    'linear-gradient(to right, transparent, var(--glow), #ffffff, var(--glow), transparent)',
                  boxShadow: '0 0 24px var(--glow)',
                }}
              />
              <div
                aria-hidden="true"
                className="relative h-[420px] w-full overflow-hidden rounded-[18px] border border-white/10 bg-black shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_-20px_80px_-30px_var(--glow),0_50px_120px_rgba(0,0,0,0.8)] sm:h-[700px]"
                style={{ transform: 'perspective(2200px) rotateX(8deg)', transformOrigin: 'top center' }}
              >
                <div className="grid h-full grid-cols-[200px_1fr] gap-4 p-4">
                  <div className="surface-3d rounded-xl" />
                  <div className="grid grid-rows-[auto_1fr] gap-4">
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div className="surface-3d h-20 rounded-xl" />
                      <div className="surface-3d h-20 rounded-xl" />
                      <div className="surface-3d h-20 rounded-xl" />
                      <div className="surface-3d h-20 rounded-xl" />
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="surface-3d rounded-xl" />
                      <div className="surface-3d rounded-xl" />
                    </div>
                  </div>
                </div>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-[260px]"
                  style={{ background: 'linear-gradient(to bottom, transparent, #000000)' }}
                />
              </div>
            </div>
          </section>

          <section
            id="programs"
            className="relative z-10 mt-2 flex flex-col items-center gap-5 px-4 pb-24"
          >
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-subtle-foreground">
              Eight programs, one account
            </span>
            <div className="flex max-w-[1000px] flex-wrap justify-center gap-2.5 text-sm">
              {PROGRAM_PILLS.map((label) => (
                <span
                  key={label}
                  className="surface-3d rounded-full px-4 py-2 text-zinc-300"
                >
                  {label}
                </span>
              ))}
            </div>
          </section>
        </div>
      </GlowScrollArea>
    </CursorGlow>
  );
}
