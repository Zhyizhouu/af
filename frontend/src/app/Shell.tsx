import { useCallback } from 'react';
import { NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { visiblePrograms } from './programs';
import { SplitView } from './SplitView';
import { renderProgram } from './registry';
import { useSession } from './session';
import { AFButton } from '../components/AF';
import './shell.css';

/**
 * Whether the local database and Firestore currently agree.
 *
 * Shown rather than hidden because AF is local-first: writes land immediately
 * and reconcile a moment later, so "saved" and "saved everywhere" are genuinely
 * different states and only one of them survives losing this device.
 */
function SyncBadge() {
  const { syncStatus, syncError, syncNow, signOut } = useSession();

  const label: Record<typeof syncStatus, string> = {
    signedOut: 'signed out',
    idle: 'idle',
    syncing: 'syncing…',
    synced: 'synced',
    failed: 'sync failed',
  };

  return (
    <div className="af-nav__session">
      <button
        type="button"
        className={`af-nav__sync${syncStatus === 'failed' ? ' is-failed' : ''}`}
        title={syncError ?? 'Sync now'}
        onClick={() => void syncNow()}
      >
        <span className="af-nav__dot" aria-hidden />
        {label[syncStatus]}
      </button>
      <AFButton label="Sign out" variant="quiet" onClick={() => void signOut()} />
    </div>
  );
}

/**
 * The shell: nav bar above, one or two programs below.
 *
 * The second pane is a query parameter on whatever route you are already on,
 * so `/calendar?split=ai` is a real, refreshable URL rather than a mode the
 * app remembers. Opening the same program on both sides is refused — two
 * copies of one calendar is not a use, it is a mistake you have to undo.
 */
export function Shell() {
  const { slug } = useParams<{ slug: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { admin } = useSession();

  const available = visiblePrograms(admin);

  // Resolved against the visible list, not the full one, so a deep link to an
  // admin program reads as an unknown slug for everybody else — the same
  // recovery path a deleted program gets. Rendering it and letting its requests
  // 403 would technically be safe and would look like the app is broken.
  const reachable = (target: string | null | undefined) =>
    available.find((program) => program.slug === target);

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

  return (
    <div className="af-shell">
      <nav className="af-nav">
        <span className="af-masthead__tick" />
        <span className="af-brand af-nav__brand">reAFresh</span>

        <div className="af-nav__links">
          {available.map((program) => (
            <NavLink
              key={program.slug}
              to={{ pathname: `/${program.slug}`, search: params.toString() }}
              className={({ isActive }) => `af-nav__link${isActive ? ' is-active' : ''}`}
            >
              <span aria-hidden>{program.mark}</span>
              {program.name}
            </NavLink>
          ))}
        </div>

        {/* The split picker lives in the nav rather than inside a program,
            because which two things sit side by side is a shell decision. */}
        <label className="af-nav__split">
          <span className="af-panel-label">Split</span>
          <select
            className="af-nav__select"
            value={secondary?.slug ?? ''}
            onChange={(event) => openSecondary(event.target.value)}
          >
            <option value="">off</option>
            {available
              .filter((program) => program.slug !== primary.slug)
              .map((program) => (
                <option key={program.slug} value={program.slug}>
                  {program.name}
                </option>
              ))}
          </select>
        </label>

        <SyncBadge />
      </nav>

      <main className="af-shell__body">
        <SplitView
          primary={renderProgram(primary, { paneWidth: secondary ? 'split' : 'full' })}
          secondary={
            secondary ? renderProgram(secondary, { paneWidth: 'split' }) : null
          }
          onCloseSecondary={() => openSecondary('')}
        />
      </main>

      {/* Kept so a deep link to a program that no longer exists lands
          somewhere real rather than on an empty shell. */}
      {!reachable(slug) && slug !== undefined && (
        <button
          type="button"
          className="af-shell__recover"
          onClick={() => navigate(`/${available[0]!.slug}`, { replace: true })}
        >
          {slug} is not a program here — go to {available[0]!.name}
        </button>
      )}
    </div>
  );
}
