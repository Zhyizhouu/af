import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Intro } from './Intro';

if (typeof localStorage === 'undefined' || !localStorage) {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  });
}

function mockMatchMedia(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

describe('Intro', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the Skip intro button', () => {
    render(<Intro onDone={() => {}} />);
    expect(screen.getByRole('button', { name: 'Skip intro' })).toBeInTheDocument();
  });

  it('calls onDone after the full timeline', () => {
    const onDone = vi.fn();
    render(<Intro onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(1950);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('calls onDone within 250ms of clicking Skip', () => {
    const onDone = vi.fn();
    render(<Intro onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Skip intro' }));
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('calls onDone when Escape is pressed', () => {
    const onDone = vi.fn();
    render(<Intro onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('under reduced motion, calls onDone after about 700ms and never renders the wordmark letters', () => {
    mockMatchMedia(true);
    const onDone = vi.fn();
    render(<Intro onDone={onDone} />);
    expect(screen.queryByText('re')).not.toBeInTheDocument();
    expect(screen.queryByText('resh')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('re')).not.toBeInTheDocument();
    expect(screen.queryByText('resh')).not.toBeInTheDocument();
  });
});
