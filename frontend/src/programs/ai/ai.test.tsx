import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { SessionProvider } from '../../app/session';
import { AiScreen } from './AiScreen';

// Mocked at the boundary rather than by stubbing the provider, so the real
// session logic — scope swapping, debounced sync, the revision counter — is
// what the screen tests run against. Only Firebase itself is replaced.
vi.mock('../../data/firebase', () => ({
  watchAuth: (onChange: (user: null) => void) => {
    onChange(null);
    return () => {};
  },
  idToken: async () => 'id-token',
  signOutNow: async () => {},
}));

vi.mock('../../data/sync', () => ({ syncAll: async () => {} }));
import { AiApi } from './api';
import { messageFromJson, messageToJson, titleFor, userMessage, type AiMessage } from './message';
import type { AgendaEntry } from '../../data/agenda';

/**
 * The assistant's client half, ported.
 *
 * The model runs on the server and is not testable from here. What is testable
 * is everything protecting the calendar from it: that a malformed proposal is
 * dropped rather than shown, that a deletion names something real, and that
 * nothing is written until the button is pressed.
 */

const limitsBody = { configured: true, sessionTypes: ['UAP', 'UAS'], maxProposals: 40 };

const answer = (body: Record<string, unknown> = {}) => ({
  sessions: [],
  events: [],
  removals: [],
  reply: 'Here you go.',
  ...body,
});

const eventJson = (over: Record<string, unknown> = {}) => ({
  title: 'Lunch with Dina',
  notes: '',
  start: '2026-08-19 12:00',
  end: '2026-08-19 13:00',
  allDay: false,
  category: 'social',
  ...over,
});

/** A fetch that answers /limits normally and scripts the rest, recording asks. */
function scripted(captured: Record<string, unknown>[], answers: Record<string, unknown>[]) {
  let sent = 0;
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith('/limits')) {
      return new Response(JSON.stringify(limitsBody), { status: 200 });
    }
    captured.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const body = answers[Math.min(sent, answers.length - 1)] ?? answer();
    sent += 1;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
}

const client = (fetcher: typeof fetch) =>
  new AiApi({ base: 'http://converter.test', token: async () => 'id-token', fetcher });

/**
 * Everything the screen needs around it: the real session, faked Firebase, and
 * a router — a QR card links into the QR Generator, so the transcript is no
 * longer renderable outside one.
 */
function renderScreen(api: AiApi) {
  return render(
    <MemoryRouter>
      <SessionProvider>
        <AiScreen api={api} />
      </SessionProvider>
    </MemoryRouter>,
  );
}

async function say(text: string) {
  await userEvent.click(screen.getByPlaceholderText('Write a message…'));
  await userEvent.keyboard(text);
  await userEvent.click(screen.getByRole('button', { name: 'Send' }));
}

describe('api', () => {
  it('reads sessions, events and the reply out of an answer', async () => {
    const fetcher = scripted(
      [],
      [
        answer({
          sessions: [
            {
              type: 'UAP',
              start: '2026-08-17 09:00',
              room: '401',
              courseCode: 'COMP6047',
              courseName: 'Algorithm and Programming',
              courseClass: 'BAA1',
            },
          ],
          events: [eventJson()],
          reply: 'I assumed 2026.',
        }),
      ],
    );

    const result = await client(fetcher).sendMessage({
      message: 'anything',
      history: [],
      existing: [],
      attachments: [],
      now: new Date(2026, 7, 15, 9),
      categories: ['social'],
    });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]!.courseCode).toBe('COMP6047');
    expect(result.sessions[0]!.start).toEqual(new Date(2026, 7, 17, 9));
    expect(result.events[0]!.title).toBe('Lunch with Dina');
    expect(result.reply).toBe('I assumed 2026.');
  });

  // The server normalises too, but a proposal that arrives unreadable must
  // never reach the review list.
  it('drops a proposal with an unreadable time', async () => {
    const fetcher = scripted(
      [],
      [answer({ events: [eventJson({ title: 'Broken', start: 'next tuesday' }), eventJson({ title: 'Fine' })] })],
    );

    const result = await client(fetcher).sendMessage({
      message: 'x',
      history: [],
      existing: [],
      attachments: [],
      now: new Date(2026, 7, 15),
      categories: ['work'],
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.title).toBe('Fine');
  });

  it('repairs an end at or before its start to an hour', async () => {
    const fetcher = scripted(
      [],
      [answer({ events: [eventJson({ start: '2026-08-19 12:00', end: '2026-08-19 09:00' })] })],
    );

    const result = await client(fetcher).sendMessage({
      message: 'x',
      history: [],
      existing: [],
      attachments: [],
      now: new Date(2026, 7, 15),
      categories: ['work'],
    });

    expect(result.events[0]!.end).toEqual(new Date(2026, 7, 19, 13));
  });

  it('marks a quota refusal as throttled', async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'quota' }), { status: 429 }),
    ) as unknown as typeof fetch;

    await expect(
      client(fetcher).sendMessage({
        message: 'x',
        history: [],
        existing: [],
        attachments: [],
        now: new Date(),
        categories: ['work'],
      }),
    ).rejects.toMatchObject({ throttled: true });
  });

  // The Flutter build defaulted to localhost, which on a deployed site is each
  // visitor's own machine. An unset base has to say so instead.
  it('says so when no API is configured for the build', async () => {
    const bare = new AiApi({ base: '', token: async () => 'id-token' });
    await expect(bare.limits()).rejects.toThrow(/No assistant is configured/);
  });

  it('signs even the limits call', async () => {
    let auth: string | undefined;
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      auth = (init?.headers as Record<string, string>).Authorization;
      return new Response(JSON.stringify(limitsBody), { status: 200 });
    }) as unknown as typeof fetch;

    await client(fetcher).limits();
    expect(auth).toBe('Bearer id-token');
  });
});

describe('stored conversations', () => {
  // A conversation goes through IndexedDB and Firestore, so anything the round
  // trip loses is something the person wrote and cannot get back.
  it('survives being written down and read back', () => {
    const original: AiMessage = {
      role: 'assistant',
      text: 'Two things, then.',
      sessions: [
        {
          type: 'UAP',
          start: new Date(2026, 7, 17, 9),
          room: '401',
          courseCode: 'COMP6047',
          courseName: 'Algorithm',
          courseClass: 'BAA1',
        },
      ],
      events: [
        {
          title: 'Lunch',
          notes: 'At the canteen',
          start: new Date(2026, 7, 19, 12),
          end: new Date(2026, 7, 19, 13),
          allDay: false,
          category: 'social',
        },
      ],
      removals: [],
      qrCodes: [],
      attachments: [],
      droppedSessions: new Set(),
      droppedEvents: new Set([0]),
      droppedRemovals: new Set(),
      committed: true,
      failed: false,
    };

    const restored = messageFromJson(
      JSON.parse(JSON.stringify(messageToJson(original))) as Record<string, unknown>,
    );

    expect(restored).not.toBeNull();
    expect(restored!.sessions[0]!.courseCode).toBe('COMP6047');
    expect(restored!.sessions[0]!.start).toEqual(new Date(2026, 7, 17, 9));
    expect(restored!.events[0]!.notes).toBe('At the canteen');
    // The two flags that must survive: one stops it being offered again, the
    // other keeps a dropped proposal dropped.
    expect(restored!.committed).toBe(true);
    expect(restored!.droppedEvents).toEqual(new Set([0]));
  });

  // The entry may well have been deleted by the time this is reopened — which
  // is exactly why the card is drawn from a snapshot.
  it('keeps enough of a deletion to still draw it', () => {
    const entry: AgendaEntry = {
      kind: 'session',
      id: 'sess-9',
      title: 'UAS · Room 401',
      subtitle: 'COMP6047 · Algorithm',
      start: new Date(2026, 7, 18, 9),
      end: new Date(2026, 7, 18, 11),
      allDay: false,
      category: '',
      finished: false,
    };

    const restored = messageFromJson(
      JSON.parse(
        JSON.stringify(
          messageToJson({ ...userMessage('x'), role: 'assistant', removals: [entry] }),
        ),
      ) as Record<string, unknown>,
    );

    expect(restored!.removals).toHaveLength(1);
    expect(restored!.removals[0]!.title).toBe('UAS · Room 401');
    expect(restored!.removals[0]!.kind).toBe('session');
    expect(restored!.removals[0]!.start).toEqual(new Date(2026, 7, 18, 9));
  });

  it('rejects a turn with a role nobody wrote', () => {
    expect(messageFromJson({ role: 'wizard', text: 'nope' })).toBeNull();
  });

  it('names a conversation after the first thing asked', () => {
    expect(titleFor([userMessage('  UAP  Algoritma   next Monday  ')])).toBe(
      'UAP Algoritma next Monday',
    );
    expect(titleFor([])).toBe('New conversation');
    const long = titleFor([userMessage('word '.repeat(60))]);
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long).toMatch(/…$/);
  });
});

describe('screen', () => {
  it('shows a message and its answer', async () => {
    renderScreen(client(scripted([], [answer({ events: [eventJson()], reply: 'Lunch it is.' })])));

    await say('lunch with Dina on Wednesday');

    expect(await screen.findByText('Lunch it is.')).toBeInTheDocument();
    expect(screen.getByText('lunch with Dina on Wednesday')).toBeInTheDocument();
    expect(screen.getByText('Lunch with Dina')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add 1 to my calendar' })).toBeInTheDocument();
  });

  // The point of the conversation: the second message is answered knowing what
  // the first produced.
  it('carries the first exchange into the second message', async () => {
    const captured: Record<string, unknown>[] = [];
    renderScreen(client(
          scripted(captured, [
            answer({ events: [eventJson()], reply: 'Booked for noon.' }),
            answer({ reply: 'Moved.' }),
          ]),
        ));

    await say('lunch with Dina on Wednesday');
    await screen.findByText('Booked for noon.');
    await say('make that 10am');
    await screen.findByText('Moved.');

    expect(captured).toHaveLength(2);
    expect(captured[0]!.history).toEqual([]);

    const history = captured[1]!.history as Record<string, unknown>[];
    expect(history).toHaveLength(2);
    expect(history[1]!.text).toBe('Booked for noon.');
    // The entries travel with the turn — the prose alone does not say which
    // entry "that" refers to.
    expect(history[1]!.events).toHaveLength(1);
  });

  // A model naming an entry nobody sent it is hallucinating, and the client
  // must not invent a card for it either.
  it('does not draw a deletion naming nothing real', async () => {
    renderScreen(client(scripted([], [answer({ removals: ['made-up'], reply: 'Cancelling that.' })])));

    await say('cancel something');

    expect(await screen.findByText('Cancelling that.')).toBeInTheDocument();
    expect(screen.queryByText('DELETE')).not.toBeInTheDocument();
  });

  it('enter sends and shift+enter does not', async () => {
    const captured: Record<string, unknown>[] = [];
    renderScreen(client(scripted(captured, [answer({ reply: 'Noted.' })])));

    const box = screen.getByPlaceholderText('Write a message…');
    await userEvent.click(box);
    await userEvent.keyboard('first line{Shift>}{Enter}{/Shift}second line');

    expect(captured).toHaveLength(0);
    expect(box).toHaveValue('first line\nsecond line');

    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0]!.prompt).toBe('first line\nsecond line');
    expect(box).toHaveValue('');
  });

  // A QR changes nothing, so it renders straight into the transcript. Putting
  // it behind the confirm button would be asking somebody to approve a picture,
  // and a gate used for harmless things stops being read for dangerous ones.
  it('renders a QR code in the chat without asking to confirm it', async () => {
    renderScreen(
      client(
        scripted([], [
          answer({
            qrCodes: [
              { text: 'https://af.test/room-401', label: 'Room 401', ecc: 'M', useLogo: false },
            ],
            reply: 'Here is the code.',
          }),
        ]),
      ),
    );

    await say('make me a QR for https://af.test/room-401');

    expect(await screen.findByText('Here is the code.')).toBeInTheDocument();
    expect(screen.getByText('Room 401')).toBeInTheDocument();
    expect(await screen.findByAltText('QR code for Room 401')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add \d/ })).not.toBeInTheDocument();
    // And it can be taken somewhere useful from there.
    expect(screen.getByRole('link', { name: 'Open in QR Generator' })).toHaveAttribute(
      'href',
      expect.stringContaining('text=https%3A%2F%2Faf.test%2Froom-401'),
    );
  });

  it('carries an attached logo into the code', async () => {
    const captured: Record<string, unknown>[] = [];
    renderScreen(
      client(
        scripted(captured, [
          answer({
            qrCodes: [
              { text: 'https://af.test', label: 'Poster', ecc: 'H', useLogo: true },
            ],
            reply: 'With your logo on it.',
          }),
        ]),
      ),
    );

    const file = new File(['fake-png-bytes'], 'logo.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Attach an image'), file);
    await screen.findByText('logo.png');

    await say('put my logo on a QR for https://af.test');

    // The model is told a file exists, never sent the bytes.
    const attachments = captured[0]!.attachments as { name: string; kind: string }[];
    expect(attachments).toEqual([{ name: 'logo.png', kind: 'image/png' }]);
    expect(JSON.stringify(captured[0])).not.toContain('fake-png-bytes');

    const image = await screen.findByAltText('QR code for Poster');
    const svg = decodeURIComponent(image.getAttribute('src')!.split(',')[1]!);
    // The logo is composited into the code the person actually gets.
    expect(svg).toContain('<image');
  });

  // Asking for a logo without attaching one should still produce a code, and
  // should say why it has no logo rather than silently omitting it.
  it('says so when a logo was wanted but none is attached', async () => {
    renderScreen(
      client(
        scripted([], [
          answer({
            qrCodes: [{ text: 'https://af.test', label: 'Poster', ecc: 'H', useLogo: true }],
            reply: 'No image attached.',
          }),
        ]),
      ),
    );

    await say('put my logo on a QR for https://af.test');

    expect(await screen.findByAltText('QR code for Poster')).toBeInTheDocument();
    expect(screen.getByText(/No image is attached/)).toBeInTheDocument();
  });

  it('offers the conversation sidebar', async () => {
    renderScreen(client(scripted([], [answer()])));
    expect(await screen.findByLabelText('Conversations')).toBeInTheDocument();
    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument();
  });
});
