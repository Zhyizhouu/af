/**
 * The assistant's API.
 *
 * One synchronous call per message. No job id, no polling: the model answers in
 * a second or two, and nothing is stored anywhere until this app writes it
 * locally.
 *
 * A port of `lib/programs/ai/ai_api.dart`. The wire format is unchanged — the
 * Go service does not know or care which framework is talking to it.
 */

declare const __AF_CONVERT_API__: string;

/**
 * Where the assistant lives. Injected at build time from `AF_CONVERT_API`.
 *
 * Empty is a real state rather than a fallback to localhost: the Flutter build
 * defaulted to `http://localhost:8080`, which on a deployed site resolves to
 * each visitor's own machine and dies as mixed content, silently. Empty makes
 * the page say the API is not configured instead.
 */
export const apiBase = (__AF_CONVERT_API__ ?? '').replace(/\/+$/, '');

export class AiError extends Error {
  /** Rate limited rather than broken. Waiting is the fix; retrying is not. */
  readonly throttled: boolean;

  constructor(message: string, throttled = false) {
    super(message);
    this.name = 'AiError';
    this.throttled = throttled;
  }
}

/**
 * The wire format for times: a local wall clock with no zone. The model is
 * reasoning about "Monday at nine", and turning that into an instant is this
 * app's job, in this device's timezone.
 */
export function formatLocal(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ` +
    `${pad(value.getHours())}:${pad(value.getMinutes())}`
  );
}

const localPattern = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

export function parseLocal(value: string | undefined | null): Date | null {
  const match = localPattern.exec((value ?? '').trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface SessionProposal {
  type: string;
  start: Date;
  room: string;
  courseCode: string;
  courseName: string;
  courseClass: string;
}

export interface EventProposal {
  title: string;
  notes: string;
  start: Date;
  end: Date;
  allDay: boolean;
  category: string;
}

export const sessionLabel = (proposal: SessionProposal): string =>
  [proposal.courseCode, proposal.courseName].filter(Boolean).join(' · ');

export function sessionFromJson(json: Record<string, unknown>): SessionProposal | null {
  const start = parseLocal(json.start as string);
  if (!start) return null;
  return {
    type: String(json.type ?? 'UAP').toUpperCase(),
    start,
    room: String(json.room ?? ''),
    courseCode: String(json.courseCode ?? ''),
    courseName: String(json.courseName ?? ''),
    courseClass: String(json.courseClass ?? ''),
  };
}

export const sessionToJson = (proposal: SessionProposal) => ({
  type: proposal.type,
  start: formatLocal(proposal.start),
  room: proposal.room,
  courseCode: proposal.courseCode,
  courseName: proposal.courseName,
  courseClass: proposal.courseClass,
});

export function eventFromJson(json: Record<string, unknown>): EventProposal | null {
  const start = parseLocal(json.start as string);
  if (!start) return null;
  const parsedEnd = parseLocal(json.end as string);
  // An end at or before its start is the commonest arithmetic slip, and an hour
  // is what the instructions ask for by default — repaired rather than dropped,
  // because the time is a guess either way but the event is not.
  const end =
    parsedEnd && parsedEnd > start ? parsedEnd : new Date(start.getTime() + 3600_000);
  return {
    title: String(json.title ?? ''),
    notes: String(json.notes ?? ''),
    start,
    end,
    allDay: Boolean(json.allDay),
    category: String(json.category ?? 'other'),
  };
}

export const eventToJson = (proposal: EventProposal) => ({
  title: proposal.title,
  notes: proposal.notes,
  start: formatLocal(proposal.start),
  end: formatLocal(proposal.end),
  allDay: proposal.allDay,
  category: proposal.category,
});

/**
 * A QR code the assistant handed back.
 *
 * Not a proposal. It changes nothing — no calendar entry, no deletion, nothing
 * that survives closing the tab — so it renders straight into the transcript
 * rather than waiting behind the confirm button. Only things that touch stored
 * data are gated.
 */
export interface QrArtifact {
  text: string;
  label: string;
  ecc: string;
  useLogo: boolean;
}

/** A file the person attached. Metadata only on the wire; see AiAttachment. */
export interface AttachmentRef {
  name: string;
  kind: string;
}

/** Something already in the calendar, on its way to the assistant. */
export interface AiEntry {
  id: string;
  kind: 'event' | 'session';
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  category?: string;
  /** A session's fields, unflattened — a replacement cannot be rebuilt from
   *  "UAS · Room 401", and moving one means deleting it and proposing that. */
  type?: string;
  room?: string;
  courseCode?: string;
  courseName?: string;
  courseClass?: string;
}

const entryToJson = (entry: AiEntry) => ({
  id: entry.id,
  kind: entry.kind,
  title: entry.title,
  start: formatLocal(entry.start),
  end: formatLocal(entry.end),
  allDay: entry.allDay,
  ...(entry.category ? { category: entry.category } : {}),
  ...(entry.type ? { type: entry.type } : {}),
  ...(entry.room ? { room: entry.room } : {}),
  ...(entry.courseCode ? { courseCode: entry.courseCode } : {}),
  ...(entry.courseName ? { courseName: entry.courseName } : {}),
  ...(entry.courseClass ? { courseClass: entry.courseClass } : {}),
});

/** One message in the conversation, on its way back to the server. */
export interface AiTurn {
  role: 'user' | 'assistant';
  text: string;
  sessions?: SessionProposal[];
  events?: EventProposal[];
  removals?: string[];
  habitTicks?: AiHabitTick[];
  committed?: boolean;
}

/** A mark against one habit, on the wire. Ids only — the name is ours. */
export interface AiHabitTick {
  habitId: string;
  day: string;
  done: boolean;
}

/** One of the person's habits, as the assistant is shown it. */
export interface AiHabit {
  id: string;
  name: string;
  done: boolean;
}

const turnToJson = (turn: AiTurn) => ({
  role: turn.role,
  text: turn.text,
  ...(turn.sessions?.length ? { sessions: turn.sessions.map(sessionToJson) } : {}),
  ...(turn.events?.length ? { events: turn.events.map(eventToJson) } : {}),
  ...(turn.removals?.length ? { removals: turn.removals } : {}),
  ...(turn.habitTicks?.length ? { habitTicks: turn.habitTicks } : {}),
  ...(turn.committed ? { committed: true } : {}),
});

/** One answer: what it said, and what it is offering. */
export interface AiAnswer {
  reply: string;
  sessions: SessionProposal[];
  events: EventProposal[];
  /** Ids only. The card is drawn from this app's own record, so it can never
   *  describe one entry while deleting another. */
  removals: string[];
  /** Marks against habits. Ids only, for the same reason removals are. */
  habitTicks: AiHabitTick[];
  /** Produced, not proposed. Nothing here needs confirming. */
  qrCodes: QrArtifact[];
}

export interface AiLimits {
  configured: boolean;
  sessionTypes: string[];
  maxProposals: number;
}

export interface AiClientOptions {
  base?: string;
  token?: () => Promise<string | null>;
  fetcher?: typeof fetch;
}

export class AiApi {
  readonly base: string;
  private readonly token: () => Promise<string | null>;
  private readonly fetcher: typeof fetch;

  constructor(options: AiClientOptions = {}) {
    this.base = (options.base ?? apiBase).replace(/\/+$/, '');
    this.token = options.token ?? (async () => null);
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  private async headers(json = false): Promise<Record<string, string>> {
    let token: string | null = null;
    try {
      token = await this.token();
    } catch {
      token = null;
    }
    if (!token) throw new AiError('Sign in to use the assistant.');
    return {
      Authorization: `Bearer ${token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    };
  }

  /** Signed like every other call: the server gates this behind an account
   *  too, so an unauthenticated reader cannot learn what is configured on it. */
  async limits(): Promise<AiLimits> {
    const body = await this.send(async () =>
      this.fetcher(`${this.base}/v1/ai/limits`, { headers: await this.headers() }),
    );
    return {
      configured: Boolean(body.configured),
      sessionTypes: Array.isArray(body.sessionTypes)
        ? (body.sessionTypes as string[])
        : ['UAP', 'UAS'],
      maxProposals: Number(body.maxProposals ?? 40),
    };
  }

  /**
   * Says something and reads what comes back.
   *
   * `history` and `existing` are sent every time because the server keeps
   * neither. `now` and `categories` are sent rather than assumed: "next Monday"
   * depends on where the person asking is.
   */
  async sendMessage(input: {
    message: string;
    history: AiTurn[];
    existing: AiEntry[];
    /** Names and kinds only — the bytes never leave the browser. */
    attachments: AttachmentRef[];
    now: Date;
    categories: string[];
    /** Their habits and whether each is done today. Sent for the same reason
     *  `existing` is: the server stores none of it. */
    habits: AiHabit[];
  }): Promise<AiAnswer> {
    const body = await this.send(async () =>
      this.fetcher(`${this.base}/v1/ai/plan`, {
        method: 'POST',
        headers: await this.headers(true),
        body: JSON.stringify({
          prompt: input.message,
          history: input.history.map(turnToJson),
          existing: input.existing.map(entryToJson),
          attachments: input.attachments,
          now: formatLocal(input.now),
          categories: input.categories,
          habits: input.habits,
        }),
      }),
    );

    return {
      reply: String(body.reply ?? ''),
      sessions: asArray(body.sessions).map(sessionFromJson).filter(isPresent),
      events: asArray(body.events).map(eventFromJson).filter(isPresent),
      removals: (Array.isArray(body.removals) ? (body.removals as unknown[]) : []).filter(
        (id): id is string => typeof id === 'string' && id.trim() !== '',
      ),
      habitTicks: asArray(body.habitTicks)
        .map((tick) => ({
          habitId: String(tick.habitId ?? ''),
          day: String(tick.day ?? ''),
          done: Boolean(tick.done),
        }))
        .filter((tick) => tick.habitId !== '' && tick.day !== ''),
      qrCodes: asArray(body.qrCodes)
        .map((code) => ({
          text: String(code.text ?? ''),
          label: String(code.label ?? 'QR code'),
          ecc: String(code.ecc ?? 'M').toUpperCase(),
          useLogo: Boolean(code.useLogo),
        }))
        .filter((code) => code.text !== ''),
    };
  }

  private async send(
    call: () => Promise<Response>,
  ): Promise<Record<string, unknown>> {
    if (!this.base) {
      throw new AiError(
        'No assistant is configured for this build. Set AF_CONVERT_API and rebuild.',
      );
    }

    let response: Response;
    try {
      response = await call();
    } catch (error) {
      if (error instanceof AiError) throw error;
      throw new AiError(`The assistant at ${this.base} is not reachable.`);
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      // A proxy in front of the API answers HTML, not the JSON shape.
    }

    if (response.ok) return body;
    throw new AiError(this.messageOf(response.status, body), response.status === 429);
  }

  private messageOf(status: number, body: Record<string, unknown>): string {
    if (typeof body.error === 'string') return body.error;
    switch (status) {
      case 401:
        return 'Sign in to use the assistant.';
      case 429:
        return 'The assistant has hit its quota for now. Try again shortly.';
      case 503:
        return 'The assistant is not configured on this server.';
      default:
        return `The assistant returned ${status}.`;
    }
  }
}

const asArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

const isPresent = <T,>(value: T | null): value is T => value !== null;
