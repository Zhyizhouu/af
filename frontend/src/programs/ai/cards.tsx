import { Link } from 'react-router-dom';
import { AFButton, AFChip, AFHint, AFPanel } from '../../components/AF';
import type { AgendaEntry } from '../../data/agenda';
import { QrCode } from '../qr/QrCode';
import { isEcc, type Ecc } from '../qr/qr';
import { sessionLabel, type EventProposal, type QrArtifact, type SessionProposal } from './api';

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

function Row({ label, value, missing = false }: { label: string; value: string; missing?: boolean }) {
  return (
    <div className="card__row">
      <span className="card__label">{label}</span>
      {/* An em dash in the warn colour rather than an empty gap, so a field the
          model could not fill is visible instead of merely absent. */}
      <span className={`card__value${missing ? ' card__value--missing' : ''}`}>
        {missing ? '— not given' : value}
      </span>
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
    <AFPanel
      label="Session"
      countSlot={<AFChip label={proposal.type} />}
      className="card"
    >
      <div className="card__title">{label || 'Untitled course'}</div>
      <Row label="When" value={`${day.format(proposal.start)} · ${clock.format(proposal.start)}`} />
      <Row label="Room" value={proposal.room} missing={!proposal.room} />
      <Row label="Class" value={proposal.courseClass} missing={!proposal.courseClass} />
      {onRemove && <AFButton label="Remove" variant="quiet" expand onClick={onRemove} />}
    </AFPanel>
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
    <AFPanel
      label="Event"
      countSlot={<span className="af-panel-count">{proposal.category}</span>}
      className="card"
    >
      <div className="card__title">{proposal.title}</div>
      <Row label="When" value={when} />
      {proposal.notes && <p className="af-body card__notes">{proposal.notes}</p>}
      {onRemove && <AFButton label="Remove" variant="quiet" expand onClick={onRemove} />}
    </AFPanel>
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
    <AFPanel
      label="QR code"
      countSlot={<AFChip label={applied ? `${ecc} · LOGO` : ecc} />}
      className="card"
    >
      <div className="card__title">{code.label}</div>
      <QrCode label={code.label} options={{ text: code.text, ecc, logo: applied }} />

      <p className="card__encoded">{code.text}</p>

      <div className="card__links">
        <Link className="af-btn af-btn--quiet" to={handoff}>
          Open in QR Generator
        </Link>
      </div>

      {code.useLogo && !logo && (
        <AFHint>No image is attached, so this was made without a logo.</AFHint>
      )}
      {applied && (
        <AFHint>The logo does not travel to the QR Generator — attach it there.</AFHint>
      )}
    </AFPanel>
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
    <AFPanel
      label="Delete"
      countSlot={
        <AFChip
          label={entry.kind === 'session' ? 'SESSION' : 'EVENT'}
          color="var(--af-warn)"
        />
      }
      className="card card--danger"
    >
      <div className="card__title card__title--danger">{entry.title}</div>
      <Row label="When" value={when} />
      {entry.subtitle && <p className="af-body card__notes">{entry.subtitle}</p>}
      <p className="card__caution">This is already in your calendar. Confirming deletes it.</p>
      {onKeep && <AFButton label="Keep it" variant="quiet" expand onClick={onKeep} />}
    </AFPanel>
  );
}
