import { useState } from 'react';
import { cn } from 'cn';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import type { AgendaEntry } from '../../data/agenda';
import { notificationPermission, requestNotificationPermission } from '../../data/notifications';
import { reminderOptions } from '../../data/reminders';
import { type EventCategory } from './categories';
import { toneColor } from '../../data/tones';

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
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        className="surface-3d rounded-2xl border-white/[0.07] font-sans text-foreground sm:max-w-[420px]"
        aria-label="Event"
      >
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">
            {readOnly ? 'Session' : initial ? 'Edit event' : 'New event'}
          </DialogTitle>
        </DialogHeader>

        {readOnly ? (
          <p className="text-[13px] text-muted-foreground">
            This is a proctor session. Edit it in Checklists — the calendar shows it but
            does not own it.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-title" className="text-[12px] text-muted-foreground">
                Title
              </Label>
              <Input
                id="event-title"
                className="inset-field rounded-[10px]"
                value={title}
                autoFocus
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-start" className="text-[12px] text-muted-foreground">
                Start
              </Label>
              <Input
                id="event-start"
                className="inset-field rounded-[10px]"
                type="datetime-local"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-end" className="text-[12px] text-muted-foreground">
                End
              </Label>
              <Input
                id="event-end"
                className="inset-field rounded-[10px]"
                type="datetime-local"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>

            <Label className="flex items-center gap-2">
              <Checkbox
                checked={allDay}
                onCheckedChange={(checked) => setAllDay(checked === true)}
              />
              <span className="text-[12px] text-muted-foreground">All day</span>
            </Label>

            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] text-muted-foreground">Category</span>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((option) => (
                  <button
                    key={option.slug}
                    type="button"
                    className={cn(
                      'inset-field inline-flex items-center gap-1.5 rounded-[10px] px-2 py-1 text-[11px] text-muted-foreground',
                      category === option.slug && 'text-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.3)]',
                    )}
                    onClick={() => setCategory(option.slug)}
                  >
                    <span
                      className="size-1.5 rounded-full"
                      style={{ background: toneColor(option.toneIndex) }}
                    />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-notes" className="text-[12px] text-muted-foreground">
                Notes
              </Label>
              <textarea
                id="event-notes"
                className="inset-field min-h-16 w-full rounded-[10px] px-3 py-2 text-sm outline-none"
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-reminder" className="text-[12px] text-muted-foreground">
                Remind me
              </Label>
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
                <SelectTrigger id="event-reminder" className="inset-field w-full rounded-[10px]">
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
            </div>
            {reminderBlocked && (
              <p className="text-[13px] text-muted-foreground">
                Notifications are blocked for this site, so this reminder will not show. Allow
                them in your browser's site settings to fix that.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="mt-2 flex-row flex-wrap gap-2 sm:justify-start">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          {onDelete && !readOnly && (
            confirming ? (
              <Button variant="destructive" onClick={onDelete}>
                Really delete
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setConfirming(true)}>
                Delete
              </Button>
            )
          )}
          {!readOnly && (
            <Button
              variant="gradient"
              className="ml-auto"
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
            >
              Save
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
