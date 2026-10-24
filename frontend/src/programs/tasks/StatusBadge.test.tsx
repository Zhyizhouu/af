import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PriorityFlag } from './PriorityFlag';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders plain text with no svg or icon element', () => {
    const { container } = render(<StatusBadge option={{ label: 'Done', toneIndex: 1 }} />);
    expect(container.querySelector('svg, img, i, [class*="icon"]')).toBeNull();
    expect(container.firstElementChild?.tagName).toBe('SPAN');
    expect(container).toHaveTextContent('Done');
  });

  it('becomes a labelled menu trigger button when clickable', () => {
    render(<StatusBadge option={{ label: 'Done', toneIndex: 1 }} onClick={() => {}} />);
    const button = screen.getByRole('button', { name: 'Status: Done' });
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button.querySelector('svg')).toBeNull();
  });
});

describe('PriorityFlag', () => {
  const options = [
    { label: 'High', toneIndex: 5 },
    { label: 'Medium', toneIndex: 3 },
    { label: 'Low', toneIndex: 4 },
  ];

  it('fills bars by option rank, first option highest', () => {
    const { container, rerender } = render(<PriorityFlag option={options[0]!} options={options} />);
    expect(container.querySelectorAll('.is-on')).toHaveLength(3);
    rerender(<PriorityFlag option={options[2]!} options={options} />);
    expect(container.querySelectorAll('.is-on')).toHaveLength(1);
  });
});
