import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Monogram } from '../components/brand/Monogram';
import { CursorGlow } from '../components/effects/CursorGlow';
import {
  authErrorMessage,
  registerWithPassword,
  resetPassword,
  signInWithGoogle,
  signInWithPassword,
} from '../data/firebase';

type Mode = 'signIn' | 'register';

/**
 * Sign-in, outside the shell.
 *
 * Credential failures are blurred into one message by `authErrorMessage`: a
 * form that distinguishes "no such account" from "wrong password" is a form
 * that will tell a stranger which addresses have accounts here.
 */
export function SignIn() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'register' ? 'register' : 'signIn');
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
    <CursorGlow color="var(--glow)" className="min-h-dvh bg-black font-sans text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[720px] opacity-60"
        style={{ background: 'radial-gradient(closest-side, #fb923c, transparent)' }}
      />
      <header className="relative z-10 flex h-[72px] items-center justify-between border-b border-white/[0.08] px-6 sm:px-12">
        <Link to="/" className="flex items-center gap-2.5 text-foreground no-underline">
          <Monogram size={32} />
          <span className="text-lg font-semibold tracking-[-0.01em]">reAFresh</span>
        </Link>
        <Link to="/" className="text-sm text-muted-foreground no-underline hover:text-foreground">
          Back to home
        </Link>
      </header>

      <main className="relative z-10 flex justify-center px-4 pb-16 pt-16 sm:pt-[72px]">
        <form
          className="flex w-full max-w-[420px] flex-col gap-4 rounded-[20px] border border-white/[0.09] bg-gradient-to-b from-[rgba(22,22,25,0.9)] to-[rgba(8,8,10,0.9)] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_30px_80px_-20px_rgba(0,0,0,0.9),0_0_60px_-20px_rgba(251,146,60,0.35)] backdrop-blur-xl"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="mb-1 flex flex-col gap-2">
            <h1 className="text-gradient text-[30px] font-medium tracking-[-0.04em]">
              {mode === 'signIn' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="text-sm leading-[1.5] text-muted-foreground">
              {mode === 'signIn'
                ? 'Sign in to sync your checklists, calendar, habits and tasks.'
                : 'Create an account to sync your checklists, calendar, habits and tasks.'}
            </p>
          </div>

          <Button
            type="button"
            variant="raised"
            disabled={busy}
            onClick={() => void run(signInWithGoogle)}
            className="h-11"
          >
            Continue with Google
          </Button>

          <div className="flex items-center gap-3 text-xs text-subtle-foreground">
            <span className="h-px flex-grow bg-white/10" aria-hidden="true" />
            or
            <span className="h-px flex-grow bg-white/10" aria-hidden="true" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signin-email" className="text-[13px] font-normal text-zinc-300">
              Email
            </Label>
            <Input
              id="signin-email"
              className="inset-field h-11 text-foreground"
              type="email"
              autoComplete="email"
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signin-password" className="text-[13px] font-normal text-zinc-300">
              Password
            </Label>
            <Input
              id="signin-password"
              className="inset-field h-11 text-foreground"
              type="password"
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              value={password}
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <Button
            type="submit"
            variant="gradient"
            disabled={busy || !email || !password}
            className="mt-1 h-11 rounded-[10px]"
          >
            {mode === 'signIn' ? 'Sign in' : 'Create account'}
          </Button>

          {error && (
            <div
              role="alert"
              className="rounded-lg border px-3 py-2 text-sm"
              style={{
                color: '#fda4af',
                background: 'rgba(251,113,133,0.08)',
                borderColor: 'rgba(251,113,133,0.25)',
              }}
            >
              {error}
            </div>
          )}
          {notice && (
            <div
              role="status"
              className="rounded-lg border px-3 py-2 text-sm"
              style={{
                color: '#86efac',
                background: 'rgba(52,211,153,0.08)',
                borderColor: 'rgba(52,211,153,0.25)',
              }}
            >
              {notice}
            </div>
          )}

          <div className="flex items-center justify-between text-[13px]">
            <Button
              type="button"
              variant="link"
              disabled={busy}
              className="h-auto min-h-11 p-0 text-zinc-300"
              onClick={() => {
                setMode(mode === 'signIn' ? 'register' : 'signIn');
                setError(null);
                setNotice(null);
              }}
            >
              {mode === 'signIn' ? 'Create an account' : 'I already have one'}
            </Button>
            {mode === 'signIn' && (
              <Button
                type="button"
                variant="link"
                disabled={busy || !email}
                className="h-auto min-h-11 p-0 text-muted-foreground"
                onClick={() =>
                  void run(async () => {
                    await resetPassword(email);
                    // Worded so it says nothing about whether the address has
                    // an account, the same reason the errors are blurred.
                    setNotice('If that address has an account, a reset link is on its way.');
                  })
                }
              >
                Reset password
              </Button>
            )}
          </div>
        </form>
      </main>

      <p className="relative z-10 mx-auto max-w-[420px] px-4 pb-8 text-center text-xs text-subtle-foreground">
        Your data stays on your device until you sign in.
      </p>
    </CursorGlow>
  );
}
