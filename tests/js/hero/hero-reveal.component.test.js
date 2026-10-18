import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HeroReveal } from '@site/js/hero/hero-reveal.js';

const stubMedia = (matching) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({ matches: matching.includes(query) })),
  );

describe('HeroReveal', () => {
  let hero, name, globe, modifierKey, reveal, face;
  const letters = (word) =>
    [...word.querySelectorAll('.letter')].map((letter) => [
      letter.textContent,
      letter.style.getPropertyValue('--i'),
    ]);

  beforeEach(() => {
    document.documentElement.className = '';
    document.body.innerHTML = `
      <section id="hero"><h1 id="name"><span class="word">Gustavo</span> <span class="word">Eklund</span></h1></section>
      <div id="globe"></div><kbd id="mod">⌘</kbd>`;
    [hero, name, globe, modifierKey] = ['hero', 'name', 'globe', 'mod'].map((id) =>
      document.getElementById(id),
    );
    reveal = new HeroReveal({ hero, name, globe, modifierKey });
    stubMedia([]);
    vi.stubGlobal('navigator', { platform: 'Linux x86_64' });
  });

  afterEach(() => {
    if (face) document.fonts.delete(face);
    face = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.documentElement.className = '';
  });

  describe('prepare', () => {
    it('splits each word into one numbered span per letter, keeping the text', () => {
      reveal.prepare();
      const [first, second] = name.querySelectorAll('.word');
      expect([letters(first), letters(second)]).toStrictEqual([
        [
          ['G', '0'],
          ['u', '1'],
          ['s', '2'],
          ['t', '3'],
          ['a', '4'],
          ['v', '5'],
          ['o', '6'],
        ],
        [
          ['E', '0'],
          ['k', '1'],
          ['l', '2'],
          ['u', '3'],
          ['n', '4'],
          ['d', '5'],
        ],
      ]);
      expect(name.textContent).toBe('Gustavo Eklund');
    });

    it('names the heading by its label and hides the animated letters, so a screen reader does not spell the name', () => {
      reveal.prepare();
      expect([
        name.getAttribute('aria-label'),
        [...name.querySelectorAll('.word')].map((word) => word.getAttribute('aria-hidden')),
      ]).toStrictEqual(['Gustavo Eklund', ['true', 'true']]);
    });

    it('collapses the white space of the markup in the label', () => {
      name.innerHTML = '<span class="word">Gustavo</span>\n   <span class="word">Eklund</span>';
      reveal.prepare();
      expect(name.getAttribute('aria-label')).toBe('Gustavo Eklund');
    });

    it('splits by whole characters, so an accent or an emoji stays in one span', () => {
      name.innerHTML = '<span class="word">Éà😀</span>';
      reveal.prepare();
      expect(letters(name.querySelector('.word')).map(([text]) => text)).toStrictEqual([
        'É',
        'à',
        '😀',
      ]);
    });

    it('spells the shortcut key Ctrl away from Apple platforms', () => {
      reveal.prepare();
      expect(modifierKey.textContent).toBe('Ctrl');
    });

    it.each([['MacIntel'], ['iPhone'], ['iPad']])('keeps the ⌘ on %s', (platform) => {
      vi.stubGlobal('navigator', { platform });
      reveal.prepare();
      expect(modifierKey.textContent).toBe('⌘');
    });
  });

  describe('reveal', () => {
    let load;
    beforeEach(() => {
      face = new FontFace('Bricolage Grotesque', 'local("Arial")');
      document.fonts.add(face);
      load = vi.spyOn(document.fonts, 'load').mockResolvedValue([]);
      vi.useFakeTimers();
    });
    afterEach(() => vi.restoreAllMocks());

    it('marks the page ready and the hero revealed, then the globe 250 ms later with a callback', async () => {
      const onGlobeRevealed = vi.fn();
      await reveal.reveal(onGlobeRevealed);
      expect([
        document.documentElement.classList.contains('fonts-ready'),
        hero.classList.contains('is-revealed'),
        globe.classList.contains('is-revealed'),
        onGlobeRevealed.mock.calls.length,
      ]).toStrictEqual([true, true, false, 0]);
      vi.advanceTimersByTime(249);
      expect([
        globe.classList.contains('is-revealed'),
        onGlobeRevealed.mock.calls.length,
      ]).toStrictEqual([false, 0]);
      vi.advanceTimersByTime(1);
      expect([
        globe.classList.contains('is-revealed'),
        onGlobeRevealed.mock.calls.length,
      ]).toStrictEqual([true, 1]);
      expect(onGlobeRevealed).toHaveBeenNthCalledWith(1);
    });

    it('reveals the globe without delay for visitors who prefer reduced motion', async () => {
      stubMedia(['(prefers-reduced-motion: reduce)']);
      const onGlobeRevealed = vi.fn();
      await reveal.reveal(onGlobeRevealed);
      vi.advanceTimersByTime(0);
      expect([
        globe.classList.contains('is-revealed'),
        onGlobeRevealed.mock.calls.length,
      ]).toStrictEqual([true, 1]);
    });

    it('works without a callback', async () => {
      await reveal.reveal();
      vi.advanceTimersByTime(250);
      expect(globe.classList.contains('is-revealed')).toBe(true);
    });

    it('asks the browser to load the three display fonts, in order', async () => {
      await reveal.reveal();
      expect(load).toHaveBeenCalledTimes(3);
      expect(load).toHaveBeenNthCalledWith(1, '800 1em "Bricolage Grotesque"');
      expect(load).toHaveBeenNthCalledWith(2, 'italic 400 1em "Instrument Serif"');
      expect(load).toHaveBeenNthCalledWith(3, '500 1em "JetBrains Mono"');
    });
  });

  describe('reveal when a display font fails to load', () => {
    beforeEach(() => {
      face = new FontFace('Bricolage Grotesque', 'url(/missing-font.woff2)');
      document.fonts.add(face);
    });

    it('still marks the page ready and reveals the hero, which keeps the menu and the marquee visible', async () => {
      await reveal.reveal();
      expect([
        document.documentElement.classList.contains('fonts-ready'),
        hero.classList.contains('is-revealed'),
      ]).toStrictEqual([true, true]);
    });

    it('still reveals the globe and calls back, 250 ms later', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const onGlobeRevealed = vi.fn();
      await reveal.reveal(onGlobeRevealed);
      vi.advanceTimersByTime(250);
      expect([
        globe.classList.contains('is-revealed'),
        onGlobeRevealed.mock.calls.length,
      ]).toStrictEqual([true, 1]);
    });

    it('does not reject, whichever of the three fonts fails', async () => {
      vi.spyOn(document.fonts, 'load').mockImplementation((font) =>
        font.includes('Instrument')
          ? Promise.reject(new DOMException('A network error occurred.', 'NetworkError'))
          : Promise.resolve([]),
      );
      await expect(reveal.reveal()).resolves.toBeUndefined();
      vi.restoreAllMocks();
    });
  });

  describe('reveal without the display font declared', () => {
    beforeEach(() => vi.useFakeTimers());

    it('gives up after 1800 ms rather than hold the page back', async () => {
      const done = reveal.reveal();
      await vi.advanceTimersByTimeAsync(1799);
      expect(document.documentElement.classList.contains('fonts-ready')).toBe(false);
      await vi.advanceTimersByTimeAsync(41);
      await done;
      expect([
        document.documentElement.classList.contains('fonts-ready'),
        hero.classList.contains('is-revealed'),
      ]).toStrictEqual([true, true]);
    });
  });
});
