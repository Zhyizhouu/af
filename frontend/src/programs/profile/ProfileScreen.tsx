import { useState } from 'react';
import { KeyRound, Mail } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Checkbox } from '../../components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { useSession } from '../../app/session';
import { programs } from '../../app/programs';
import { auth, authErrorMessage, type User } from '../../data/firebase';
import type { SettingsRow } from '../../data/db';
import { changeEmail, changePassword, hasPasswordProvider, providerLabel } from './store';

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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="surface-3d rounded-2xl border-0 bg-transparent sm:max-w-[640px]" aria-label="Settings">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList className="h-auto w-full justify-start gap-0.5 rounded-[10px] border border-white/[0.07] bg-[#050506] p-[3px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]">
            {tabs.map((option) => (
              <TabsTrigger
                key={option.id}
                value={option.id}
                className="h-auto min-h-8 flex-1 whitespace-normal rounded-[7px] border-0 bg-transparent px-1.5 py-1.5 text-center text-[11px] font-medium leading-tight text-muted-foreground shadow-none after:hidden data-[state=active]:glow-active data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent sm:px-3 sm:text-sm"
              >
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="credentials" className="mt-4">
            <CredentialsPanel />
          </TabsContent>
          <TabsContent value="font" className="mt-4">
            <FontSettingsPanel settings={settings} onChange={updateSettings} />
          </TabsContent>
          <TabsContent value="apps" className="mt-4">
            <DisplayedAppsPanel settings={settings} onChange={updateSettings} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
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
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[12px] uppercase tracking-[0.08em] text-subtle-foreground">Email</span>
          <span className="text-[14px] text-foreground">{current?.email ?? '—'}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[12px] uppercase tracking-[0.08em] text-subtle-foreground">Signed in with</span>
          <span className="text-[14px] text-foreground">{providerLabel(current)}</span>
        </div>
      </div>

      {canChangeCredentials ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prf-current-password">Current password</Label>
            <Input
              id="prf-current-password"
              type="password"
              className="inset-field rounded-[10px]"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="prf-next-password">New password</Label>
              <Input
                id="prf-next-password"
                type="password"
                className="inset-field rounded-[10px]"
                autoComplete="new-password"
                value={nextPassword}
                onChange={(event) => setNextPassword(event.target.value)}
              />
            </div>
            <Button
              variant="gradient"
              disabled={!currentPassword || nextPassword.length < 6 || busy !== null}
              onClick={() => void runPasswordChange()}
            >
              <KeyRound />
              Change password
            </Button>
          </div>

          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="prf-next-email">New email</Label>
              <Input
                id="prf-next-email"
                type="email"
                className="inset-field rounded-[10px]"
                value={nextEmail}
                onChange={(event) => setNextEmail(event.target.value)}
              />
            </div>
            <Button
              variant="ghost"
              disabled={!currentPassword || !nextEmail.trim() || busy !== null}
              onClick={() => void runEmailChange()}
            >
              <Mail />
              Change email
            </Button>
          </div>
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Signed in with Google — no password to manage here.
        </p>
      )}

      {message && (
        <div
          role="status"
          className="rounded-[10px] border px-3 py-2 text-[13px]"
          style={{ color: '#86efac', background: 'rgba(52,211,153,0.08)', borderColor: 'rgba(52,211,153,0.35)' }}
        >
          {message}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-[10px] border px-3 py-2 text-[13px]"
          style={{ color: '#fda4af', background: 'rgba(251,113,133,0.08)', borderColor: 'rgba(251,113,133,0.35)' }}
        >
          {error}
        </div>
      )}
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
    <div className="flex flex-col gap-5">
      <div>
        <span className="mb-2 block text-[12px] uppercase tracking-[0.08em] text-subtle-foreground">Font</span>
        <div role="radiogroup" aria-label="Font" className="grid grid-cols-3 gap-2">
          {fontOptions.map((option) => {
            const active = settings.font === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                className={cn(
                  'raised flex flex-col items-center gap-2 rounded-2xl px-3 py-4 text-foreground transition-colors',
                  active && 'glow-active',
                )}
                onClick={() => void onChange({ font: option.value })}
              >
                <span className="text-2xl" style={{ fontFamily: option.family }}>
                  Aa
                </span>
                <span className="text-[12px] text-muted-foreground">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className="mb-2 block text-[12px] uppercase tracking-[0.08em] text-subtle-foreground">Theme</span>
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
          {themeOptions.map((option) => {
            const active = settings.theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                className={cn(
                  'raised rounded-2xl px-3 py-2.5 text-[13px] font-medium text-foreground transition-colors',
                  active && 'glow-active',
                )}
                onClick={() => void onChange({ theme: option.value })}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className="mb-2 block text-[12px] uppercase tracking-[0.08em] text-subtle-foreground">Page width</span>
        <div role="radiogroup" aria-label="Page width" className="grid grid-cols-2 gap-2">
          {widthOptions.map((option) => {
            const active = settings.fullWidth === option.value;
            return (
              <button
                key={String(option.value)}
                type="button"
                role="radio"
                aria-checked={active}
                className={cn(
                  'raised rounded-2xl px-3 py-2.5 text-[13px] font-medium text-foreground transition-colors',
                  active && 'glow-active',
                )}
                onClick={() => void onChange({ fullWidth: option.value })}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {settings.fullWidth
            ? 'Every program fills the window.'
            : 'Every program sits in a reading column.'}
        </p>
      </div>
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
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted-foreground">
        Choose which applications show in the nav bar, the dashboard, and the split picker.
      </p>
      <ul className="flex flex-col gap-1">
        {programs.map((program) => {
          const checked = !hidden.has(program.slug);
          const id = `prf-app-${program.slug}`;
          return (
            <li
              key={program.slug}
              className="flex items-center gap-3 border-b border-white/[0.06] px-2 py-2 last:border-b-0"
            >
              <span className="shrink-0 font-mono text-[14px] text-muted-foreground">{program.mark}</span>
              <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">{program.name}</span>
              <Label htmlFor={id} className="shrink-0 gap-2 text-[12px] text-muted-foreground">
                {checked ? 'Shown' : 'Hidden'}
                <Checkbox id={id} checked={checked} onCheckedChange={() => toggle(program.slug)} />
              </Label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
