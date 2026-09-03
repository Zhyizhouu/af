import { useState } from 'react';
import { AFButton, AFHint, AFPanel } from '../../components/AF';
import { useSession } from '../../app/session';
import { auth, authErrorMessage, type User } from '../../data/firebase';
import type { SettingsRow } from '../../data/db';
import { changeEmail, changePassword, hasPasswordProvider, providerLabel } from './store';
import './profile.css';

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

/** reAFresh · Profile — credentials and this account's settings. */
export function ProfileScreen() {
  const { settings, updateSettings } = useSession();

  return (
    <div className="page prf">
      <div className="prf__row">
        <CredentialsPanel />
        <SettingsPanel settings={settings} onChange={updateSettings} />
      </div>
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
    <AFPanel label="Credentials" className="prf__panel">
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
    </AFPanel>
  );
}

function SettingsPanel({
  settings,
  onChange,
}: {
  settings: SettingsRow;
  onChange: (patch: Partial<Omit<SettingsRow, 'id'>>) => Promise<void>;
}) {
  return (
    <AFPanel label="Settings" className="prf__panel">
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
    </AFPanel>
  );
}
