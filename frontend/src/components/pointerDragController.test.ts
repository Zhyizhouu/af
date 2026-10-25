import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { usePointerDrag, type PointerDragConfig } from './pointerDragController';

const press = (pointerType = 'mouse', x = 10, y = 10) =>
  ({
    button: 0,
    isPrimary: true,
    pointerId: 1,
    pointerType,
    clientX: x,
    clientY: y,
    preventDefault: vi.fn(),
    currentTarget: { focus: vi.fn() },
  }) as unknown as ReactPointerEvent<HTMLElement>;

const fire = (type: string, x = 0, y = 0, extra: Record<string, unknown> = {}) =>
  act(() => {
    const event = Object.assign(new Event(type, { cancelable: true, bubbles: true }), {
      pointerId: 1,
      clientX: x,
      clientY: y,
      ...extra,
    });
    window.dispatchEvent(event);
  });

const setup = (overrides: Partial<PointerDragConfig<string>> = {}) => {
  const config = {
    onBegin: vi.fn(),
    onMove: vi.fn(() => 'target'),
    onDrop: vi.fn(),
    onEnd: vi.fn(),
    ...overrides,
  };
  const view = renderHook(() => usePointerDrag<string>());
  const begin = (event = press()) => act(() => view.result.current.start(event, config));
  return { config, view, begin };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.style.cursor = '';
});

describe('usePointerDrag', () => {
  it('stays a click below the threshold and drags from it', () => {
    const { config, begin } = setup();
    begin();
    fire('pointermove', 13, 12);
    expect(config.onBegin).not.toHaveBeenCalled();

    fire('pointermove', 15, 10);
    expect(config.onBegin).toHaveBeenCalledTimes(1);
    expect(config.onMove).toHaveBeenCalledWith(15, 10);
    expect(document.body.style.cursor).toBe('grabbing');

    fire('pointerup', 15, 10);
    expect(config.onDrop).toHaveBeenCalledWith('target');
    expect(config.onEnd).toHaveBeenCalledTimes(1);
    expect(document.body.style.cursor).toBe('');
  });

  it('presses without moving end without a drop', () => {
    const { config, begin } = setup();
    begin();
    fire('pointerup', 10, 10);
    expect(config.onEnd).toHaveBeenCalledTimes(1);
    expect(config.onBegin).not.toHaveBeenCalled();
    expect(config.onDrop).not.toHaveBeenCalled();
  });

  it('lifts a finger after the hold and cancels the hold when the finger scrolls', () => {
    const held = setup();
    held.begin(press('touch'));
    act(() => void vi.advanceTimersByTime(219));
    expect(held.config.onBegin).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(held.config.onBegin).toHaveBeenCalledTimes(1);
    fire('pointerup');
    expect(held.config.onDrop).not.toHaveBeenCalled();
    expect(held.config.onEnd).toHaveBeenCalledTimes(1);

    const scrolled = setup();
    scrolled.begin(press('touch'));
    fire('pointermove', 10, 25);
    expect(scrolled.config.onEnd).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(500));
    expect(scrolled.config.onBegin).not.toHaveBeenCalled();
  });

  it('blocks touch scrolling only once the drag has begun', () => {
    const { begin } = setup();
    begin(press('touch'));
    const early = new Event('touchmove', { cancelable: true });
    window.dispatchEvent(early);
    expect(early.defaultPrevented).toBe(false);
    act(() => void vi.advanceTimersByTime(220));
    const late = new Event('touchmove', { cancelable: true });
    window.dispatchEvent(late);
    expect(late.defaultPrevented).toBe(true);
    fire('pointercancel');
  });

  it('cancels on Escape and drops nothing', () => {
    const { config, begin } = setup();
    begin();
    fire('pointermove', 30, 30);
    fire('keydown', 0, 0, { key: 'Escape' });
    expect(config.onBegin).toHaveBeenCalledTimes(1);
    expect(config.onDrop).not.toHaveBeenCalled();
    expect(config.onEnd).toHaveBeenCalledTimes(1);
    fire('pointerup', 30, 30);
    expect(config.onEnd).toHaveBeenCalledTimes(1);
  });

  it('drops nothing when released over no target', () => {
    const { config, begin } = setup({ onMove: vi.fn(() => null) });
    begin();
    fire('pointermove', 30, 30);
    fire('pointerup', 30, 30);
    expect(config.onDrop).not.toHaveBeenCalled();
    expect(config.onEnd).toHaveBeenCalledTimes(1);
  });

  it('swallows the click that follows a drag, once, but not after a plain press', () => {
    const { begin } = setup();
    const seen = vi.fn();
    document.addEventListener('click', seen);

    begin();
    fire('pointermove', 30, 30);
    fire('pointerup', 30, 30);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(seen).not.toHaveBeenCalled();
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(seen).toHaveBeenCalledTimes(1);

    begin();
    fire('pointerup', 10, 10);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(seen).toHaveBeenCalledTimes(2);

    document.removeEventListener('click', seen);
  });

  it('drops the swallow when no click arrives', () => {
    const { begin } = setup();
    const seen = vi.fn();
    document.addEventListener('click', seen);
    begin();
    fire('pointermove', 30, 30);
    fire('pointerup', 30, 30);
    act(() => void vi.advanceTimersByTime(1));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(seen).toHaveBeenCalledTimes(1);
    document.removeEventListener('click', seen);
  });

  it('tracks the offset from the press and clears it on release', () => {
    const { view, begin } = setup();
    begin();
    fire('pointermove', 40, 25);
    expect(view.result.current.offset).toEqual({ x: 30, y: 15 });
    fire('pointerup', 40, 25);
    expect(view.result.current.offset).toEqual({ x: 0, y: 0 });
  });

  it('ignores a secondary button and removes its listeners on unmount', () => {
    const { config, view, begin } = setup();
    begin({ ...press(), button: 2 } as ReactPointerEvent<HTMLElement>);
    fire('pointermove', 40, 40);
    expect(config.onBegin).not.toHaveBeenCalled();

    begin();
    fire('pointermove', 40, 40);
    view.unmount();
    expect(config.onEnd).toHaveBeenCalledTimes(1);
    expect(config.onDrop).not.toHaveBeenCalled();
    expect(document.body.style.cursor).toBe('');
    fire('pointermove', 80, 80);
    expect(config.onMove).toHaveBeenCalledTimes(1);
  });

  it('begins a mouse drag at the fixed threshold and a touch drag after the fixed hold', () => {
    const mouse = setup();
    mouse.begin();
    fire('pointermove', 14, 10);
    expect(mouse.config.onBegin).not.toHaveBeenCalled();
    fire('pointermove', 15, 10);
    expect(mouse.config.onBegin).toHaveBeenCalledTimes(1);
    fire('pointerup', 15, 10);

    const drift = setup();
    drift.begin(press('touch'));
    fire('pointermove', 18, 10);
    expect(drift.config.onEnd).not.toHaveBeenCalled();
    fire('pointermove', 19, 10);
    expect(drift.config.onEnd).toHaveBeenCalledTimes(1);
  });
});
