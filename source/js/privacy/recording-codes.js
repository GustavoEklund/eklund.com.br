import { Preferences } from '../shared/storage.js';

/** A code is kept as long as its recording: 30 days. */
const DAYS_KEPT = 30;
const DAY_MS = 86_400_000;
/** The most codes the collector deletes in one request. */
const CODES_PER_REQUEST = 50;
const CODE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * The codes of this browser's recordings (0010): each recording has a random code, kept here for 30 days, as long as the
 * collector keeps the recording, so that withdrawing consent or "Delete my recordings" can ask the collector to delete them
 * at once. They stay in localStorage under `recordings`, are sent only in that request, and nothing else links them to the
 * visitor. A code past its 30 days is dropped the next time the list is read.
 */
export class RecordingCodes {
  static STORAGE_KEY = 'recordings';
  static DAYS_KEPT = DAYS_KEPT;
  static CODES_PER_REQUEST = CODES_PER_REQUEST;

  #address;
  #storage;
  #now;
  #fetch;

  /**
   * @param {object} options
   * @param {string|null} options.address where the request to delete goes, or null where the page sends nothing
   * @param {{ read: Function, write: Function }} [options.storage]
   * @param {() => number} [options.now] the current time, in milliseconds
   * @param {Function} [options.fetch]
   */
  constructor({
    address,
    storage = Preferences,
    now = () => Date.now(),
    fetch = (resource, init) => globalThis.fetch(resource, init),
  }) {
    this.#address = address;
    this.#storage = storage;
    this.#now = now;
    this.#fetch = fetch;
  }

  /** The codes kept now, the oldest first. */
  get codes() {
    return this.#kept().map(({ code }) => code);
  }

  /** Whether this browser keeps the code of any recording. */
  held() {
    return this.#kept().length > 0;
  }

  /** Keeps the code of a new recording for 30 days. */
  add(code) {
    this.#write([...this.#kept(), { code, expires: this.#now() + DAYS_KEPT * DAY_MS }]);
  }

  /**
   * Asks the collector to delete every recording this browser keeps a code of, in requests of at most 50 codes, and forgets
   * each code once its request is answered. Rejects when a request fails, keeping the codes it could not delete, so the
   * visitor can try again. Where the page sends nothing, nothing was recorded either, and the codes are just forgotten.
   */
  async deleteAll() {
    let kept = this.#kept();
    if (kept.length === 0) return;
    if (!this.#address) kept = [];
    while (kept.length > 0) {
      const batch = kept.slice(0, CODES_PER_REQUEST);
      const response = await this.#fetch(this.#address, {
        method: 'POST',
        body: JSON.stringify({ v: 1, codes: batch.map(({ code }) => code) }),
        keepalive: true,
        mode: 'cors',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw new Error(`the collector answered ${response.status}`);
      kept = kept.slice(batch.length);
      this.#write(kept);
    }
    this.#write(kept);
  }

  /**
   * The codes still within their 30 days. A stored value that is not a list of them counts as none, and what ran out or is not
   * a code is dropped from storage as it is read.
   */
  #kept() {
    let stored;
    try {
      stored = JSON.parse(this.#storage.read(RecordingCodes.STORAGE_KEY));
    } catch {
      return [];
    }
    if (!Array.isArray(stored)) return [];
    const now = this.#now();
    const kept = stored.filter(
      (entry) =>
        typeof entry?.code === 'string' &&
        CODE.test(entry.code) &&
        typeof entry.expires === 'number' &&
        entry.expires > now,
    );
    if (kept.length !== stored.length) this.#write(kept);
    return kept;
  }

  #write(kept) {
    this.#storage.write(RecordingCodes.STORAGE_KEY, JSON.stringify(kept));
  }
}
