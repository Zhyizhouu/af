import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { GlowScrollArea } from './GlowScrollArea';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('GlowScrollArea', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders children', () => {
    render(
      <GlowScrollArea>
        <div>content</div>
      </GlowScrollArea>
    );
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('marks data-scrolling true while scrolling and false 700ms after the last scroll', () => {
    const { container } = render(
      <GlowScrollArea>
        <div>content</div>
      </GlowScrollArea>
    );
    const root = container.firstElementChild as HTMLElement;
    const viewport = container.querySelector('[data-radix-scroll-area-viewport]') as Element;

    expect(root).toHaveAttribute('data-scrolling', 'false');

    act(() => {
      fireEvent.scroll(viewport);
    });
    expect(root).toHaveAttribute('data-scrolling', 'true');

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(root).toHaveAttribute('data-scrolling', 'false');
  });
});
