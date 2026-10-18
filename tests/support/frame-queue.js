import { vi } from 'vitest';

/** Replaces requestAnimationFrame with a queue the test drains by hand, so frame-driven code runs one known frame at a time. */
export class FrameQueue {
  #callbacks = [];
  #spy = null;

  install() {
    this.#spy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      this.#callbacks.push(callback);
      return this.#callbacks.length;
    });
    return this;
  }

  get pending() {
    return this.#callbacks.length;
  }
  get requests() {
    return this.#spy.mock.calls.length;
  }

  /** Runs every callback queued so far with the given timestamp; callbacks they queue wait for the next call. */
  run(now) {
    const queued = this.#callbacks.splice(0);
    for (const callback of queued) callback(now);
    return queued.length;
  }

  restore() {
    this.#spy?.mockRestore();
    this.#spy = null;
    this.#callbacks = [];
  }
}
