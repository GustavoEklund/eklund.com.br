import { Environment } from '../shared/environment.js';

const FONT_WAIT_LIMIT_MS = 1800;
const DISPLAY_FONTS = [
  '800 1em "Bricolage Grotesque"',
  'italic 400 1em "Instrument Serif"',
  '500 1em "JetBrains Mono"',
];
const GLOBE_DELAY_MS = 250;

/** Splits the name into letters, waits for the display fonts, then reveals the hero and the globe. */
export class HeroReveal {
  #hero;
  #name;
  #globe;
  #modifierKey;

  constructor({ hero, name, globe, modifierKey }) {
    this.#hero = hero;
    this.#name = name;
    this.#globe = globe;
    this.#modifierKey = modifierKey;
  }

  prepare() {
    this.#splitWordsIntoLetters();
    if (!Environment.isApplePlatform) this.#modifierKey.textContent = 'Ctrl';
  }

  async reveal(onGlobeRevealed) {
    await this.#waitForDisplayFonts();
    document.documentElement.classList.add('fonts-ready');
    this.#hero.classList.add('is-revealed');
    setTimeout(
      () => {
        this.#globe.classList.add('is-revealed');
        onGlobeRevealed?.();
      },
      Environment.prefersReducedMotion ? 0 : GLOBE_DELAY_MS,
    );
  }

  /**
   * One span per letter makes a screen reader spell the name ("G u s t a v o"). The heading is named by its label
   * instead, and the animated letters are hidden from assistive technology.
   */
  #splitWordsIntoLetters() {
    this.#name.setAttribute('aria-label', this.#name.textContent.replace(/\s+/g, ' ').trim());
    for (const word of this.#name.querySelectorAll('.word')) {
      const text = word.textContent;
      word.setAttribute('aria-hidden', 'true');
      word.textContent = '';
      [...text].forEach((character, index) => {
        const letter = document.createElement('span');
        letter.className = 'letter';
        letter.style.setProperty('--i', index);
        letter.textContent = character;
        word.append(letter);
      });
    }
  }

  /** Resolves once the display fonts are usable, have failed, or after a limit: the page is revealed in every case. */
  async #waitForDisplayFonts() {
    const startedAt = performance.now();
    const remaining = () => FONT_WAIT_LIMIT_MS - (performance.now() - startedAt);
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    while (![...document.fonts].some((face) => /Bricolage/.test(face.family)) && remaining() > 0)
      await sleep(40);
    await Promise.race([
      Promise.allSettled(DISPLAY_FONTS.map((font) => document.fonts.load(font))),
      sleep(Math.max(0, remaining())),
    ]);
  }
}
