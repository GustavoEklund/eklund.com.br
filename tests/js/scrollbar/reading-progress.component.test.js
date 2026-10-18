import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReadingProgress } from '@site/js/scrollbar/reading-progress.js';

const scrollTo = async (y) => {
  window.scrollTo({ top: y, behavior: 'instant' });
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};

describe('ReadingProgress', () => {
  let bar;

  beforeEach(() => {
    document.body.style.margin = '0';
    document.body.innerHTML = '<div id="bar"></div>';
    document.body.style.height = `${innerHeight + 1000}px`;
    bar = document.getElementById('bar');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    document.body.style.height = '';
    await scrollTo(0);
  });

  it('does nothing when the browser has scroll timelines: the CSS animation drives the bar', async () => {
    vi.spyOn(CSS, 'supports').mockReturnValue(true);
    const addEventListener = vi.spyOn(window, 'addEventListener');
    new ReadingProgress(bar).install();
    await scrollTo(500);
    expect(addEventListener).toHaveBeenCalledTimes(0);
    expect(bar.style.scale).toBe('');
  });

  it('asks about animation-timeline: scroll() exactly once', () => {
    const supports = vi.spyOn(CSS, 'supports').mockReturnValue(true);
    new ReadingProgress(bar).install();
    expect(supports).toHaveBeenCalledTimes(1);
    expect(supports).toHaveBeenNthCalledWith(1, 'animation-timeline', 'scroll()');
  });

  it('without scroll timelines it scales the bar by the scrolled fraction', async () => {
    vi.spyOn(CSS, 'supports').mockReturnValue(false);
    new ReadingProgress(bar).install();
    await scrollTo(250);
    expect(bar.style.scale).toBe('0.25 1');
    await scrollTo(1000);
    expect(bar.style.scale).toBe('1');
    await scrollTo(0);
    expect(bar.style.scale).toBe('0 1');
  });

  it('registers one passive scroll listener on the window', () => {
    vi.spyOn(CSS, 'supports').mockReturnValue(false);
    const addEventListener = vi.spyOn(window, 'addEventListener');
    new ReadingProgress(bar).install();
    expect(addEventListener).toHaveBeenCalledTimes(1);
    const [type, listener, options] = addEventListener.mock.calls[0];
    expect([type, typeof listener, options]).toStrictEqual([
      'scroll',
      'function',
      { passive: true },
    ]);
  });
});
