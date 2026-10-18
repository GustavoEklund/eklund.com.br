import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HistoryAccordion } from '@site/js/history/history-accordion.js';

const stubMedia = (matching) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({ matches: matching.includes(query) })),
  );
const WIDE = '(min-width: 900px)',
  REDUCED = '(prefers-reduced-motion: reduce)';
/** Waits frame by frame until the condition holds; an IntersectionObserver reports on a frame of its own. */
const untilTrue = async (condition) => {
  for (let frame = 0; frame < 60 && !condition(); frame++)
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
};

describe('HistoryAccordion', () => {
  let root, cards, accordion;
  const open = () => cards.map((card) => card.classList.contains('is-open'));
  const expanded = () =>
    cards.map((card) => card.querySelector('.job-header').getAttribute('aria-expanded'));
  const header = (index) => cards[index].querySelector('.job-header');
  const build = (position = 'static') => {
    document.body.innerHTML = `<div id="root" style="position:${position};height:200px">${[0, 1, 2].map((index) => `<article class="job-card"><button class="job-header">Job ${index}</button></article>`).join('')}</div>`;
    root = document.getElementById('root');
    cards = [...document.querySelectorAll('.job-card')];
    accordion = new HistoryAccordion(root);
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    stubMedia([WIDE]);
    build();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sets the autoplay duration variable to 9000 ms', () => {
    accordion.install();
    expect(root.style.getPropertyValue('--autoplay-duration')).toBe('9000ms');
  });

  describe('show', () => {
    it('opens exactly one card and marks the headers expanded or collapsed', () => {
      accordion.show(1);
      expect([open(), expanded()]).toStrictEqual([
        [false, true, false],
        ['false', 'true', 'false'],
      ]);
    });

    it('wraps past the last card to the first, and before the first to the last', () => {
      accordion.show(3);
      expect(open()).toStrictEqual([true, false, false]);
      accordion.show(-1);
      expect(open()).toStrictEqual([false, false, true]);
    });

    it('autoplays on a wide screen: marks the root and moves on after 9000 ms', () => {
      accordion.show(0);
      expect(root.classList.contains('is-autoplaying')).toBe(true);
      vi.advanceTimersByTime(8999);
      expect(open()).toStrictEqual([true, false, false]);
      vi.advanceTimersByTime(1);
      expect(open()).toStrictEqual([false, true, false]);
      vi.advanceTimersByTime(9000);
      expect(open()).toStrictEqual([false, false, true]);
      vi.advanceTimersByTime(9000);
      expect(open()).toStrictEqual([true, false, false]);
    });

    it('waits 6 s longer after a manual choice: 15000 ms in total', () => {
      accordion.show(1, true);
      vi.advanceTimersByTime(14999);
      expect(open()).toStrictEqual([false, true, false]);
      vi.advanceTimersByTime(1);
      expect(open()).toStrictEqual([false, false, true]);
    });

    it('keeps a single timer pending however often it is called', () => {
      accordion.show(0);
      accordion.show(1);
      accordion.show(2);
      expect(vi.getTimerCount()).toBe(1);
    });

    it('does not autoplay for visitors who prefer reduced motion', () => {
      stubMedia([WIDE, REDUCED]);
      accordion.show(1);
      expect([root.classList.contains('is-autoplaying'), vi.getTimerCount()]).toStrictEqual([
        false,
        0,
      ]);
      vi.advanceTimersByTime(60000);
      expect(open()).toStrictEqual([false, true, false]);
    });

    it('does not autoplay on a narrow screen', () => {
      stubMedia([]);
      accordion.show(1);
      expect([root.classList.contains('is-autoplaying'), vi.getTimerCount()]).toStrictEqual([
        false,
        0,
      ]);
    });
  });

  describe('clicking a header', () => {
    beforeEach(() => accordion.install());

    it('opens that card as a manual choice', () => {
      header(2).click();
      expect([open(), expanded()]).toStrictEqual([
        [false, false, true],
        ['false', 'false', 'true'],
      ]);
      vi.advanceTimersByTime(14999);
      expect(open()).toStrictEqual([false, false, true]);
      vi.advanceTimersByTime(1);
      expect(open()).toStrictEqual([true, false, false]);
    });

    it('keeps the open card open on a wide screen', () => {
      accordion.show(1);
      header(1).click();
      expect(open()).toStrictEqual([false, true, false]);
    });

    it('collapses the open card on a narrow screen, so every header reads collapsed and nothing is scheduled', () => {
      stubMedia([]);
      accordion.show(0);
      header(0).click();
      expect([
        open(),
        expanded(),
        root.classList.contains('is-autoplaying'),
        vi.getTimerCount(),
      ]).toStrictEqual([[false, false, false], ['false', 'false', 'false'], false, 0]);
    });

    it('opens the same card again with the next tap on a narrow screen', () => {
      stubMedia([]);
      accordion.show(0);
      header(0).click();
      header(0).click();
      expect(open()).toStrictEqual([true, false, false]);
    });

    it('opens another card on a narrow screen', () => {
      stubMedia([]);
      accordion.show(0);
      header(1).click();
      expect(open()).toStrictEqual([false, true, false]);
    });
  });

  describe('pointer', () => {
    beforeEach(() => accordion.install());

    it('pauses autoplay while the pointer is over the accordion', () => {
      accordion.show(0);
      root.dispatchEvent(new PointerEvent('pointerenter'));
      vi.advanceTimersByTime(60000);
      expect(open()).toStrictEqual([true, false, false]);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('resumes 4 s after the pointer leaves, if it was autoplaying', () => {
      accordion.show(0);
      root.dispatchEvent(new PointerEvent('pointerenter'));
      root.dispatchEvent(new PointerEvent('pointerleave'));
      vi.advanceTimersByTime(3999);
      expect(open()).toStrictEqual([true, false, false]);
      vi.advanceTimersByTime(1);
      expect(open()).toStrictEqual([false, true, false]);
    });

    it('does not resume when it was not autoplaying', () => {
      stubMedia([]);
      accordion.show(0);
      root.dispatchEvent(new PointerEvent('pointerleave'));
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('keyboard focus', () => {
    beforeEach(() => accordion.install());

    it('pauses autoplay while a header has the focus, the way the pointer does', () => {
      accordion.show(0);
      root.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      vi.advanceTimersByTime(60000);
      expect([open(), vi.getTimerCount()]).toStrictEqual([[true, false, false], 0]);
    });

    it('resumes 4 s after the focus leaves, if it was autoplaying', () => {
      accordion.show(0);
      root.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      root.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      vi.advanceTimersByTime(3999);
      expect(open()).toStrictEqual([true, false, false]);
      vi.advanceTimersByTime(1);
      expect(open()).toStrictEqual([false, true, false]);
    });

    it('does not resume when it was not autoplaying', () => {
      stubMedia([]);
      accordion.show(0);
      root.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('the motion setting', () => {
    beforeEach(() => {
      accordion.install();
      accordion.show(0);
    });
    afterEach(() => {
      delete document.documentElement.dataset.motion;
    });

    it('stops advancing and drops the autoplay mark when the visitor pauses motion', () => {
      stubMedia([WIDE, REDUCED]);
      accordion.sync();
      vi.advanceTimersByTime(60000);
      expect([open(), root.classList.contains('is-autoplaying'), vi.getTimerCount()]).toStrictEqual(
        [[true, false, false], false, 0],
      );
    });

    it('autoplays again, with a fresh 9 s on the clock, when motion is back on', () => {
      stubMedia([WIDE, REDUCED]);
      accordion.sync();
      stubMedia([WIDE]);
      accordion.sync();
      expect(root.classList.contains('is-autoplaying')).toBe(true);
      vi.advanceTimersByTime(8999);
      expect(open()).toStrictEqual([true, false, false]);
      vi.advanceTimersByTime(1);
      expect(open()).toStrictEqual([false, true, false]);
    });

    it('keeps a collapsed accordion collapsed and still', () => {
      accordion.collapse();
      accordion.sync();
      vi.advanceTimersByTime(60000);
      expect([open(), root.classList.contains('is-autoplaying'), vi.getTimerCount()]).toStrictEqual(
        [[false, false, false], false, 0],
      );
    });

    it('does not start anything on a narrow screen', () => {
      stubMedia([]);
      accordion.sync();
      expect([root.classList.contains('is-autoplaying'), vi.getTimerCount()]).toStrictEqual([
        false,
        0,
      ]);
    });
  });

  describe('collapse', () => {
    it('closes every card, stops the timer and drops the autoplay mark', () => {
      accordion.show(1);
      accordion.collapse();
      expect([
        open(),
        expanded(),
        root.classList.contains('is-autoplaying'),
        vi.getTimerCount(),
      ]).toStrictEqual([[false, false, false], ['false', 'false', 'false'], false, 0]);
    });

    it('does not advance afterwards, however long it waits', () => {
      accordion.show(1);
      accordion.collapse();
      vi.advanceTimersByTime(60000);
      expect(open()).toStrictEqual([false, false, false]);
    });

    it('is undone by showing a card, which opens it and autoplays again on a wide screen', () => {
      accordion.collapse();
      accordion.show(2);
      expect([open(), root.classList.contains('is-autoplaying'), vi.getTimerCount()]).toStrictEqual(
        [[false, false, true], true, 1],
      );
    });
  });

  describe('the autoplay mark', () => {
    const MARKED = 'history is-autoplaying reveal';
    beforeEach(() => {
      root.className = MARKED;
    });

    it('stays on a wide screen, where cards advance by themselves', () => {
      accordion.install();
      expect(root.className).toBe(MARKED);
    });

    it('is removed on a narrow screen as soon as the accordion is installed, since nothing advances there', () => {
      stubMedia([]);
      accordion.install();
      expect(root.className).toBe('history reveal');
    });

    it('is removed for visitors who prefer reduced motion', () => {
      stubMedia([WIDE, REDUCED]);
      accordion.install();
      expect(root.className).toBe('history reveal');
    });

    it('follows the screen each time a card is shown', () => {
      accordion.show(0);
      expect(root.classList.contains('is-autoplaying')).toBe(true);
      stubMedia([]);
      accordion.show(1);
      expect(root.classList.contains('is-autoplaying')).toBe(false);
    });
  });

  describe('collapsed state and the viewport observer', () => {
    let callbacks;
    beforeEach(() => {
      callbacks = [];
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          constructor(callback) {
            callbacks.push(callback);
          }
          observe() {}
        },
      );
      stubMedia([]);
      accordion.install();
    });

    it('opens the current card when the accordion comes on screen', () => {
      callbacks[0]([{ isIntersecting: true }]);
      expect(open()).toStrictEqual([true, false, false]);
    });

    it('keeps a collapsed accordion collapsed when it leaves the screen and comes back', () => {
      callbacks[0]([{ isIntersecting: true }]);
      header(0).click();
      callbacks[0]([{ isIntersecting: false }]);
      callbacks[0]([{ isIntersecting: true }]);
      expect(open()).toStrictEqual([false, false, false]);
    });
  });

  describe('visibility', () => {
    it('opens the first card and starts autoplay once the accordion is on screen', async () => {
      accordion.install();
      await untilTrue(() => open()[0] && vi.getTimerCount() === 1);
      expect([open(), root.classList.contains('is-autoplaying'), vi.getTimerCount()]).toStrictEqual(
        [[true, false, false], true, 1],
      );
    });

    it('stops the timer when it leaves the screen', async () => {
      accordion.install();
      await untilTrue(() => open()[0] && vi.getTimerCount() === 1);
      root.style.cssText = 'position:absolute;top:-5000px;height:200px';
      await untilTrue(() => vi.getTimerCount() === 0);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
