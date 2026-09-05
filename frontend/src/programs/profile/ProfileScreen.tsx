import { useState } from 'react';
import { AFButton, AFHint, AFPanel } from '../../components/AF';
import { useSession } from '../../app/session';
import { programs } from '../../app/programs';
import { auth, authErrorMessage, type User } from '../../data/firebase';
import type { SettingsRow } from '../../data/db';
import { changeEmail, changePassword, hasPasswordProvider, providerLabel } from './store';
import './profile.css';

type Tab = 'credentials' | 'font' | 'apps';

const tabs: { id: Tab; label: string }[] = [
  { id: 'credentials', label: 'Credentials' },
  { id: 'font', label: 'Font Settings' },
  { id: 'apps', label: 'Displayed Applications' },
];

/**
 * reAFresh · Profile — reached from the settings icon in the nav bar rather
 * than a routed program (see `Shell.tsx`); this is account preferences, not
 * a place to work, so it never earned a slot in `app/programs.ts`'s list.
 */
export function ProfileScreen({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings } = useSession();
  const [tab, setTab] = useState<Tab>('credentials');

  return (
    <div className="cal__overlay" role="dialog" aria-label="Profile">
      <AFPanel label="Profile" className="prf__editor">
        <div className="prf__tabs">
          {tabs.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`cal__view${tab === option.id ? ' is-active' : ''}`}
              onClick={() => setTab(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {tab === 'credentials' && <CredentialsPanel />}
        {tab === 'font' && <FontSettingsPanel settings={settings} onChange={updateSettings} />}
        {tab === 'apps' && <DisplayedAppsPanel settings={settings} onChange={updateSettings} />}

        <div className="cal__editor-actions">
          <AFButton label="Close" variant="quiet" onClick={onClose} />
        </div>
      </AFPanel>
    </div>
  );
}

function CredentialsPanel() {
  const current: User | null = auth().currentUser;
  const canChangeCredentials = hasPasswordProvider(current);

  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [nextEmail, setNextEmail] = useState('');
  const [busy, setBusy] = useState<'password' | 'email' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPasswordChange = async () => {
    setBusy('password');
    setError(null);
    setMessage(null);
    try {
      await changePassword(currentPassword, nextPassword);
      setCurrentPassword('');
      setNextPassword('');
      setMessage('Password changed.');
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const runEmailChange = async () => {
    setBusy('email');
    setError(null);
    setMessage(null);
    try {
      const target = nextEmail.trim();
      await changeEmail(currentPassword, target);
      setNextEmail('');
      setMessage(`Check ${target} to confirm the change.`);
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="prf__section">
      <div className="prf__field">
        <span className="af-panel-label">Email</span>
        <span className="af-body">{current?.email ?? '—'}</span>
      </div>
      <div className="prf__field">
        <span className="af-panel-label">Signed in with</span>
        <span className="af-body">{providerLabel(current)}</span>
      </div>

      {canChangeCredentials ? (
        <>
          <label className="af-panel-label" htmlFor="prf-current-password">
            Current password
          </label>
          <input
            id="prf-current-password"
            type="password"
            className="af-input"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />

          <label className="af-panel-label" htmlFor="prf-next-password">
            New password
          </label>
          <div className="prf__inline">
            <input
              id="prf-next-password"
              type="password"
              className="af-input"
              autoComplete="new-password"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
            />
            <AFButton
              label="Change password"
              disabled={!currentPassword || nextPassword.length < 6 || busy !== null}
              onClick={() => void runPasswordChange()}
            />
          </div>

          <label className="af-panel-label" htmlFor="prf-next-email">
            New email
          </label>
          <div className="prf__inline">
            <input
              id="prf-next-email"
              type="email"
              className="af-input"
              value={nextEmail}
              onChange={(event) => setNextEmail(event.target.value)}
            />
            <AFButton
              label="Change email"
              variant="quiet"
              disabled={!currentPassword || !nextEmail.trim() || busy !== null}
              onClick={() => void runEmailChange()}
            />
          </div>
        </>
      ) : (
        <AFHint>Signed in with Google — no password to manage here.</AFHint>
      )}

      {message && <AFHint tip>{message}</AFHint>}
      {error && <AFHint>{error}</AFHint>}
    </div>
  );
}

const fontOptions: { value: SettingsRow['font']; label: string; family: string }[] = [
  { value: 'default', label: 'Our current', family: 'var(--af-sans)' },
  { value: 'times', label: 'Times New Roman', family: "'Times New Roman', Times, Georgia, serif" },
  { value: 'consolas', label: 'Consolas', family: "Consolas, 'Cascadia Mono', Menlo, monospace" },
];

const themeOptions: { value: SettingsRow['theme']; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const widthOptions: { value: boolean; label: string }[] = [
  { value: false, label: 'Reading' },
  { value: true, label: 'Full page' },
];

function FontSettingsPanel({
  settings,
  onChange,
}: {
  settings: SettingsRow;
  onChange: (patch: Partial<Omit<SettingsRow, 'id'>>) => Promise<void>;
}) {
  return (
    <div className="prf__section">
      <span className="af-panel-label">Font</span>
      <div className="prf__fonts">
        {fontOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`prf__font${settings.font === option.value ? ' is-active' : ''}`}
            onClick={() => void onChange({ font: option.value })}
          >
            <span className="prf__font-sample" style={{ fontFamily: option.family }}>
              Aa
            </span>
            <span className="af-meta">{option.label}</span>
          </button>
        ))}
      </div>

      <span className="af-panel-label">Theme</span>
      <div className="prf__themes">
        {themeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`prf__theme${settings.theme === option.value ? ' is-active' : ''}`}
            onClick={() => void onChange({ theme: option.value })}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Applies to every program at once, deliberately — one page width is
          the rule `.page` exists to keep, and a per-screen override would be
          the drift it was introduced to stop. */}
      <span className="af-panel-label">Page width</span>
      <div className="prf__themes">
        {widthOptions.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            className={`prf__theme${settings.fullWidth === option.value ? ' is-active' : ''}`}
            onClick={() => void onChange({ fullWidth: option.value })}
          >
            {option.label}
          </button>
        ))}
      </div>
      <AFHint>
        {settings.fullWidth
          ? 'Every program fills the window.'
          : 'Every program sits in a reading column.'}
      </AFHint>
    </div>
  );
}

function DisplayedAppsPanel({
  settings,
  onChange,
}: {
  settings: SettingsRow;
  onChange: (patch: Partial<Omit<SettingsRow, 'id'>>) => Promise<void>;
}) {
  const hidden = new Set(settings.hiddenPrograms);

  const toggle = (slug: string) => {
    const next = new Set(hidden);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    void onChange({ hiddenPrograms: [...next] });
  };

  return (
    <div className="prf__section">
      <AFHint>Choose which applications show in the nav bar, the dashboard, and the split picker.</AFHint>
      <ul className="prf__apps">
        {programs.map((program) => (
          <li key={program.slug} className="prf__app-row">
            <span className="af-mono">{program.mark}</span>
            <span className="af-body">{program.name}</span>
            <label className="prf__app-toggle">
              <input type="checkbox" checked={!hidden.has(program.slug)} onChange={() => toggle(program.slug)} />
              <span className="af-meta">{hidden.has(program.slug) ? 'Hidden' : 'Shown'}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
