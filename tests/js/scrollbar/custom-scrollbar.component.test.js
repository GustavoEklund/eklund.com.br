import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CustomScrollbar } from '@site/js/scrollbar/custom-scrollbar.js';
import { Translator } from '@site/js/i18n/translator.js';
import { WindowListeners } from '../../support/window-listeners.js';

const SECTIONS = [
  { labelKey: 'nav.alpha', selector: '#alpha' },
  { labelKey: 'nav.beta', selector: '#beta' },
];
const DICTIONARIES = {
  'pt-BR': { meta: { title: 'T', description: 'D' }, nav: { alpha: 'Alfa', beta: 'Beta' } },
  'en-US': { meta: { title: 'T', description: 'D' }, nav: { alpha: 'Alpha', beta: 'Beta' } },
};
const TRACK_HEIGHT = 600,
  PAGE_HEIGHT = 2000;
const stubMedia = (matching) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({ matches: matching.includes(query) })),
  );
const frames = (count = 2) =>
  new Promise((resolve) => {
    let left = count;
    const step = () => (--left ? requestAnimationFrame(step) : resolve());
    requestAnimationFrame(step);
  });
const scrollTo = async (top) => {
  window.scrollTo({ top, behavior: 'instant' });
  await frames();
};

describe('CustomScrollbar', () => {
  let root, thumb, percent, marks, translator, listeners;
  const maxScroll = () => PAGE_HEIGHT - innerHeight;
  const thumbHeight = () =>
    Math.min(TRACK_HEIGHT, Math.max(36, (TRACK_HEIGHT * innerHeight) / PAGE_HEIGHT));
  const install = () => {
    const scrollbar = new CustomScrollbar({ root, sections: SECTIONS, translator });
    scrollbar.install();
    return scrollbar;
  };

  beforeEach(() => {
    document.body.style.margin = '0';
    document.body.innerHTML = `
      <div id="bar" style="position:fixed;top:0;right:0;width:20px;height:${TRACK_HEIGHT}px">
        <div class="scrollbar-track" style="position:absolute;inset:0"></div>
        <div class="scrollbar-thumb"><b>0%</b></div>
        <div class="scrollbar-marks"></div>
      </div>
      <section id="alpha" style="height:1000px"></section>
      <section id="beta" style="height:1000px"></section>`;
    root = document.getElementById('bar');
    thumb = root.querySelector('.scrollbar-thumb');
    percent = root.querySelector('.scrollbar-thumb b');
    marks = root.querySelector('.scrollbar-marks');
    translator = new Translator({ dictionaries: DICTIONARIES, locale: 'pt-BR' });
    stubMedia(['(pointer: fine)']);
    listeners = new WindowListeners().track();
    root.setPointerCapture = vi.fn();
  });

  afterEach(async () => {
    listeners.release();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.removeAttribute('style');
    await scrollTo(0);
  });

  it('does nothing without a fine pointer: no layout, no listeners', () => {
    stubMedia([]);
    install();
    expect([marks.innerHTML, thumb.style.cssText, listeners.registered]).toStrictEqual([
      '',
      '',
      [],
    ]);
  });

  it('sizes the thumb to the viewport share of the page, never below 36 px', () => {
    install();
    expect([
      thumb.style.getPropertyValue('--thumb-height'),
      thumb.style.getPropertyValue('--thumb-range'),
    ]).toStrictEqual([`${thumbHeight()}px`, `${TRACK_HEIGHT - thumbHeight()}px`]);
  });

  it('puts one translated mark per section at its share of the track', () => {
    install();
    expect(marks.innerHTML).toBe(
      '<i data-label="Alfa" data-i18n-attr="data-label:nav.alpha" data-target="#alpha" style="--y:0.0px"></i>' +
        '<i data-label="Beta" data-i18n-attr="data-label:nav.beta" data-target="#beta" style="--y:300.0px"></i>',
    );
  });

  it('shows the scrolled share as a whole percentage', async () => {
    install();
    expect(percent.textContent).toBe('0%');
    await scrollTo(maxScroll() / 2);
    expect(percent.textContent).toBe('50%');
    await scrollTo(maxScroll());
    expect(percent.textContent).toBe('100%');
    await scrollTo(0);
    expect(percent.textContent).toBe('0%');
  });

  it('moves the thumb itself when the browser has no scroll timelines', async () => {
    vi.spyOn(CSS, 'supports').mockReturnValue(false);
    install();
    await scrollTo(maxScroll() / 2);
    expect(thumb.style.translate).toBe(`-50% ${(TRACK_HEIGHT - thumbHeight()) / 2}px`);
  });

  it('leaves the thumb to CSS when scroll timelines exist', async () => {
    vi.spyOn(CSS, 'supports').mockReturnValue(true);
    install();
    await scrollTo(maxScroll() / 2);
    expect(thumb.style.translate).toBe('');
  });

  it('relays out on resize', () => {
    install();
    document.getElementById('alpha').style.height = '1500px';
    window.dispatchEvent(new Event('resize'));
    expect(marks.querySelector('[data-target="#beta"]').style.getPropertyValue('--y')).toBe(
      `${((1500 / 2500) * TRACK_HEIGHT).toFixed(1)}px`,
    );
  });

  describe('marks', () => {
    it('scroll their section into view, smoothly', () => {
      install();
      const scrollIntoView = vi
        .spyOn(document.getElementById('beta'), 'scrollIntoView')
        .mockImplementation(() => {});
      marks.querySelector('[data-target="#beta"]').click();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).toHaveBeenNthCalledWith(1, { behavior: 'smooth' });
    });

    it('scroll without animation when the visitor prefers reduced motion', () => {
      stubMedia(['(pointer: fine)', '(prefers-reduced-motion: reduce)']);
      install();
      const scrollIntoView = vi
        .spyOn(document.getElementById('alpha'), 'scrollIntoView')
        .mockImplementation(() => {});
      marks.querySelector('[data-target="#alpha"]').click();
      expect(scrollIntoView).toHaveBeenNthCalledWith(1, { behavior: 'auto' });
    });

    it('ignore a click between marks', () => {
      install();
      const scrollIntoView = vi
        .spyOn(Element.prototype, 'scrollIntoView')
        .mockImplementation(() => {});
      marks.click();
      expect(scrollIntoView).toHaveBeenCalledTimes(0);
    });
  });

  describe('dragging', () => {
    const pointer = (type, clientY, pointerId = 7) =>
      new PointerEvent(type, { bubbles: true, clientY, pointerId });
    const expectedTop = (clientY) =>
      Math.min(1, Math.max(0, (clientY - 0 - thumbHeight() / 2) / (TRACK_HEIGHT - thumbHeight()))) *
      maxScroll();

    it('captures the pointer, marks the bar and scrolls to the pointer on press', () => {
      install();
      root.dispatchEvent(pointer('pointerdown', 300));
      expect(root.classList.contains('is-dragging')).toBe(true);
      expect(root.setPointerCapture).toHaveBeenCalledTimes(1);
      expect(root.setPointerCapture).toHaveBeenNthCalledWith(1, 7);
      expect(scrollY).toBe(expectedTop(300));
    });

    it('follows the pointer while it moves, and clamps past the ends of the track', () => {
      install();
      root.dispatchEvent(pointer('pointerdown', 300));
      root.dispatchEvent(pointer('pointermove', 450));
      expect(scrollY).toBe(expectedTop(450));
      root.dispatchEvent(pointer('pointermove', 5000));
      expect(scrollY).toBe(maxScroll());
      root.dispatchEvent(pointer('pointermove', -5000));
      expect(scrollY).toBe(0);
    });

    it.each([['pointerup'], ['pointercancel']])('stops on %s', (type) => {
      install();
      root.dispatchEvent(pointer('pointerdown', 300));
      root.dispatchEvent(pointer(type, 300));
      const stoppedAt = scrollY;
      root.dispatchEvent(pointer('pointermove', 550));
      expect([root.classList.contains('is-dragging'), scrollY]).toStrictEqual([false, stoppedAt]);
    });

    it('ignores moves when no drag started', () => {
      install();
      root.dispatchEvent(pointer('pointermove', 500));
      expect(scrollY).toBe(0);
    });

    it('does not start a drag from a mark', () => {
      install();
      marks.querySelector('i').dispatchEvent(pointer('pointerdown', 100));
      expect([
        root.classList.contains('is-dragging'),
        root.setPointerCapture.mock.calls.length,
        scrollY,
      ]).toStrictEqual([false, 0, 0]);
    });
  });
});
