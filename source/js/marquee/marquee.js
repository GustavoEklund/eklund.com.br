import { Dom } from '../shared/dom.js';
import { Numbers } from '../shared/math.js';
import { Environment } from '../shared/environment.js';

const LOOP_MS = 30000;
const HOVER_RATE = 0.12;
const MAX_SKEW_DEG = 14;

/** Two counter-scrolling rows whose speed and skew follow the page scroll; draggable with inertia. */
export class Marquee {
  #element;
  #forward = [];
  #backward = [];
  #scrollVelocity = 0;
  #lastScrollY = scrollY;
  #rate = 1;
  #fling = 0;
  #hovering = false;
  #lastSkew = null;
  #drag = null;
  #frameRequested = false;

  constructor(element) {
    this.#element = element;
  }

  /** The rows are always built, and held still while motion is off, so that playing again has something to play. */
  start() {
    this.#forward = this.#animateRow('.marquee-row-solid .marquee-track', false);
    this.#backward = this.#animateRow('.marquee-row-outline .marquee-track', true);
    if (Environment.prefersReducedMotion) this.#pauseRows();
    addEventListener(
      'scroll',
      () => {
        this.#scrollVelocity += scrollY - this.#lastScrollY;
        this.#lastScrollY = scrollY;
      },
      { passive: true },
    );
    const element = this.#element;
    element.addEventListener('pointerenter', () => {
      this.#hovering = true;
    });
    element.addEventListener('pointerleave', () => {
      this.#hovering = false;
    });
    element.addEventListener('pointerdown', (event) => this.#beginDrag(event));
    element.addEventListener('pointermove', (event) => this.#drag && this.#dragTo(event));
    element.addEventListener('pointerup', () => this.#endDrag());
    element.addEventListener('pointercancel', () => this.#endDrag());
    this.#requestFrame();
  }

  /** Pauses both rows while motion is off and sets them going again when it is back on. */
  sync() {
    if (!this.#animations.length) return; // not started yet
    if (Environment.prefersReducedMotion) {
      this.#pauseRows();
      return;
    }
    for (const animation of this.#animations) animation.play();
    this.#requestFrame();
  }

  #pauseRows() {
    for (const animation of this.#animations) animation.pause();
  }

  #requestFrame() {
    if (this.#frameRequested) return;
    this.#frameRequested = true;
    requestAnimationFrame(this.#animate);
  }

  get #animations() {
    return [...this.#forward, ...this.#backward];
  }

  #animateRow(selector, reversed) {
    const keyframes = reversed
      ? [{ transform: 'translateX(-100%)' }, { transform: 'translateX(0)' }]
      : [{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }];
    return Dom.queryAll(selector, this.#element).map((track) =>
      track.animate(keyframes, { duration: LOOP_MS, iterations: Infinity }),
    );
  }

  #beginDrag(event) {
    if (Environment.prefersReducedMotion) return; // held still while motion is off
    this.#drag = { x: event.clientX, velocity: 0 };
    this.#fling = 0;
    this.#element.classList.add('is-dragging');
    this.#element.setPointerCapture(event.pointerId);
  }

  #dragTo(event) {
    const dx = event.clientX - this.#drag.x;
    this.#drag.x = event.clientX;
    this.#drag.velocity = dx;
    const shiftMs = (LOOP_MS * dx) / this.#element.querySelector('.marquee-track').offsetWidth;
    const shift = (animation, direction) => {
      animation.currentTime =
        (((animation.currentTime - direction * shiftMs) % LOOP_MS) + LOOP_MS) % LOOP_MS;
    };
    this.#forward.forEach((animation) => shift(animation, 1));
    this.#backward.forEach((animation) => shift(animation, -1));
    this.#element.style.setProperty(
      '--skew',
      `${Numbers.clamp(-dx * 0.6, -MAX_SKEW_DEG, MAX_SKEW_DEG)}deg`,
    );
  }

  #endDrag() {
    if (!this.#drag) return;
    this.#fling = Numbers.clamp(-this.#drag.velocity * 0.45, -8, 8);
    this.#drag = null;
    this.#element.classList.remove('is-dragging');
  }

  #animate = () => {
    this.#frameRequested = false;
    if (Environment.prefersReducedMotion) return; // sync() starts the loop again
    const targetRate = this.#drag
      ? 0
      : Numbers.clamp(
          (this.#hovering ? HOVER_RATE : 1) + this.#scrollVelocity * 0.06 + this.#fling,
          -8,
          8,
        );
    const nextRate = Numbers.lerp(this.#rate, targetRate, 0.08);
    this.#scrollVelocity *= 0.85;
    this.#fling *= 0.94;
    if (Math.abs(nextRate - this.#rate) > 0.002) {
      this.#rate = nextRate;
      for (const animation of this.#animations) animation.playbackRate = nextRate;
    }
    const skew =
      Math.round(Numbers.clamp(-this.#scrollVelocity * 0.12, -MAX_SKEW_DEG, MAX_SKEW_DEG) * 10) /
      10;
    if (!this.#drag && skew !== this.#lastSkew) {
      this.#lastSkew = skew;
      this.#element.style.setProperty('--skew', `${skew}deg`);
    }
    this.#requestFrame();
  };
}
