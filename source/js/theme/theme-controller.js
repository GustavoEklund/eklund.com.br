import { Environment } from '../shared/environment.js';
import { Preferences } from '../shared/storage.js';

const DEFAULT_HUE = 128;

/** Owns the color theme (dark/light) and the accent hue; notifies listeners when colors change. */
export class ThemeController {
  #root = document.documentElement;
  #themeColorMeta = document.querySelector('meta[name=theme-color]');
  #colors;
  #listeners = new Set();
  #transition = null;

  constructor(themeColors) {
    this.#colors = themeColors;
  }

  get theme() {
    return this.#root.dataset.theme === 'light' ? 'light' : 'dark';
  }

  get hue() {
    const hue = Number.parseFloat(this.#root.style.getPropertyValue('--hue'));
    return Number.isFinite(hue) ? hue : DEFAULT_HUE;
  }

  /** Resolves once the colors stop moving: after the view transition of a theme switch, at once when there is none. */
  get settled() {
    return this.#transition ? this.#transition.finished.catch(() => {}) : Promise.resolve();
  }

  /** Listener runs after the theme or the hue changes, once the new colors are computed. */
  onColorsChange(listener) {
    this.#listeners.add(listener);
  }

  apply(theme) {
    this.#root.dataset.theme = theme;
    Preferences.write('theme', theme);
    this.#themeColorMeta.content = this.#colors.backgroundAsCss();
    this.#notify();
  }

  toggle(pointerEvent) {
    const next = this.theme === 'light' ? 'dark' : 'light';
    if (!document.startViewTransition || Environment.prefersReducedMotion) return this.apply(next);
    const x = pointerEvent?.clientX ?? innerWidth / 2;
    const y = pointerEvent?.clientY ?? innerHeight / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const transition = document.startViewTransition(() => this.apply(next));
    this.#transition = transition;
    transition.finished
      .catch(() => {})
      .then(() => {
        if (this.#transition === transition) this.#transition = null;
      });
    transition.ready.then(() =>
      this.#root.animate(
        { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: 650,
          easing: 'cubic-bezier(.2,.8,.2,1)',
          pseudoElement: '::view-transition-new(root)',
        },
      ),
    );
  }

  setHue(hue) {
    this.#root.style.setProperty('--hue', hue);
    Preferences.write('hue', hue);
    requestAnimationFrame(() => this.#notify());
  }

  randomizeHue() {
    const hue = Math.round(Math.random() * 360);
    this.setHue(hue);
    return hue;
  }

  #notify() {
    for (const listener of this.#listeners) listener();
  }
}
