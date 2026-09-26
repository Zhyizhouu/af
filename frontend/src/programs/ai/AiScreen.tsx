import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from 'cn';
import { ArrowUp, Menu, Paperclip, Plus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { AIMark } from '../../components/brand/AIMark';
import { readAgenda, readSessionsById, type AgendaEntry } from '../../data/agenda';
import { idToken } from '../../data/firebase';
import { useSession } from '../../app/session';
import { AiApi, AiError, type AiEntry, type AiLimits } from './api';
import {
  assistantMessage,
  attachmentRefs,
  errorMessage,
  latestLogo,
  maxAttachmentBytes,
  hasProposals,
  keptCount,
  keptEvents,
  keptHabitTicks,
  keptRemovals,
  keptSessions,
  toTurn,
  userMessage,
  type AiAttachment,
  type AiMessage,
} from './message';
import { Sidebar } from './Sidebar';
import {
  deleteConversation,
  listConversations,
  loadConversation,
  newConversationId,
  saveConversation,
} from './conversations';
import { commitTurn } from './commit';
import { EventCard, HabitTickCard, ProposalsSummary, QrArtifactCard, RemovalCard, SessionCard } from './cards';
import { readHabitsForAssistant } from '../habits/store';
import type { AiConversationRow } from '../../data/db';
import './ai.css';

/**
 * reAFresh · AI: talk about what you need scheduled, and confirm what it
 * proposes.
 *
 * The shape that matters is the pause in the middle. The assistant never
 * changes anything itself: it proposes, everything is shown for checking, and
 * one button commits. A model that wrote straight to a calendar would produce a
 * calendar nobody could trust. That goes double now it can offer to delete.
 */

/**
 * How much of the calendar the assistant is shown.
 *
 * A window rather than everything: a year of teaching is thousands of entries,
 * none of which would fit in a prompt. Yesterday is in it because "cancel this
 * morning's" is a thing people say in the afternoon.
 */
const lookBackDays = 1;
const lookAheadDays = 60;
const maxExisting = 120;

const categories = ['study', 'work', 'university', 'self', 'health', 'social', 'other'];

export function AiScreen({
  api,
  paneWidth = 'full',
}: {
  api?: AiApi;
  paneWidth?: 'full' | 'split';
}) {
  // The Firebase ID token is the credential the API asks for. Fetched per call
  // rather than held, because the SDK refreshes an expiring one on request.
  const client = useRef(api ?? new AiApi({ token: idToken }));
  const { requestSync, revision } = useSession();
  const transcript = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [conversationId, setConversationId] = useState(newConversationId);
  const [saved, setSaved] = useState<AiConversationRow[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<AiAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [limits, setLimits] = useState<AiLimits | null>(null);
  const [limitsError, setLimitsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Shell-style prompt recall. Browsing is a mode rather than a per-keypress
  // decision: entering it needs the caret at the very edge of the draft, so
  // the arrows still move between the lines of a multi-line message, but once
  // in it they step through history until you type something.
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const stashedDraft = useRef('');
  const composer = useRef<HTMLTextAreaElement>(null);

  // Collapsed by default in a split pane, and on anything narrow: a sidebar
  // plus a readable transcript needs room that half a window (or a phone)
  // does not have. Driven from state rather than hidden in CSS, because a
  // sidebar hidden by a media query while the state says it is open leaves no
  // toggle on screen and no way back to the history at all.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => paneWidth === 'full' && window.innerWidth > 720,
  );

  const refreshSaved = useCallback(async () => {
    const rows = await listConversations();
    if (mounted.current) setSaved(rows);
  }, []);

  useEffect(() => {
    void refreshSaved();
    client.current
      .limits()
      .then((result) => {
        if (mounted.current) setLimits(result);
      })
      .catch((error: unknown) => {
        if (mounted.current && error instanceof AiError) setLimitsError(error.message);
      });
  }, [refreshSaved]);

  // Long and eased rather than a jump: the transcript is being read, and a fast
  // snap loses the reader's place in it.
  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const node = transcript.current;
      if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  // Anything a sync pulled down is invisible until the list is read again.
  useEffect(() => {
    void refreshSaved();
  }, [revision, refreshSaved]);

  const persist = useCallback(
    async (next: AiMessage[], id: string) => {
      if (next.length === 0) return;
      await saveConversation(id, next);
      await refreshSaved();
      // Debounced upstream, so a burst of turns costs one push.
      requestSync();
    },
    [refreshSaved, requestSync],
  );

  /** The slice of the calendar the assistant is shown. */
  const calendarWindow = useCallback(
    (agenda: AgendaEntry[], sessions: Awaited<ReturnType<typeof readSessionsById>>, now: Date) => {
      const from = new Date(now);
      from.setDate(from.getDate() - lookBackDays);
      from.setHours(0, 0, 0, 0);
      const until = new Date(now);
      until.setDate(until.getDate() + lookAheadDays);

      const window: AiEntry[] = [];
      for (const entry of agenda) {
        // Task Tracker due dates are out of the assistant's window for now:
        // it knows the calendar and proctor sessions, not Task Tracker.
        if (entry.kind === 'task') continue;
        if (entry.end < from || entry.start > until) continue;
        const session = entry.kind === 'session' ? sessions.get(entry.id) : undefined;
        window.push({
          id: entry.id,
          kind: entry.kind,
          title: entry.title,
          start: entry.start,
          end: entry.end,
          allDay: entry.allDay,
          category: entry.category,
          type: session?.type,
          room: session?.room,
          courseCode: session?.courseCode,
          courseName: session?.courseName,
          courseClass: session?.courseClass,
        });
        if (window.length >= maxExisting) break;
      }
      return window;
    },
    [],
  );

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || busy) return;

    const [agenda, sessions, habits] = await Promise.all([
      readAgenda(),
      readSessionsById(),
      readHabitsForAssistant(),
    ]);
    const now = new Date();
    if (!mounted.current) return;

    // Taken before the new message is added, and skipping failures: an error
    // bubble is this app talking to itself, not something the assistant said.
    const history = messages.filter((m) => !m.failed).map(toTurn);

    const withUser = [...messages, userMessage(message, pending)];
    setMessages(withUser);
    setDraft('');
    setHistoryIndex(null);
    setPending([]);
    setAttachError(null);
    setBusy(true);
    scrollToEnd();

    let next: AiMessage[];
    try {
      const answer = await client.current.sendMessage({
        message,
        history,
        existing: calendarWindow(agenda, sessions, now),
        // Names and kinds only. The model has no reason to see a logo to
        // decide whether the request wants one used, and the bytes never
        // leaving the browser is the cheaper and more private answer.
        attachments: attachmentRefs(withUser),
        // This device's clock, because "next Monday" is relative to whoever is
        // asking rather than to wherever the server runs.
        now,
        categories,
        habits,
      });
      // Names resolved here rather than in the card, so a tick keeps saying
      // which habit it was even after that habit is renamed or deleted.
      next = [
        ...withUser,
        assistantMessage(answer, agenda, new Map(habits.map((h) => [h.id, h.name]))),
      ];
    } catch (error) {
      next = [
        ...withUser,
        errorMessage(error instanceof AiError ? error.message : String(error)),
      ];
    }

    if (mounted.current) {
      setMessages(next);
      setBusy(false);
      scrollToEnd();
    }
    await persist(next, conversationId);
  }, [draft, busy, messages, pending, conversationId, calendarWindow, persist, scrollToEnd]);

  /**
   * Reads a file into the pending attachments.
   *
   * Small on purpose: these live inside the conversation document, which
   * Firestore caps at 1 MiB, and a logo that syncs is worth more than a large
   * one that does not.
   */
  const attach = useCallback((file: File) => {
    if (file.size > maxAttachmentBytes) {
      setAttachError(
        `${file.name} is too large, keep attachments under ${Math.round(
          maxAttachmentBytes / 1024,
        )} KB so they sync with the conversation.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachError(null);
      setPending((current) => [
        ...current,
        { name: file.name, kind: file.type || 'application/octet-stream', data: String(reader.result) },
      ]);
    };
    reader.readAsDataURL(file);
  }, []);

  const commit = useCallback(
    async (index: number) => {
      const message = messages[index];
      if (!message || busy || message.committed) return;

      setBusy(true);
      let next: AiMessage[];
      try {
        await commitTurn(message);
        next = messages.map((m, i) => (i === index ? { ...m, committed: true } : m));
      } catch (error) {
        next = [...messages, errorMessage(`Some changes could not be applied: ${error}`)];
      }

      if (mounted.current) {
        setMessages(next);
        setBusy(false);
      }
      // Saved here too: whether a turn was carried out is the one piece of
      // state that must survive, or reopening offers to do it all again.
      await persist(next, conversationId);
    },
    [messages, busy, conversationId, persist],
  );

  const drop = useCallback(
    (index: number, field: 'droppedSessions' | 'droppedEvents' | 'droppedRemovals' | 'droppedHabitTicks', at: number) => {
      setMessages((current) =>
        current.map((m, i) =>
          i === index ? { ...m, [field]: new Set([...m[field], at]) } : m,
        ),
      );
    },
    [],
  );

  const dismissAll = useCallback((index: number) => {
    setMessages((current) =>
      current.map((m, i) =>
        i === index
          ? {
              ...m,
              droppedSessions: new Set([...m.droppedSessions, ...m.sessions.keys()]),
              droppedEvents: new Set([...m.droppedEvents, ...m.events.keys()]),
              droppedHabitTicks: new Set([...m.droppedHabitTicks, ...m.habitTicks.keys()]),
              droppedRemovals: new Set([...m.droppedRemovals, ...m.removals.keys()]),
            }
          : m,
      ),
    );
  }, []);

  /**
   * Steps through this conversation's own prompts: -1 back, +1 forward.
   *
   * History is derived from the transcript rather than kept alongside it, so it
   * cannot drift out of step with what was actually sent, and opening an old
   * conversation brings its prompts back with it.
   */
  const recall = useCallback(
    (step: -1 | 1): boolean => {
      const prompts = messages.filter((m) => m.role === 'user').map((m) => m.text);
      if (prompts.length === 0) return false;

      const next = (historyIndex ?? prompts.length) + step;
      if (next < 0) return true; // already at the oldest: stay rather than wrap

      if (historyIndex === null) stashedDraft.current = draft;

      if (next >= prompts.length) {
        // Stepped past the newest: hand back the draft that was interrupted.
        setHistoryIndex(null);
        setDraft(stashedDraft.current);
      } else {
        setHistoryIndex(next);
        setDraft(prompts[next] ?? '');
      }

      // After the value lands, put the caret at the end so the recalled text is
      // ready to edit rather than to overtype.
      requestAnimationFrame(() => {
        const el = composer.current;
        if (el) el.setSelectionRange(el.value.length, el.value.length);
      });
      return true;
    },
    [messages, historyIndex, draft],
  );

  const startNew = useCallback(() => {
    setMessages([]);
    setDraft('');
    setHistoryIndex(null);
    setConversationId(newConversationId());
  }, []);

  const open = useCallback(
    (row: AiConversationRow) => {
      setMessages(loadConversation(row));
      setConversationId(row.id);
      setDraft('');
      setHistoryIndex(null);
      scrollToEnd();
    },
    [scrollToEnd],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteConversation(id);
      if (mounted.current && id === conversationId) startNew();
      await refreshSaved();
    },
    [conversationId, startNew, refreshSaved],
  );

  const configured = limits?.configured ?? true;
  const enabled = !busy && configured;

  return (
    <div className="ai flex h-full min-h-0 bg-[#050506] font-sans text-foreground">
      {sidebarOpen && (
        <Sidebar
          conversations={saved}
          currentId={conversationId}
          onOpen={open}
          onNew={startNew}
          onDelete={remove}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header
          className={cn(
            'flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.07] px-4 md:px-8',
            paneWidth === 'split' && 'pr-12',
          )}
        >
          {!sidebarOpen && (
            <Button
              variant="raised"
              size="icon-sm"
              aria-label="Show conversations"
              title="Show conversations"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={16} aria-hidden />
            </Button>
          )}
          <span className="text-[16px] font-semibold">AI</span>
          <span className="ml-auto flex items-center gap-2 text-[12px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
            <span className="hidden sm:inline">Sees your next two months</span>
          </span>
        </header>

        {limits && !limits.configured && (
          <div className="mx-auto mt-4 w-full max-w-[720px] shrink-0 px-4 md:px-0">
            <div className="surface-3d rounded-2xl p-4">
              <div className="mb-1.5 text-[12px] uppercase tracking-[0.08em] text-subtle-foreground">
                Not configured
              </div>
              <p className="text-[13px] leading-relaxed text-rose-400">
                This server has no Gemini API key, so the assistant cannot answer. Set
                AF_GEMINI_API_KEY on the API and restart it.
              </p>
            </div>
          </div>
        )}
        {limitsError && (
          <div className="mx-auto mt-4 w-full max-w-[720px] shrink-0 px-4 md:px-0">
            <div className="surface-3d rounded-2xl p-4">
              <p className="text-[13px] leading-relaxed text-muted-foreground">{limitsError}</p>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8" ref={transcript} data-testid="transcript">
          {messages.length === 0 && !busy ? (
            <div className="mx-auto flex h-full w-full max-w-[440px] flex-col items-center justify-center gap-3 text-center">
              <AIMark size={40} />
              <p className="whitespace-pre-line text-[14px] leading-relaxed text-foreground">
                Say what you need scheduled.{'\n'}Nothing changes until you confirm it.
              </p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                It can see the next two months of your calendar, so you can say “move my
                Monday exam to 10am” or “cancel the lunch tomorrow” as easily as you can
                add something new.
              </p>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-[720px] flex-col">
              {messages.map((message, index) => (
                <Turn
                  key={index}
                  message={message}
                  logo={latestLogo(messages.slice(0, index + 1))}
                  busy={busy}
                  onCommit={() => void commit(index)}
                  onDismiss={() => dismissAll(index)}
                  onDrop={(field, at) => drop(index, field, at)}
                />
              ))}
              {busy && <Thinking />}
            </div>
          )}
        </div>

        <div className="mx-auto w-full max-w-[720px] shrink-0 px-4 md:px-8">
          <div className="raised rounded-[18px] border border-white/10 px-3.5 pt-3 pb-2.5 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_20px_60px_-20px_rgba(255,255,255,0.12)]">
            <textarea
              className="max-h-[180px] min-h-[48px] w-full resize-none bg-transparent text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
              rows={2}
              ref={composer}
              value={draft}
              disabled={!enabled}
              placeholder="Write a message…"
              onChange={(event) => {
                setDraft(event.target.value);
                // Typing is how you leave history: from here the draft is yours.
                setHistoryIndex(null);
              }}
              onKeyDown={(event) => {
                // Up recalls, Down goes forward again. Entering history needs the
                // caret at the matching edge so a multi-line draft can still be
                // navigated; once browsing, the arrows belong to history.
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                  const el = event.currentTarget;
                  const collapsed = el.selectionStart === el.selectionEnd;
                  const browsing = historyIndex !== null;
                  const entering =
                    event.key === 'ArrowUp' && collapsed && el.selectionStart === 0;
                  // Down only means anything once there is somewhere to go back to.
                  if (browsing || entering) {
                    if (recall(event.key === 'ArrowUp' ? -1 : 1)) event.preventDefault();
                  }
                  return;
                }

                // Enter sends, Shift+Enter breaks the line. preventDefault is what
                // stops the newline landing as well as the message going, without
                // it you send and are left holding a blank second line.
                if (event.key !== 'Enter' || event.shiftKey) return;
                event.preventDefault();
                if (enabled) void send();
              }}
            />
            {pending.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pending.map((file, index) => (
                  <span
                    key={`${file.name}-${index}`}
                    className="inline-flex max-w-[220px] items-center gap-1.5 overflow-hidden rounded-md border border-white/10 px-1.5 py-0.5 text-[11px] text-ellipsis whitespace-nowrap text-muted-foreground"
                  >
                    {file.kind.startsWith('image/') && (
                      <img src={file.data} alt="" className="h-4 w-4 shrink-0 rounded-sm object-contain" />
                    )}
                    {file.name}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-rose-400"
                      aria-label={`Remove ${file.name}`}
                      onClick={() =>
                        setPending((current) => current.filter((_, i) => i !== index))
                      }
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            {attachError && <p className="mt-2 text-[12px] text-rose-400">{attachError}</p>}

            <div className="mt-2.5 flex items-center gap-2.5">
              <Button
                variant="raised"
                size="icon-sm"
                aria-label="New chat"
                title="New chat"
                disabled={busy || messages.length === 0}
                onClick={startNew}
              >
                <Plus size={16} aria-hidden />
              </Button>
              {/* The native file input is unstylable, so it is made transparent
                  and laid over a label styled as an icon button. The accessible
                  name goes on the input, not the label: the label also holds the
                  glyph, and a name of "⌷Attach an image" is what a screen reader
                  would then announce. */}
              <label className="relative inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground">
                <Paperclip size={16} aria-hidden />
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Attach an image"
                  title="Attach an image"
                  disabled={!enabled}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) attach(file);
                    event.target.value = '';
                  }}
                />
              </label>
              <span className="flex-1 truncate text-[11px] text-muted-foreground">
                Enter to send, Shift+Enter for a new line
              </span>
              {messages.length > 0 && (
                <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
                  {messages.length} turns
                </span>
              )}
              <button
                type="button"
                aria-label="Send"
                disabled={!enabled}
                onClick={() => void send()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:brightness-95 disabled:pointer-events-none disabled:opacity-50"
              >
                <ArrowUp size={16} aria-hidden />
              </button>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[720px] shrink-0 px-4 pt-2 pb-3 text-center text-[11px] text-subtle-foreground md:px-8">
          Nothing changes until you confirm it.
        </div>
      </div>
    </div>
  );
}

function Turn({
  message,
  logo,
  busy,
  onCommit,
  onDismiss,
  onDrop,
}: {
  message: AiMessage;
  /** The image attached at or before this turn, if any. */
  logo: string | null;
  busy: boolean;
  onCommit: () => void;
  onDismiss: () => void;
  onDrop: (field: 'droppedSessions' | 'droppedEvents' | 'droppedRemovals' | 'droppedHabitTicks', at: number) => void;
}) {
  if (message.role === 'user') {
    return (
      <div className="mb-5 flex justify-end">
        <div className="max-w-[520px] rounded-[14px] border border-white/10 bg-[#18181b] px-4 py-3">
          <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-foreground">{message.text}</p>
          {message.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {message.attachments.map((file) => (
                <span
                  key={file.name}
                  className="inline-flex max-w-[220px] items-center gap-1.5 overflow-hidden rounded-md border border-white/10 px-1.5 py-0.5 text-[11px] text-ellipsis whitespace-nowrap text-muted-foreground"
                >
                  {file.kind.startsWith('image/') && (
                    <img src={file.data} alt="" className="h-4 w-4 shrink-0 rounded-sm object-contain" />
                  )}
                  {file.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (message.failed) {
    return (
      <div className="surface-3d mb-5 rounded-2xl p-4">
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.08em] text-subtle-foreground">Problem</div>
        <p className="text-[13px] leading-relaxed text-rose-400">{message.text}</p>
      </div>
    );
  }

  const locked = busy || message.committed;

  return (
    <div className="mb-6 flex gap-3.5">
      <AIMark size={36} thinking={false} />
      <div className="min-w-0 flex-1">
        <p className="mb-3.5 text-[14px] leading-relaxed whitespace-pre-wrap text-foreground/90">{message.text}</p>

        {message.qrCodes.map((code, i) => (
          <QrArtifactCard key={`q${i}`} code={code} logo={logo} />
        ))}

        {hasProposals(message) && (
          <>
            {message.sessions.map((proposal, i) =>
              message.droppedSessions.has(i) ? null : (
                <SessionCard
                  key={`s${i}`}
                  proposal={proposal}
                  onRemove={locked ? undefined : () => onDrop('droppedSessions', i)}
                />
              ),
            )}
            {message.events.map((proposal, i) =>
              message.droppedEvents.has(i) ? null : (
                <EventCard
                  key={`e${i}`}
                  proposal={proposal}
                  onRemove={locked ? undefined : () => onDrop('droppedEvents', i)}
                />
              ),
            )}
            {message.habitTicks.map((tick, i) =>
              message.droppedHabitTicks.has(i) ? null : (
                <HabitTickCard
                  key={`h${i}`}
                  tick={tick}
                  onRemove={locked ? undefined : () => onDrop('droppedHabitTicks', i)}
                />
              ),
            )}
            {message.removals.map((entry, i) =>
              message.droppedRemovals.has(i) ? null : (
                <RemovalCard
                  key={`r${i}`}
                  entry={entry}
                  onKeep={locked ? undefined : () => onDrop('droppedRemovals', i)}
                />
              ),
            )}
            <CommitControl message={message} busy={busy} onCommit={onCommit} onDismiss={onDismiss} />
          </>
        )}
      </div>
    </div>
  );
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

function summarise(message: AiMessage): string {
  const sessions = keptSessions(message).length;
  const events = keptEvents(message).length;
  const removals = keptRemovals(message).length;
  const ticks = keptHabitTicks(message).length;

  const added = [
    sessions > 0 ? plural(sessions, 'session', 'sessions') : '',
    events > 0 ? plural(events, 'event', 'events') : '',
  ].filter(Boolean);

  return [
    added.length ? `Added ${added.join(' and ')}` : '',
    ticks > 0 ? `marked ${plural(ticks, 'habit', 'habits')}` : '',
    removals > 0 ? `deleted ${plural(removals, 'entry', 'entries')}` : '',
  ]
    .filter(Boolean)
    .join(', ')
    .concat('.');
}

function CommitControl({
  message,
  busy,
  onCommit,
  onDismiss,
}: {
  message: AiMessage;
  busy: boolean;
  onCommit: () => void;
  onDismiss: () => void;
}) {
  if (message.committed) return <p className="mt-1 text-[12.5px] text-emerald-400">{summarise(message)}</p>;

  const adding = keptSessions(message).length + keptEvents(message).length;
  const deleting = keptRemovals(message).length;
  const ticks = keptHabitTicks(message);

  // Habits get their own clause rather than being folded into "add": ticking
  // one adds nothing to the calendar, and a button claiming otherwise would be
  // lying about what it is about to do.
  const habits =
    ticks.length === 0
      ? ''
      : ticks.every((tick) => tick.done)
        ? `tick ${plural(ticks.length, 'habit', 'habits')}`
        : ticks.every((tick) => !tick.done)
          ? `untick ${plural(ticks.length, 'habit', 'habits')}`
          : `update ${plural(ticks.length, 'habit', 'habits')}`;

  // Spelled out rather than counted whenever a deletion is involved: "Apply 3
  // changes" is not something anybody should have to decode before pressing a
  // button that destroys one of them.
  const clauses = [
    adding > 0 ? `add ${adding} to my calendar` : '',
    habits,
    deleting > 0 ? `delete ${plural(deleting, 'entry', 'entries')}` : '',
  ].filter(Boolean);

  const label =
    clauses.length === 0
      ? 'Nothing left to do'
      : clauses.join(' and ').replace(/^./, (c) => c.toUpperCase());

  return (
    <ProposalsSummary
      count={keptCount(message)}
      confirmLabel={label}
      danger={deleting > 0}
      disabled={busy || keptCount(message) === 0}
      onConfirm={onCommit}
      onDismiss={onDismiss}
    />
  );
}

function Thinking() {
  return (
    <div className="mb-6 flex items-center gap-3.5">
      <AIMark size={36} thinking />
      <span className="text-[12px] text-muted-foreground">Thinking…</span>
    </div>
  );
}
