import { Dom } from '../shared/dom.js';
import { Environment } from '../shared/environment.js';

const AUTOPLAY_MS = 9000;
const MANUAL_PAUSE_MS = 6000;
const RESUME_AFTER_LEAVE_MS = 4000;

/** Horizontal accordion of job cards that advances on its own on wide screens. */
export class HistoryAccordion {
  #root;
  #cards;
  #currentIndex = 0;
  #collapsed = false;
  #timer = 0;

  constructor(root) {
    this.#root = root;
    this.#cards = Dom.queryAll('.job-card', root);
  }

  get #autoplays() {
    return !Environment.prefersReducedMotion && Environment.isWideViewport;
  }

  install() {
    this.#root.style.setProperty('--autoplay-duration', `${AUTOPLAY_MS}ms`);
    this.#root.classList.toggle('is-autoplaying', this.#autoplays);
    this.#cards.forEach((card, index) =>
      card.querySelector('.job-header').addEventListener('click', () => {
        if (card.classList.contains('is-open') && !Environment.isWideViewport) this.collapse();
        else this.show(index, true);
      }),
    );
    for (const [enter, leave] of [
      ['pointerenter', 'pointerleave'],
      ['focusin', 'focusout'],
    ]) {
      this.#root.addEventListener(enter, () => clearTimeout(this.#timer));
      this.#root.addEventListener(leave, () => {
        if (this.#root.classList.contains('is-autoplaying'))
          this.#scheduleNext(RESUME_AFTER_LEAVE_MS);
      });
    }
    new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !this.#collapsed) this.show(this.#currentIndex);
        else clearTimeout(this.#timer);
      },
      { threshold: 0.3 },
    ).observe(this.#root);
  }

  /** Follows the motion setting: autoplay stops while motion is off and starts again, from the top, when it is back on. */
  sync() {
    clearTimeout(this.#timer);
    this.#root.classList.remove('is-autoplaying');
    if (this.#collapsed || !this.#autoplays) return;
    void this.#root.offsetWidth; // restarts the progress animation
    this.#root.classList.add('is-autoplaying');
    this.#scheduleNext(AUTOPLAY_MS);
  }

  /** Opens a card; an index past either end wraps around. */
  show(index, manual = false) {
    this.#currentIndex = (index + this.#cards.length) % this.#cards.length;
    this.#collapsed = false;
    this.#markOpen(this.#currentIndex);
    clearTimeout(this.#timer);
    if (manual) {
      this.#root.classList.remove('is-autoplaying');
      void this.#root.offsetWidth; /* restarts the progress animation */
    }
    this.#root.classList.toggle('is-autoplaying', this.#autoplays);
    if (this.#autoplays) this.#scheduleNext(AUTOPLAY_MS + (manual ? MANUAL_PAUSE_MS : 0));
  }

  /** Closes every card and stops advancing, until the visitor opens one again. */
  collapse() {
    this.#collapsed = true;
    clearTimeout(this.#timer);
    this.#root.classList.remove('is-autoplaying');
    this.#markOpen(-1);
  }

  #markOpen(openIndex) {
    this.#cards.forEach((card, cardIndex) => {
      const open = cardIndex === openIndex;
      card.classList.toggle('is-open', open);
      card.querySelector('.job-header').setAttribute('aria-expanded', open);
    });
  }

  #scheduleNext(delay) {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.show(this.#currentIndex + 1), delay);
  }
}
