const SETTLE_MS = 60;
const HOLD_MS = 2500;

/**
 * One polite live region for news that has no element of its own on screen (WCAG 4.1.3 status messages). Messages
 * take turns: each one stays for a while before the next replaces it, because a screen reader that is still
 * reading drops a message that is overwritten.
 */
export class LiveAnnouncer {
  #region;
  #queue = [];
  #busy = false;

  constructor(region) {
    this.#region = region;
  }

  /** `topic` marks news that goes stale, such as a count of results: a newer message on the same topic replaces one that is still waiting. */
  announce(message, topic) {
    const waiting =
      topic === undefined ? -1 : this.#queue.findIndex((entry) => entry.topic === topic);
    if (waiting >= 0) this.#queue[waiting] = { message, topic };
    else this.#queue.push({ message, topic });
    if (!this.#busy) this.#next();
  }

  /** Empties the region first, so a screen reader notices the change even when the message repeats. */
  #next() {
    const entry = this.#queue.shift();
    this.#busy = entry !== undefined;
    if (!entry) return;
    this.#region.textContent = '';
    setTimeout(() => {
      this.#region.textContent = entry.message;
      setTimeout(() => this.#next(), HOLD_MS);
    }, SETTLE_MS);
  }
}
