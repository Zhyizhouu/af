import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { SessionProvider } from '../../app/session';
import { AiScreen } from './AiScreen';
import { AiApi } from './api';
import { ProposalsSummary } from './cards';

vi.mock('../../data/firebase', () => ({
  watchAuth: (onChange: (user: null) => void) => {
    onChange(null);
    return () => {};
  },
  idToken: async () => 'id-token',
  signOutNow: async () => {},
}));

vi.mock('../../data/sync', () => ({ syncAll: async () => {} }));

const limitsBody = { configured: true, sessionTypes: ['UAP', 'UAS'], maxProposals: 40 };

function client() {
  const fetcher = vi.fn(async (url: RequestInfo | URL) => {
    if (String(url).endsWith('/limits')) {
      return new Response(JSON.stringify(limitsBody), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        sessions: [],
        events: [
          { title: 'Lunch with Dina', notes: '', start: '2026-08-19 12:00', end: '2026-08-19 13:00', allDay: false, category: 'social' },
          { title: 'Grade essays', notes: '', start: '2026-08-19 15:00', end: '2026-08-19 17:00', allDay: false, category: 'work' },
        ],
        removals: [],
        reply: 'Two things, then.',
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;

  return new AiApi({ base: 'http://converter.test', token: async () => 'id-token', fetcher });
}

describe('ai message list, with a real turn on the transcript', () => {
  it('shows the count header and the Confirm and Dismiss buttons', async () => {
    render(
      <MemoryRouter>
        <SessionProvider>
          <AiScreen api={client()} />
        </SessionProvider>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByPlaceholderText('Write a message…'));
    await userEvent.keyboard('lunch with Dina, and grading time on Wednesday');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Lunch with Dina')).toBeInTheDocument();
    expect(
      screen.getByText((_, node) => node?.textContent === '2 changes to confirm'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /to my calendar/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });
});

describe('ProposalsSummary, from fixture data', () => {
  it('shows its count header, and a Confirm and a Dismiss button', () => {
    render(
      <ProposalsSummary
        count={2}
        confirmLabel="Add 2 to my calendar"
        onConfirm={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText('2 changes to confirm')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add 2 to my calendar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });
});
