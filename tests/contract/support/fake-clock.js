import { vi } from 'vitest';

/** performance.now() that moves exactly one millisecond per call, so warm-up and tick budgets give the same counts on every machine. */
export class FakeClock {
  static #now = 0;
  static #spy = null;

  static install() {
    FakeClock.#now = 0;
    FakeClock.#spy = vi.spyOn(performance, 'now').mockImplementation(() => FakeClock.#now++);
  }

  static restore() {
    FakeClock.#spy?.mockRestore();
    FakeClock.#spy = null;
  }
}
