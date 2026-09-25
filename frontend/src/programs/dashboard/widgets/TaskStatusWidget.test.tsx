import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TaskStatusWidget } from './TaskStatusWidget';

let pages: { id: string; values: Record<string, unknown> }[] = [];
let properties: {
  id: string;
  type: string;
  options: { id: string; label: string; toneIndex: number }[];
}[] = [];

vi.mock('../../../app/session', () => ({
  useSession: () => ({ revision: 0 }),
}));

vi.mock('../../tasks/store', () => ({
  listPages: async () => pages,
  listProperties: async () => properties,
}));

vi.mock('../../../data/tones', () => ({
  toneColor: (index: number) => `#tone-${index}`,
}));

function renderWidget() {
  return render(
    <MemoryRouter>
      <TaskStatusWidget />
    </MemoryRouter>,
  );
}

describe('TaskStatusWidget', () => {
  it('shows the empty state with no pages', async () => {
    pages = [];
    properties = [];
    renderWidget();
    expect(await screen.findByText('No tasks yet.')).toBeInTheDocument();
  });

  it('counts pages by status option, including two options and a total', async () => {
    properties = [
      {
        id: 'status',
        type: 'status',
        options: [
          { id: 'done', label: 'Done', toneIndex: 1 },
          { id: 'progress', label: 'In progress', toneIndex: 0 },
        ],
      },
    ];
    pages = [
      { id: 'p1', values: { status: 'done' } },
      { id: 'p2', values: { status: 'done' } },
      { id: 'p3', values: { status: 'progress' } },
    ];
    renderWidget();
    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', '3 tasks: 2 done, 1 in progress');
  });
});
