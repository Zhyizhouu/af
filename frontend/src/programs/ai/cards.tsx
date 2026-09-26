import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from 'cn';
import { Calendar, CheckCircle2, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import type { AgendaEntry } from '../../data/agenda';
import { QrCode } from '../qr/QrCode';
import { isEcc, type Ecc } from '../qr/qr';
import { sessionLabel, type EventProposal, type QrArtifact, type SessionProposal } from './api';
import type { HabitTickProposal } from './message';

/**
 * The proposal cards.
 *
 * Every field the model filled in is shown, including the empty ones. A blank
 * room is exactly the kind of thing worth noticing before confirming, and a
 * card that quietly omitted it would hide the one mistake worth catching.
 */

const day = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const clock = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

type Tone = 'sky' | 'emerald' | 'amber' | 'rose';

const tileTone: Record<Tone, string> = {
  sky: 'bg-sky-400/12 border-sky-400/25 text-sky-400',
  emerald: 'bg-emerald-400/12 border-emerald-400/25 text-emerald-400',
  amber: 'bg-amber-400/12 border-amber-400/25 text-amber-400',
  rose: 'bg-rose-400/12 border-rose-400/25 text-rose-400',
};

const chipTone: Record<Tone, string> = {
  sky: 'border-sky-400/25 text-sky-400',
  emerald: 'border-emerald-400/25 text-emerald-400',
  amber: 'border-amber-400/25 text-amber-400',
  rose: 'border-rose-400/25 text-rose-400',
};

function Chip({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        chipTone[tone],
      )}
    >
      {label}
    </span>
  );
}

function Row({ label, value, missing = false }: { label: string; value: string; missing?: boolean }) {
  return (
    <div className="mt-1.5 flex items-start gap-2 text-[12px] leading-snug">
      <span className="w-14 shrink-0 text-subtle-foreground">{label}</span>
      {/* A dash in the warn colour rather than an empty gap, so a field the
          model could not fill is visible instead of merely absent. */}
      <span className={missing ? 'text-rose-400' : 'text-muted-foreground'}>
        {missing ? '— not given' : value}
      </span>
    </div>
  );
}

function ProposalCard({
  tone,
  icon,
  kicker,
  chip,
  title,
  danger = false,
  children,
  footer,
}: {
  tone: Tone;
  icon: ReactNode;
  kicker: string;
  chip?: ReactNode;
  title: string;
  danger?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className={cn('surface-3d mb-3 rounded-2xl p-5', danger && 'border-rose-400/30')}>
      <div className="flex items-start gap-3.5">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border', tileTone[tone])}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">{kicker}</span>
            {chip}
          </div>
          <div className={cn('mt-0.5 text-[14px] font-medium text-foreground', danger && 'text-rose-400')}>
            {title}
          </div>
          {children}
        </div>
      </div>
      {footer}
    </div>
  );
}

export function SessionCard({
  proposal,
  onRemove,
}: {
  proposal: SessionProposal;
  onRemove?: () => void;
}) {
  const label = sessionLabel(proposal);
  return (
    <ProposalCard
      tone="sky"
      icon={<Calendar size={16} aria-hidden />}
      kicker="Session"
      chip={<Chip label={proposal.type} tone="sky" />}
      title={label || 'Untitled course'}
      footer={
        onRemove && (
          <Button variant="ghost" size="sm" className="mt-3.5 w-full" onClick={onRemove}>
            Remove
          </Button>
        )
      }
    >
      <Row label="When" value={`${day.format(proposal.start)} · ${clock.format(proposal.start)}`} />
      <Row label="Room" value={proposal.room} missing={!proposal.room} />
      <Row label="Class" value={proposal.courseClass} missing={!proposal.courseClass} />
    </ProposalCard>
  );
}

export function EventCard({
  proposal,
  onRemove,
}: {
  proposal: EventProposal;
  onRemove?: () => void;
}) {
  const when = proposal.allDay
    ? `${day.format(proposal.start)} · all day`
    : `${day.format(proposal.start)} · ${clock.format(proposal.start)}–${clock.format(proposal.end)}`;

  return (
    <ProposalCard
      tone="sky"
      icon={<Calendar size={16} aria-hidden />}
      kicker="Event"
      chip={<span className="text-[11px] text-muted-foreground">{proposal.category}</span>}
      title={proposal.title}
      footer={
        onRemove && (
          <Button variant="ghost" size="sm" className="mt-3.5 w-full" onClick={onRemove}>
            Remove
          </Button>
        )
      }
    >
      <Row label="When" value={when} />
      {proposal.notes && <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{proposal.notes}</p>}
    </ProposalCard>
  );
}

/**
 * A QR code the assistant produced, rendered where it was asked for.
 *
 * No confirm button, deliberately. It changes nothing — nothing is written,
 * nothing deleted, and closing the tab disposes of it — so putting it behind
 * the gate would be asking somebody to approve a picture. The gate is for
 * things that touch stored data, and dulling it with harmless approvals is how
 * it stops being read.
 *
 * The handoff to the QR Generator carries the text and correction level in the
 * URL. It cannot carry the logo — that is a file, not a query parameter — so a
 * code that used one says as much rather than opening silently without it.
 */
export function QrArtifactCard({
  code,
  logo,
}: {
  code: QrArtifact;
  logo: string | null;
}) {
  const ecc: Ecc = isEcc(code.ecc) ? code.ecc : 'M';
  const applied = code.useLogo ? logo : null;

  const handoff = `/qr?text=${encodeURIComponent(code.text)}&ecc=${applied ? 'H' : ecc}`;

  return (
    <div className="surface-3d mb-3 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">QR code</span>
        <Chip label={applied ? `${ecc} · LOGO` : ecc} tone="sky" />
      </div>
      <div className="mt-0.5 text-[14px] font-medium text-foreground">{code.label}</div>

      <div className="mt-3.5 inline-block rounded-xl bg-white p-4">
        <QrCode label={code.label} options={{ text: code.text, ecc, logo: applied }} />
      </div>

      <p className="mt-3 break-all text-[11px] leading-relaxed text-muted-foreground">{code.text}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to={handoff}>Open in QR Generator</Link>
        </Button>
      </div>

      {code.useLogo && !logo && (
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          No image is attached, so this was made without a logo.
        </p>
      )}
      {applied && (
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          The logo does not travel to the QR Generator — attach it there.
        </p>
      )}
    </div>
  );
}

export function ProposalsSummary({
  count,
  confirmLabel,
  danger = false,
  disabled = false,
  onConfirm,
  onDismiss,
}: {
  count: number;
  confirmLabel: string;
  danger?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <div>
      <div className="mb-2 text-[12px] text-muted-foreground">
        {count} {count === 1 ? 'change' : 'changes'} to confirm
      </div>
      <div className="flex gap-2">
        <Button
          variant={danger ? 'destructive' : 'gradient'}
          className="flex-1"
          disabled={disabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
        <Button variant="ghost" disabled={disabled} onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

/**
 * One mark the assistant is offering to make against a habit.
 *
 * Not drawn as a deletion even when it undoes a tick: unticking loses one day's
 * mark, which is a world away from deleting a session and its checklist. It
 * still waits behind the confirm button, because it writes to stored data.
 */
export function HabitTickCard({
  tick,
  onRemove,
}: {
  tick: HabitTickProposal;
  onRemove?: () => void;
}) {
  return (
    <ProposalCard
      tone={tick.done ? 'emerald' : 'amber'}
      icon={tick.done ? <CheckCircle2 size={16} aria-hidden /> : <RotateCcw size={16} aria-hidden />}
      kicker={tick.done ? 'Tick habit' : 'Untick habit'}
      chip={<Chip label={tick.done ? 'DONE' : 'UNDO'} tone={tick.done ? 'emerald' : 'amber'} />}
      title={tick.name}
      footer={
        onRemove && (
          <Button variant="ghost" size="sm" className="mt-3.5 w-full" onClick={onRemove}>
            Remove
          </Button>
        )
      }
    >
      <Row label="Day" value={tick.day} />
    </ProposalCard>
  );
}

/**
 * One entry the assistant is offering to delete.
 *
 * Drawn from this app's own record rather than from anything the model said
 * about it: the answer carries an id and nothing else, so what is described
 * here is necessarily what will be deleted.
 *
 * The way out is labelled "Keep it" rather than "Remove" — on a deletion card
 * "remove" could sensibly mean either thing, and this is not a control worth
 * being clever about.
 */
export function RemovalCard({
  entry,
  onKeep,
}: {
  entry: AgendaEntry;
  onKeep?: () => void;
}) {
  const when = entry.allDay
    ? `${day.format(entry.start)} · all day`
    : entry.end > entry.start
      ? `${day.format(entry.start)} · ${clock.format(entry.start)}–${clock.format(entry.end)}`
      : `${day.format(entry.start)} · ${clock.format(entry.start)}`;

  return (
    <ProposalCard
      tone="rose"
      icon={<Trash2 size={16} aria-hidden />}
      kicker="Delete"
      chip={<Chip label={entry.kind === 'session' ? 'SESSION' : 'EVENT'} tone="rose" />}
      title={entry.title}
      danger
      footer={
        onKeep && (
          <Button variant="ghost" size="sm" className="mt-3.5 w-full" onClick={onKeep}>
            Keep it
          </Button>
        )
      }
    >
      <Row label="When" value={when} />
      {entry.subtitle && <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{entry.subtitle}</p>}
      <p className="mt-3 text-[11.5px] leading-relaxed text-rose-400">
        This is already in your calendar. Confirming deletes it.
      </p>
    </ProposalCard>
  );
}
