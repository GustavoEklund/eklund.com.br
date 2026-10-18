import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalClock } from '@site/js/hero/local-clock.js';
import { Formatter } from '@site/js/shared/format.js';

describe('LocalClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T15:04:00Z'));
    Formatter.use('pt-BR');
  });
  afterEach(() => vi.useRealTimers());

  it('renders the owner time at once, in the owner time zone', () => {
    const render = vi.fn();
    new LocalClock('America/Sao_Paulo').start(render);
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenNthCalledWith(1, '12:04');
  });

  it('uses the time zone it was given', () => {
    const render = vi.fn();
    new LocalClock('Asia/Tokyo').start(render);
    expect(render).toHaveBeenNthCalledWith(1, '00:04');
  });

  it('refreshes every 15 seconds and not before', () => {
    const render = vi.fn();
    new LocalClock('America/Sao_Paulo').start(render);
    vi.advanceTimersByTime(14999);
    expect(render).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(render).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(45000);
    expect(render.mock.calls).toStrictEqual([
      ['12:04'],
      ['12:04'],
      ['12:04'],
      ['12:04'],
      ['12:05'],
    ]);
  });

  it('keeps exactly one interval running', () => {
    new LocalClock('America/Sao_Paulo').start(() => {});
    expect(vi.getTimerCount()).toBe(1);
  });

  it('follows the interface language for the digits it renders', () => {
    const render = vi.fn();
    Formatter.use('en-US');
    new LocalClock('America/Sao_Paulo').start(render);
    expect(render).toHaveBeenNthCalledWith(1, '12:04');
  });
});
