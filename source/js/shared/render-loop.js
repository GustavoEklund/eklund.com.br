import { Dom } from './dom.js';

/**
 * requestAnimationFrame loop that only runs while its element is on screen and
 * the tab is visible and `shouldRun` agrees. The callback receives (nowMs, deltaSeconds).
 */
export class RenderLoop {
  #onFrame;
  #maxDelta;
  #shouldRun;
  #visible = false;
  #running = false;
  #lastTime = 0;

  constructor(
    element,
    onFrame,
    { threshold = 0, maxDelta = 0.05, observe = true, shouldRun = () => true } = {},
  ) {
    this.#onFrame = onFrame;
    this.#maxDelta = maxDelta;
    this.#shouldRun = shouldRun;
    if (observe) {
      Dom.observeVisibility(
        element,
        (visible) => {
          this.#visible = visible;
          if (visible) this.start();
        },
        threshold,
      );
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.#visible) this.start();
      });
    } else {
      this.#visible = true;
    }
  }

  get isRunning() {
    return this.#running;
  }

  start() {
    if (this.#running) return;
    this.#running = true;
    this.#lastTime = performance.now();
    requestAnimationFrame(this.#frame);
  }

  renderOnce() {
    if (!this.#running) this.#onFrame(performance.now(), 0);
  }

  #frame = (now) => {
    this.#running = this.#visible && !document.hidden && this.#shouldRun();
    if (!this.#running) return;
    requestAnimationFrame(this.#frame);
    const delta = Math.min(this.#maxDelta, (now - this.#lastTime) / 1000 || 0);
    this.#lastTime = now;
    this.#onFrame(now, delta);
  };
}
