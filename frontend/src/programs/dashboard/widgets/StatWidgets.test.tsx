import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompletionStatWidget, EventsStatWidget, HabitsStatWidget, TasksStatWidget } from './StatWidgets';

let habits: { id: string; name: string }[] = [];
let completed: string[] = [];
let completion: { day: string; fraction: number }[] = [];
let agenda: {
  kind: 'event' | 'session' | 'task';
  id: string;
  title: string;
  start: Date;
  end: Date;
  finished: boolean;
}[] = [];

vi.mock('../../../app/session', () => ({
  useSession: () => ({ revision: 0 }),
}));

vi.mock('../../habits/store', () => ({
  listHabits: async () => habits,
  readDay: async () => ({ day: 'today', completed, updatedAt: 0 }),
  completionOver: async () => completion,
  todayKey: () => 'today',
}));

vi.mock('../../../data/agenda', () => ({
  readAgenda: async () => agenda,
}));

describe('HabitsStatWidget', () => {
  it('shows the done/total count and how many are left', async () => {
    habits = [{ id: 'a', name: 'Run' }, { id: 'b', name: 'Read' }, { id: 'c', name: 'Sleep' }];
    completed = ['a'];
    render(<HabitsStatWidget />);
    expect(await screen.findByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByText('2 left for today')).toBeInTheDocument();
  });

  it('says all done when nothing is left', async () => {
    habits = [{ id: 'a', name: 'Run' }];
    completed = ['a'];
    render(<HabitsStatWidget />);
    expect(await screen.findByText('All done today')).toBeInTheDocument();
  });

  it('says no habits yet when there are none', async () => {
    habits = [];
    completed = [];
    render(<HabitsStatWidget />);
    expect(await screen.findByText('No habits yet')).toBeInTheDocument();
  });
});

describe('TasksStatWidget', () => {
  it('counts tasks due this week and today', async () => {
    agenda = [
      { kind: 'task', id: 't1', title: 'A', start: new Date('2026-09-26T10:00:00Z'), end: new Date('2026-09-26T10:00:00Z'), finished: false },
      { kind: 'task', id: 't2', title: 'B', start: new Date('2026-09-28T10:00:00Z'), end: new Date('2026-09-28T10:00:00Z'), finished: false },
    ];
    render(<TasksStatWidget />);
    expect(await screen.findByText('Tasks due this week')).toBeInTheDocument();
  });
});

describe('EventsStatWidget', () => {
  it('shows nothing else today when no upcoming event remains', async () => {
    agenda = [];
    render(<EventsStatWidget />);
    expect(await screen.findByText('Nothing else today')).toBeInTheDocument();
  });
});

describe('CompletionStatWidget', () => {
  it('shows no habits yet when there are none', async () => {
    habits = [];
    completion = [];
    render(<CompletionStatWidget />);
    expect(await screen.findByText('No habits yet')).toBeInTheDocument();
  });

  it('shows the rounded percentage when habits exist', async () => {
    habits = [{ id: 'a', name: 'Run' }];
    completion = Array.from({ length: 7 }, (_, i) => ({ day: `d${i}`, fraction: 1 }));
    render(<CompletionStatWidget />);
    expect(await screen.findByText('100%')).toBeInTheDocument();
  });
});
