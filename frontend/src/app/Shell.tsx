import { useCallback, useState } from 'react';
import { NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { visiblePrograms } from './programs';
import { SplitView } from './SplitView';
import { renderProgram } from './registry';
import { useSession } from './session';
import { AFButton, AFIconButton } from '../components/AF';
import { ProfileScreen } from '../programs/profile/ProfileScreen';
import './shell.css';

/**
 * Whether the local database and Firestore currently agree — a dot, not a
 * word: blue reads as settled (synced, or nothing to sync yet), orange as
 * "something's happening or wrong" (syncing, failed, signed out). The exact
 * state is still one hover away, in the title.
 */
function SyncBadge() {
  const { syncStatus, syncError, syncNow } = useSession();

  const label: Record<typeof syncStatus, string> = {
    signedOut: 'signed out',
    idle: 'idle',
    syncing: 'syncing…',
    synced: 'synced',
    failed: 'sync failed',
  };
  const settled = syncStatus === 'synced' || syncStatus === 'idle';

  return (
    <button
      type="button"
      className={`af-nav__sync${settled ? ' is-settled' : ' is-busy'}`}
      title={syncError ?? label[syncStatus]}
      aria-label={`Sync status: ${label[syncStatus]}`}
      onClick={() => void syncNow()}
    >
      <span className="af-nav__dot" aria-hidden />
    </button>
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
  const { admin, settings, signOut } = useSession();
  const [showProfile, setShowProfile] = useState(false);

  const available = visiblePrograms(admin, settings.hiddenPrograms);

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

        <div className="af-nav__session">
          <SyncBadge />
          <AFIconButton
            glyph="⚙"
            tooltip="Profile and settings"
            bordered={false}
            onClick={() => setShowProfile(true)}
          />
          <AFButton label="Sign out" variant="quiet" onClick={() => void signOut()} />
        </div>
      </nav>

      {showProfile && <ProfileScreen onClose={() => setShowProfile(false)} />}

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
