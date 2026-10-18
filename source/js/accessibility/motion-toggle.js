import { Preferences } from '../shared/storage.js';

const STORAGE_KEY = 'motion';
const PAUSED = 'paused';
const FULL = 'full';

/**
 * The header button that pauses everything that moves or updates by itself (WCAG 2.2.2). The state lives on the
 * root element as data-motion, which the stylesheets and Environment read. Until the visitor chooses, it follows
 * the system "reduce motion" setting.
 */
export class MotionToggle {
  #root = document.documentElement;
  #button;
  #listeners = new Set();

  constructor({ button }) {
    this.#button = button;
  }

  get paused() {
    return this.#root.dataset.motion === PAUSED;
  }

  /** Listener runs after the state changes, with the new paused flag. */
  onChange(listener) {
    this.#listeners.add(listener);
  }

  mount() {
    this.#show(MotionToggle.#initialState());
    this.#button.addEventListener('click', () => this.set(!this.paused));
    return this;
  }

  set(paused) {
    Preferences.write(STORAGE_KEY, paused ? PAUSED : FULL);
    this.#show(paused);
    for (const listener of this.#listeners) listener(paused);
  }

  #show(paused) {
    this.#root.dataset.motion = paused ? PAUSED : FULL;
    this.#button.setAttribute('aria-pressed', String(paused));
  }

  static #initialState() {
    const saved = Preferences.read(STORAGE_KEY);
    return saved ? saved === PAUSED : matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
