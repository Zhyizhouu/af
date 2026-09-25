import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, Plus } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { useSession } from '../../app/session';
import type { ChecklistItemRow, ProctorSessionRow } from '../../data/db';
import { requestNotificationPermission } from '../../data/notifications';
import { reminderOptions } from '../../data/reminders';
import {
  bySection,
  createSession,
  deleteSession,
  listItems,
  listSessions,
  sessionLabel,
  setSessionStatus,
  toggleItem,
} from './store';

const stamp = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * reAFresh · Checklists — UAP/UAS proctor sessions against a template.
 *
 * A session is created with its checklist already seeded, so there is never a
 * session sitting there with nothing to tick.
 */
export function ChecklistsScreen() {
  const { revision, requestSync } = useSession();

  const [status, setStatus] = useState<'active' | 'archived'>('active');
  const [sessions, setSessions] = useState<ProctorSessionRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    setSessions(await listSessions(status));
  }, [status]);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const after = useCallback(
    async (action: () => Promise<unknown>) => {
      await action();
      await reload();
      requestSync();
    },
    [reload, requestSync],
  );

  const open = sessions.find((session) => session.id === openId);

  if (open) {
    return (
      <SessionDetail
        session={open}
        onBack={() => setOpenId(null)}
        onChanged={() => void after(async () => {})}
      />
    );
  }

  return (
    <div className="page font-sans text-foreground px-4! py-4! md:px-8! md:py-6!">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="inline-flex gap-0.5 rounded-[10px] border border-white/[0.07] bg-[#050506] p-[3px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]">
          {(['active', 'archived'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={status === option}
              className={cn(
                'h-8 min-h-[36px] rounded-[7px] px-3 text-sm font-medium capitalize transition-colors md:min-h-0',
                status === option
                  ? 'glow-active text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setStatus(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <span className="page__spacer" />
        <Button variant="gradient" className="h-9 md:h-9 max-md:h-11" onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden />
          New session
        </Button>
      </div>

      {sessions.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          {status === 'active' ? (
            <>
              No sessions yet.
              <br />
              Add one, or ask the assistant.
            </>
          ) : (
            'Nothing archived yet.'
          )}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {sessions.map((session) => (
            <li key={session.id}>
              <div className="surface-3d rounded-2xl p-5">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="text-[15px] font-semibold">{session.type}</span>
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-xs text-muted-foreground">
                    Room {session.room || '—'}
                  </span>
                </div>
                <button
                  type="button"
                  className="flex w-full flex-col items-start gap-1 border-0 bg-transparent p-0 text-left text-inherit"
                  onClick={() => setOpenId(session.id)}
                >
                  <span className="text-sm">{sessionLabel(session) || 'Untitled course'}</span>
                  <span className="text-xs text-muted-foreground">
                    {stamp.format(new Date(session.dateTime))}
                  </span>
                </button>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void after(() =>
                        setSessionStatus(session.id, status === 'active' ? 'archived' : 'active'),
                      )
                    }
                  >
                    {status === 'active' ? 'Archive' : 'Reopen'}
                  </Button>
                  <DeleteSession onDelete={() => void after(() => deleteSession(session.id))} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <NewSession
        open={adding}
        onOpenChange={setAdding}
        onCreate={(input) =>
          void after(async () => {
            await createSession(input);
            setAdding(false);
          })
        }
      />
    </div>
  );
}

/** Deleting a session asks first — it takes its whole checklist with it. */
function DeleteSession({ onDelete }: { onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return confirming ? (
    <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={onDelete}>
      Really delete
    </Button>
  ) : (
    <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
      Delete
    </Button>
  );
}

function SessionDetail({
  session,
  onBack,
  onChanged,
}: {
  session: ProctorSessionRow;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { requestSync } = useSession();
  const [items, setItems] = useState<ChecklistItemRow[]>([]);

  const reload = useCallback(async () => {
    setItems(await listItems(session.id));
  }, [session.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const done = items.filter((item) => item.isChecked).length;

  return (
    <div className="page font-sans text-foreground px-4! py-4! md:px-8! md:py-6!">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.08] pb-3.5">
        <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack}>
          <ChevronLeft size={18} aria-hidden />
        </Button>
        <span className="text-sm font-medium">
          {session.type} · Room {session.room || '—'}
        </span>
        <span className="page__spacer" />
        <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-xs text-muted-foreground">
          {done}/{items.length}
        </span>
      </header>

      <div className="surface-3d rounded-2xl p-5">
        <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-subtle-foreground">
          Course
        </span>
        <span className="text-sm">{sessionLabel(session) || 'Untitled course'}</span>
        <div className="mt-1 text-xs text-muted-foreground">
          {stamp.format(new Date(session.dateTime))}
        </div>
      </div>

      <div
        className="h-[6px] overflow-hidden rounded-full bg-white/[0.06]"
        aria-hidden
      >
        <span
          className="block h-full rounded-full bg-gradient-to-r from-[#34d399] to-[#6ee7b7] shadow-[0_0_12px_rgba(52,211,153,0.45)] transition-[width] duration-200 ease-out"
          style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }}
        />
      </div>

      {bySection(items).map(([section, group]) => (
        <div key={section} className="surface-3d rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle-foreground">
              {section}
            </span>
            <span className="text-xs text-muted-foreground">
              {group.filter((item) => item.isChecked).length}/{group.length}
            </span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {group.map((item) => (
              <li key={item.id}>
                <label className="flex cursor-pointer items-start gap-2.5">
                  <Checkbox
                    checked={item.isChecked}
                    onCheckedChange={() =>
                      void (async () => {
                        await toggleItem(item.id);
                        await reload();
                        requestSync();
                        onChanged();
                      })()
                    }
                    className="mt-0.5 inset-field size-[18px] rounded-[5px] border-white/10 text-white data-[state=checked]:border-white/20 data-[state=checked]:bg-white/10"
                  />
                  <span
                    className={cn(
                      'text-sm',
                      item.isChecked && 'text-subtle-foreground line-through',
                    )}
                  >
                    {item.label}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function NewSession({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: {
    type: string;
    dateTime: Date;
    room: string;
    courseCode: string;
    courseName: string;
    courseClass: string;
    reminderMinutes: number;
  }) => void;
}) {
  const [type, setType] = useState('UAP');
  const [when, setWhen] = useState(() => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`;
  });
  const [room, setRoom] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [klass, setKlass] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState(0);
  const [reminderBlocked, setReminderBlocked] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="surface-3d rounded-2xl border-white/[0.07]">
        <DialogTitle className="text-[15px] font-semibold">New session</DialogTitle>

        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-[0.08em] text-subtle-foreground">Type</span>
            <div className="flex gap-1.5">
              {['UAP', 'UAS'].map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={type === option}
                  className={cn(
                    'h-8 rounded-[7px] px-3 text-sm font-medium transition-colors',
                    type === option
                      ? 'glow-active text-foreground'
                      : 'inset-field text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setType(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-[0.08em] text-subtle-foreground" htmlFor="s-when">
              When
            </label>
            <Input
              id="s-when"
              className="inset-field rounded-[10px]"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-[0.08em] text-subtle-foreground" htmlFor="s-room">
              Room
            </label>
            <Input
              id="s-room"
              className="inset-field rounded-[10px]"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-[0.08em] text-subtle-foreground" htmlFor="s-code">
              Course code
            </label>
            <Input
              id="s-code"
              className="inset-field rounded-[10px]"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-[0.08em] text-subtle-foreground" htmlFor="s-name">
              Course name
            </label>
            <Input
              id="s-name"
              className="inset-field rounded-[10px]"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-[0.08em] text-subtle-foreground" htmlFor="s-class">
              Class
            </label>
            <Input
              id="s-class"
              className="inset-field rounded-[10px]"
              value={klass}
              onChange={(e) => setKlass(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-[0.08em] text-subtle-foreground" htmlFor="s-reminder">
              Remind me
            </label>
            <Select
              value={String(reminderMinutes)}
              onValueChange={async (value) => {
                const minutes = Number(value);
                setReminderMinutes(minutes);
                if (minutes > 0) {
                  const permission = await requestNotificationPermission();
                  setReminderBlocked(permission === 'denied' || permission === 'unsupported');
                } else {
                  setReminderBlocked(false);
                }
              }}
            >
              <SelectTrigger id="s-reminder" className="inset-field w-full rounded-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reminderOptions.map((option) => (
                  <SelectItem key={option.minutes} value={String(option.minutes)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {reminderBlocked && (
              <p className="text-xs text-muted-foreground">
                Notifications are blocked for this site, so this reminder will not show. Allow them
                in your browser's site settings to fix that.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="gradient"
            disabled={!code.trim() && !name.trim()}
            onClick={() =>
              onCreate({
                type,
                dateTime: new Date(when),
                room: room.trim(),
                courseCode: code.trim().toUpperCase(),
                courseName: name.trim(),
                courseClass: klass.trim().toUpperCase(),
                reminderMinutes,
              })
            }
          >
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
