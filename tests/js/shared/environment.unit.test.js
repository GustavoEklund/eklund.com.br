import { describe, it, expect, afterEach, vi } from 'vitest';
import { Environment } from '@site/js/shared/environment.js';

/** Stubs matchMedia so that only the listed queries match, and returns the spy that records every query asked. */
const stubMedia = (matching) => {
  const matchMedia = vi.fn((query) => ({ matches: matching.includes(query) }));
  vi.stubGlobal('matchMedia', matchMedia);
  return matchMedia;
};

describe('Environment', () => {
  afterEach(() => vi.unstubAllGlobals());

  describe.each([
    ['prefersReducedMotion', '(prefers-reduced-motion: reduce)'],
    ['hasFinePointer', '(pointer: fine)'],
    ['isWideViewport', '(min-width: 900px)'],
  ])('%s', (getter, query) => {
    it(`is true when ${query} matches, after asking exactly that one query`, () => {
      const matchMedia = stubMedia([query]);
      expect(Environment[getter]).toBe(true);
      expect(matchMedia).toHaveBeenCalledTimes(1);
      expect(matchMedia).toHaveBeenNthCalledWith(1, query);
    });

    it('is false when nothing matches, after asking exactly that one query', () => {
      const matchMedia = stubMedia([]);
      expect(Environment[getter]).toBe(false);
      expect(matchMedia).toHaveBeenCalledTimes(1);
      expect(matchMedia).toHaveBeenNthCalledWith(1, query);
    });

    it('is false when only the other queries match', () => {
      stubMedia(
        ['(prefers-reduced-motion: reduce)', '(pointer: fine)', '(min-width: 900px)'].filter(
          (other) => other !== query,
        ),
      );
      expect(Environment[getter]).toBe(false);
    });

    it('asks again on every read, so it follows the live value', () => {
      let matches = false;
      const matchMedia = vi.fn(() => ({ matches }));
      vi.stubGlobal('matchMedia', matchMedia);
      const first = Environment[getter];
      matches = true;
      const second = Environment[getter];
      expect([first, second]).toStrictEqual([false, true]);
      expect(matchMedia).toHaveBeenCalledTimes(2);
    });
  });

  describe('motionPaused', () => {
    afterEach(() => {
      delete document.documentElement.dataset.motion;
    });

    it.each([
      ['paused', true],
      ['full', false],
      [undefined, false],
    ])('is %s for data-motion=%s on the root element', (value, expected) => {
      if (value !== undefined) document.documentElement.dataset.motion = value;
      expect(Environment.motionPaused).toBe(expected);
    });

    it('makes prefersReducedMotion true without asking the system, so a pause wins over a "no preference" system setting', () => {
      const matchMedia = stubMedia([]);
      document.documentElement.dataset.motion = 'paused';
      expect([Environment.prefersReducedMotion, matchMedia.mock.calls.length]).toStrictEqual([
        true,
        0,
      ]);
    });

    it('makes prefersReducedMotion false without asking the system once the visitor has played, so playing works where the system asks for less motion', () => {
      const matchMedia = stubMedia(['(prefers-reduced-motion: reduce)']);
      document.documentElement.dataset.motion = 'full';
      expect([Environment.prefersReducedMotion, matchMedia.mock.calls.length]).toStrictEqual([
        false,
        0,
      ]);
    });

    it.each([
      [['(prefers-reduced-motion: reduce)'], true],
      [[], false],
    ])(
      'falls back on the system setting %j until the page has set data-motion: %s',
      (matching, expected) => {
        stubMedia(matching);
        expect(Environment.prefersReducedMotion).toBe(expected);
      },
    );
  });

  describe('isApplePlatform', () => {
    it.each([
      ['MacIntel', true],
      ['iPhone', true],
      ['iPad', true],
      ['Linux x86_64', false],
      ['Win32', false],
      ['', false],
    ])('%j is %s', (platform, expected) => {
      vi.stubGlobal('navigator', { platform });
      expect(Environment.isApplePlatform).toBe(expected);
    });
  });

  describe('supportsPopover', () => {
    afterEach(() => {
      delete HTMLElement.prototype.popover;
    });

    it('is true when HTMLElement has a popover property', () => {
      Object.defineProperty(HTMLElement.prototype, 'popover', { configurable: true, value: null });
      expect(Environment.supportsPopover).toBe(true);
    });

    it('is false without it', () => {
      delete HTMLElement.prototype.popover;
      expect(Environment.supportsPopover).toBe(false);
    });
  });

  describe('supportsScrollTimeline', () => {
    it('is true when CSS.supports accepts animation-timeline: scroll()', () => {
      const supports = vi.fn(() => true);
      vi.stubGlobal('CSS', { supports });
      expect(Environment.supportsScrollTimeline).toBe(true);
      expect(supports).toHaveBeenCalledTimes(1);
      expect(supports).toHaveBeenNthCalledWith(1, 'animation-timeline', 'scroll()');
    });

    it('is false when the browser says no, after the same single question', () => {
      const supports = vi.fn(() => false);
      vi.stubGlobal('CSS', { supports });
      expect(Environment.supportsScrollTimeline).toBe(false);
      expect(supports).toHaveBeenCalledTimes(1);
      expect(supports).toHaveBeenNthCalledWith(1, 'animation-timeline', 'scroll()');
    });
  });
});
