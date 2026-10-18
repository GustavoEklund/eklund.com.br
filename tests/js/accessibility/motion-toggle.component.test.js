import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MotionToggle } from '@site/js/accessibility/motion-toggle.js';

const REDUCED = '(prefers-reduced-motion: reduce)';
const stubSystem = (reduced) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({ matches: reduced && query === REDUCED })),
  );

describe('MotionToggle', () => {
  let button, toggle;
  const root = document.documentElement;
  const state = () => [root.dataset.motion, button.getAttribute('aria-pressed'), toggle.paused];

  beforeEach(() => {
    localStorage.clear();
    delete root.dataset.motion;
    document.body.innerHTML =
      '<button id="motion-toggle" type="button" aria-pressed="false">pause</button>';
    button = document.getElementById('motion-toggle');
    toggle = new MotionToggle({ button });
    stubSystem(false);
  });

  afterEach(() => {
    localStorage.clear();
    delete root.dataset.motion;
    vi.unstubAllGlobals();
  });

  describe('where it starts', () => {
    it('plays when the system has no preference and the visitor never chose', () => {
      toggle.mount();
      expect(state()).toStrictEqual(['full', 'false', false]);
    });

    it('is paused when the system asks for reduced motion and the visitor never chose', () => {
      stubSystem(true);
      toggle.mount();
      expect(state()).toStrictEqual(['paused', 'true', true]);
    });

    it('keeps a saved pause over a system that does not ask for reduced motion', () => {
      localStorage.setItem('motion', 'paused');
      toggle.mount();
      expect(state()).toStrictEqual(['paused', 'true', true]);
    });

    it('keeps a saved "full" over a system that asks for reduced motion', () => {
      stubSystem(true);
      localStorage.setItem('motion', 'full');
      toggle.mount();
      expect(state()).toStrictEqual(['full', 'false', false]);
    });

    it('returns itself, so it can be chained after mount', () => {
      expect(toggle.mount()).toBe(toggle);
    });
  });

  describe('the button', () => {
    beforeEach(() => toggle.mount());

    it('pauses on the first click and plays on the second, marking the root element and the button each time', () => {
      button.click();
      expect(state()).toStrictEqual(['paused', 'true', true]);
      button.click();
      expect(state()).toStrictEqual(['full', 'false', false]);
    });

    it('remembers the choice for the next visit', () => {
      button.click();
      expect(localStorage.getItem('motion')).toBe('paused');
      button.click();
      expect(localStorage.getItem('motion')).toBe('full');
    });
  });

  describe('listeners', () => {
    it('hear the new state after every change, in the order they registered, once each', () => {
      toggle.mount();
      const calls = [];
      toggle.onChange((paused) => calls.push(['first', paused, root.dataset.motion]));
      toggle.onChange((paused) => calls.push(['second', paused, root.dataset.motion]));
      button.click();
      button.click();
      expect(calls).toStrictEqual([
        ['first', true, 'paused'],
        ['second', true, 'paused'],
        ['first', false, 'full'],
        ['second', false, 'full'],
      ]);
    });

    it('are not told about the initial state, only about changes', () => {
      const listener = vi.fn();
      toggle.onChange(listener);
      toggle.mount();
      expect(listener).toHaveBeenCalledTimes(0);
    });

    it('hear a change made in code the same way as a click', () => {
      toggle.mount();
      const listener = vi.fn();
      toggle.onChange(listener);
      toggle.set(true);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenNthCalledWith(1, true);
      expect([state(), localStorage.getItem('motion')]).toStrictEqual([
        ['paused', 'true', true],
        'paused',
      ]);
    });
  });
});
