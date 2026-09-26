import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { NavLink, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { cn } from 'cn';
import {
  Activity,
  CalendarDays,
  ClipboardCheck,
  House,
  Music,
  QrCode,
  Settings,
  Table2,
} from 'lucide-react';
import { visiblePrograms } from './programs';
import { SplitView } from './SplitView';
import { renderProgram } from './registry';
import { useSession, type SyncStatus } from './session';
import { Intro } from './Intro';
import { ProfileScreen } from '../programs/profile/ProfileScreen';
import { Monogram } from '../components/brand/Monogram';
import { AIMark } from '../components/brand/AIMark';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '../components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

const programIcons: Record<string, typeof House> = {
  dashboard: House,
  checklists: ClipboardCheck,
  calendar: CalendarDays,
  habits: Activity,
  tasks: Table2,
  audio: Music,
  qr: QrCode,
};

function ProgramIcon({ slug }: { slug: string }) {
  if (slug === 'ai') return <AIMark size={18} />;
  const Icon = programIcons[slug] ?? House;
  return <Icon size={18} aria-hidden />;
}

const syncLabel: Record<SyncStatus, string> = {
  signedOut: 'signed out',
  idle: 'idle',
  syncing: 'syncing…',
  synced: 'synced',
  failed: 'sync failed',
};

function syncDotStyle(status: SyncStatus) {
  if (status === 'syncing') {
    return { color: '#fbbf24', halo: 'rgba(251,191,36,0.18)', pulse: true };
  }
  if (status === 'failed' || status === 'signedOut') {
    return { color: '#fb7185', halo: 'rgba(251,113,133,0.18)', pulse: false };
  }
  return { color: '#34d399', halo: 'rgba(52,211,153,0.18)', pulse: false };
}

function SyncBadge() {
  const { syncStatus, syncError, syncNow } = useSession();
  const visual = syncDotStyle(syncStatus);

  return (
    <button
      type="button"
      className={cn(
        'shrink-0 rounded-full',
        visual.pulse && 'animate-pulse motion-reduce:animate-none',
      )}
      style={{
        width: 8,
        height: 8,
        background: visual.color,
        boxShadow: `0 0 0 3px ${visual.halo}`,
      }}
      title={syncError ?? syncLabel[syncStatus]}
      aria-label={`Sync status: ${syncLabel[syncStatus]}`}
      onClick={() => void syncNow()}
    />
  );
}

function accountFirstLine(displayName: string | null, email: string | null): string {
  const name = displayName?.trim();
  if (name) return name;
  const trimmedEmail = email?.trim();
  if (trimmedEmail) return trimmedEmail.split('@')[0] || trimmedEmail;
  return 'Account';
}

function initialsFor(firstLine: string): string {
  const source = firstLine.trim();
  if (!source) return '?';
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function Shell() {
  const { slug } = useParams<{ slug: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { admin, settings, user, syncNow, signOut } = useSession();
  const [showProfile, setShowProfile] = useState(false);

  const available = visiblePrograms(admin, settings.hiddenPrograms);
  const routable = visiblePrograms(admin);

  const reachable = (target: string | null | undefined) =>
    routable.find((program) => program.slug === target);

  const primary = reachable(slug) ?? available[0]!;
  const secondarySlug = params.get('split');
  const secondary =
    secondarySlug && secondarySlug !== primary.slug ? reachable(secondarySlug) : undefined;

  const openSecondary = useCallback(
    (target: string) => {
      const next = new URLSearchParams(params);
      if (target) next.set('split', target);
      else next.delete('split');
      setParams(next, { replace: false });
    },
    [params, setParams],
  );

  const displayName = accountFirstLine(user?.displayName ?? null, user?.email ?? null);
  const email = user?.email ?? '';
  const initials = initialsFor(displayName);

  const [showIntro, setShowIntro] = useState(false);
  const [introDocked, setIntroDocked] = useState(false);
  const [reducedMotion] = useState(() => {
    try {
      return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (primary.slug !== 'dashboard') return;
    try {
      if (localStorage.getItem('af.intro.seen') !== '1') {
        setShowIntro(true);
        try {
          localStorage.setItem('af.intro.seen', '1');
        } catch {}
      }
    } catch {}
  }, [primary.slug]);

  return (
    <SidebarProvider
      className="h-dvh min-h-0 w-full overflow-hidden bg-black font-sans text-foreground"
      style={{ '--sidebar-width': '248px' } as CSSProperties}
    >
      <Sidebar collapsible="icon">
        <div className="relative flex h-full min-h-0 w-full flex-col">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#0d0d0f,#050506)]"
          />
          <div className="relative flex h-full min-h-0 w-full flex-col">
            <SidebarHeader>
              <div className="flex items-center gap-2.5 px-2 py-1">
                <span data-shell-dock className="inline-flex shrink-0">
                  <Monogram size={32} />
                </span>
                <span className="truncate text-[16px] font-semibold tracking-[-0.01em] text-foreground group-data-[collapsible=icon]:hidden">
                  reAFresh
                </span>
              </div>
            </SidebarHeader>

            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">
                  Programs
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {available.map((program) => {
                      const isActive = location.pathname === `/${program.slug}`;
                      return (
                        <SidebarMenuItem key={program.slug}>
                          <SidebarMenuButton
                            asChild
                            tooltip={program.name}
                            isActive={isActive}
                            className={cn(
                              'h-10 gap-3 text-[14px]',
                              isActive
                                ? 'glow-active text-foreground'
                                : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
                            )}
                          >
                            <NavLink to={{ pathname: `/${program.slug}`, search: params.toString() }}>
                              <ProgramIcon slug={program.slug} />
                              <span>{program.name}</span>
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="border-t border-white/[0.06] pt-3">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Settings"
                    onClick={() => setShowProfile(true)}
                    className="h-10 gap-3 text-[14px] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                  >
                    <Settings size={18} aria-hidden />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>

              <div className="surface-3d mt-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 group-data-[collapsible=icon]:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[12px] font-semibold text-foreground">
                        {initials}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[13px] font-medium text-foreground">
                          {displayName}
                        </span>
                        <span className="truncate text-[11px] text-subtle-foreground">{email}</span>
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onSelect={() => void syncNow()}>Sync now</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void signOut()}>Sign out</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <SyncBadge />
              </div>
            </SidebarFooter>
          </div>
        </div>
      </Sidebar>

      <SidebarInset className="min-h-0 overflow-hidden bg-black">
        <div
          className={cn(
            'flex h-full min-h-0 w-full flex-col',
            showIntro && !introDocked ? 'opacity-0' : 'opacity-100',
            !reducedMotion &&
              (showIntro && !introDocked ? 'translate-y-[18px] scale-[0.985]' : 'translate-y-0 scale-100'),
            reducedMotion
              ? 'transition-opacity duration-700'
              : 'transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]',
          )}
        >
          <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] bg-black/60 px-4 backdrop-blur sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger className="raised size-9 rounded-md" aria-label="Toggle navigation" />
              <h1 className="truncate text-[18px] font-semibold tracking-[-0.02em] text-foreground">
                {primary.name}
              </h1>
            </div>

            <div className="hidden items-center gap-2 md:flex">
              <span id="shell-split-label" className="sr-only">
                Split view
              </span>
              <Select
                value={secondary?.slug ?? 'off'}
                onValueChange={(value) => openSecondary(value === 'off' ? '' : value)}
              >
                <SelectTrigger aria-labelledby="shell-split-label" className="w-[168px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  {routable
                    .filter(
                      (program) =>
                        program.slug !== primary.slug &&
                        (program.slug === secondary?.slug || available.includes(program)),
                    )
                    .map((program) => (
                      <SelectItem key={program.slug} value={program.slug}>
                        {program.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </header>

          {showProfile && <ProfileScreen onClose={() => setShowProfile(false)} />}

          <main className="min-h-0 flex-1">
            <SplitView
              primary={renderProgram(primary, { paneWidth: secondary ? 'split' : 'full' })}
              secondary={secondary ? renderProgram(secondary, { paneWidth: 'split' }) : null}
              onCloseSecondary={() => openSecondary('')}
            />
          </main>

          {!reachable(slug) && slug !== undefined && (
            <button
              type="button"
              className="mx-5 mb-3 rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2 font-mono text-xs text-amber-400"
              onClick={() => navigate(`/${available[0]!.slug}`, { replace: true })}
            >
              {slug} is not a program here. Go to {available[0]!.name}
            </button>
          )}
        </div>
      </SidebarInset>

      {showIntro && (
        <Intro onDock={() => setIntroDocked(true)} onDone={() => setShowIntro(false)} />
      )}
    </SidebarProvider>
  );
}
