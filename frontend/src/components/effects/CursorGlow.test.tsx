import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CursorGlow } from './CursorGlow';

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('CursorGlow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders children', () => {
    mockMatchMedia(false);
    render(
      <CursorGlow>
        <span>hello</span>
      </CursorGlow>
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('does not track the pointer when reduced motion is on', () => {
    mockMatchMedia(true);
    const { container } = render(
      <CursorGlow>
        <span>hello</span>
      </CursorGlow>
    );
    const far = container.querySelectorAll('[aria-hidden="true"]')[0] as HTMLElement;
    const before = far.style.transform;
    fireEvent.pointerMove(container.firstElementChild as Element, { clientX: 200, clientY: 200 });
    expect(far.style.transform).toBe(before);
  });
});
