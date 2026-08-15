import { useState } from 'react';
import { AFButton, AFHint, AFMasthead, AFPanel } from '../components/AF';
import {
  authErrorMessage,
  registerWithPassword,
  resetPassword,
  signInWithGoogle,
  signInWithPassword,
} from '../data/firebase';
import './signin.css';

type Mode = 'signIn' | 'register';

/**
 * Sign-in, outside the shell.
 *
 * Credential failures are blurred into one message by `authErrorMessage` — a
 * form that distinguishes "no such account" from "wrong password" is a form
 * that will tell a stranger which addresses have accounts here.
 */
export function SignIn() {
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    run(() =>
      mode === 'signIn'
        ? signInWithPassword(email, password)
        : registerWithPassword(email, password),
    );

  return (
    <div className="signin">
      <div className="signin__column">
        <AFMasthead title="reAFresh" tagline="sign in to continue" />

        <AFPanel label={mode === 'signIn' ? 'Sign in' : 'Create an account'}>
          <AFButton
            label="Continue with Google"
            variant="ghost"
            expand
            disabled={busy}
            onClick={() => void run(signInWithGoogle)}
          />

          <div className="signin__rule">
            <span className="af-panel-label">or</span>
          </div>

          <form
            className="signin__form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="af-panel-label" htmlFor="signin-email">
              Email
            </label>
            <input
              id="signin-email"
              className="af-input"
              type="email"
              autoComplete="email"
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
            />

            <label className="af-panel-label" htmlFor="signin-password">
              Password
            </label>
            <input
              id="signin-password"
              className="af-input"
              type="password"
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              value={password}
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
            />

            <AFButton
              label={mode === 'signIn' ? 'Sign in' : 'Create account'}
              expand
              disabled={busy || !email || !password}
              onClick={() => void submit()}
            />
          </form>

          {error && <AFHint>{error}</AFHint>}
          {notice && <AFHint tip>{notice}</AFHint>}

          <div className="signin__switch">
            <AFButton
              label={mode === 'signIn' ? 'Create an account' : 'I already have one'}
              variant="quiet"
              disabled={busy}
              onClick={() => {
                setMode(mode === 'signIn' ? 'register' : 'signIn');
                setError(null);
                setNotice(null);
              }}
            />
            {mode === 'signIn' && (
              <AFButton
                label="Reset password"
                variant="quiet"
                disabled={busy || !email}
                onClick={() =>
                  void run(async () => {
                    await resetPassword(email);
                    // Worded so it says nothing about whether the address has
                    // an account — the same reason the errors are blurred.
                    setNotice('If that address has an account, a reset link is on its way.');
                  })
                }
              />
            )}
          </div>
        </AFPanel>

        <div className="af-footer">Your data stays on your device until you sign in.</div>
      </div>
    </div>
  );
}
