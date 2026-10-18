import { vi } from 'vitest';

/**
 * Records every listener a class registers on window or document during a test, so the test can
 * remove them afterwards. Classes install listeners for the life of the page; tests must not leak them.
 */
export class WindowListeners {
  #added = [];
  #spies = [];

  track() {
    for (const target of [window, document]) {
      const original = target.addEventListener.bind(target);
      this.#spies.push(
        vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
          this.#added.push([target, type, listener, options]);
          original(type, listener, options);
        }),
      );
    }
    return this;
  }

  get registered() {
    return this.#added.map(([, type]) => type);
  }

  release() {
    for (const spy of this.#spies) spy.mockRestore();
    for (const [target, type, listener, options] of this.#added)
      target.removeEventListener(type, listener, options);
    this.#added = [];
    this.#spies = [];
  }
}
