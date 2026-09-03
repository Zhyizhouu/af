import { useState } from 'react';
import { AFButton, AFHint, AFPanel } from '../../components/AF';
import type { AgendaEntry } from '../../data/agenda';
import { notificationPermission, requestNotificationPermission } from '../../data/notifications';
import { reminderOptions } from '../../data/reminders';
import { toneColor, type EventCategory } from './categories';

const localInput = (value: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` +
    `T${pad(value.getHours())}:${pad(value.getMinutes())}`
  );
};

/**
 * Create or edit one event.
 *
 * Deleting asks first. That is inconsistent with the calendar's own delete
 * elsewhere in AF and consistent with the session one — the two patterns are a
 * known wrinkle, and the safer of them is the one to copy.
 */
export function EventEditor({
  initial,
  start,
  categories,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: AgendaEntry | null;
  start: Date;
  categories: EventCategory[];
  onSave: (input: {
    title: string;
    start: Date;
    end: Date;
    notes: string;
    allDay: boolean;
    category: string;
    reminderMinutes: number;
  }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [notes, setNotes] = useState(initial?.subtitle ?? '');
  const [allDay, setAllDay] = useState(initial?.allDay ?? false);
  const [category, setCategory] = useState(initial?.category || 'other');
  const [from, setFrom] = useState(localInput(initial?.start ?? start));
  const [to, setTo] = useState(
    localInput(initial?.end ?? new Date(start.getTime() + 3600_000)),
  );
  const [reminderMinutes, setReminderMinutes] = useState(initial?.reminderMinutes ?? 0);
  const [reminderBlocked, setReminderBlocked] = useState(
    (initial?.reminderMinutes ?? 0) > 0 && notificationPermission() === 'denied',
  );
  const [confirming, setConfirming] = useState(false);

  const readOnly = initial?.kind === 'session';

  return (
    <div className="cal__overlay" role="dialog" aria-label="Event">
      <AFPanel label={readOnly ? 'Session' : initial ? 'Edit event' : 'New event'} className="cal__editor">
        {readOnly ? (
          <AFHint>
            This is a proctor session. Edit it in Checklists — the calendar shows it but
            does not own it.
          </AFHint>
        ) : (
          <>
            <label className="af-panel-label" htmlFor="event-title">Title</label>
            <input
              id="event-title"
              className="af-input af-input--prose"
              value={title}
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
            />

            <label className="af-panel-label" htmlFor="event-start">Start</label>
            <input
              id="event-start"
              className="af-input"
              type="datetime-local"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />

            <label className="af-panel-label" htmlFor="event-end">End</label>
            <input
              id="event-end"
              className="af-input"
              type="datetime-local"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />

            <label className="cal__check">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(event) => setAllDay(event.target.checked)}
              />
              <span className="af-panel-label">All day</span>
            </label>

            <span className="af-panel-label">Category</span>
            <div className="cal__categories">
              {categories.map((option) => (
                <button
                  key={option.slug}
                  type="button"
                  className={`cal__category${category === option.slug ? ' is-active' : ''}`}
                  onClick={() => setCategory(option.slug)}
                >
                  <span className="cal__dot" style={{ background: toneColor(option.toneIndex) }} />
                  {option.label}
                </button>
              ))}
            </div>

            <label className="af-panel-label" htmlFor="event-notes">Notes</label>
            <textarea
              id="event-notes"
              className="af-input af-input--prose"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />

            <label className="af-panel-label" htmlFor="event-reminder">Remind me</label>
            <select
              id="event-reminder"
              className="af-nav__select"
              value={reminderMinutes}
              onChange={async (event) => {
                const minutes = Number(event.target.value);
                setReminderMinutes(minutes);
                if (minutes > 0) {
                  const permission = await requestNotificationPermission();
                  setReminderBlocked(permission === 'denied' || permission === 'unsupported');
                } else {
                  setReminderBlocked(false);
                }
              }}
            >
              {reminderOptions.map((option) => (
                <option key={option.minutes} value={option.minutes}>
                  {option.label}
                </option>
              ))}
            </select>
            {reminderBlocked && (
              <AFHint>
                Notifications are blocked for this site, so this reminder will not show. Allow
                them in your browser's site settings to fix that.
              </AFHint>
            )}
          </>
        )}

        <div className="cal__editor-actions">
          <AFButton label="Cancel" variant="quiet" onClick={onCancel} />
          {onDelete && !readOnly && (
            confirming ? (
              <AFButton label="Really delete" variant="danger" onClick={onDelete} />
            ) : (
              <AFButton label="Delete" variant="ghost" onClick={() => setConfirming(true)} />
            )
          )}
          {!readOnly && (
            <AFButton
              label="Save"
              disabled={!title.trim()}
              onClick={() => {
                const startAt = new Date(from);
                const endAt = new Date(to);
                onSave({
                  title: title.trim(),
                  start: startAt,
                  // An end at or before its start is repaired to an hour rather
                  // than refused: the time is a guess either way, the event is not.
                  end: endAt > startAt ? endAt : new Date(startAt.getTime() + 3600_000),
                  notes,
                  allDay,
                  category,
                  reminderMinutes,
                });
              }}
            />
          )}
        </div>
      </AFPanel>
    </div>
  );
}
