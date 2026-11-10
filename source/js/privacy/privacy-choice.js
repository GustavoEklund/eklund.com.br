import { Preferences } from '../shared/storage.js';

const MONTHS_KEPT = 6;

/**
 * The visitor's privacy choice (0010): kept in the browser for six months with the version of the purposes, and asked again
 * when either runs out or changes. Anonymous measurement runs by legitimate interest until it is refused; recording and the
 * heat map run only with consent. Global Privacy Control counts as refusing everything, whatever was saved.
 *
 * The inline script in the head of index.html makes the same decision before the first paint, from the same stored value:
 * a choice counts while its version is VERSION and its expiry is in the future (tests/contract/head-script.contract.test.js
 * checks that both agree). Raising VERSION asks every visitor again.
 */
export class PrivacyChoice {
  static STORAGE_KEY = 'privacy';
  static VERSION = 1;

  #storage;
  #now;
  #globalPrivacyControl;
  #listeners = new Set();

  /**
   * @param {object} [options]
   * @param {{ read: Function, write: Function }} [options.storage]
   * @param {() => number} [options.now] the current time, in milliseconds
   * @param {boolean} [options.globalPrivacyControl] the browser sends the Global Privacy Control signal
   */
  constructor({
    storage = Preferences,
    now = () => Date.now(),
    globalPrivacyControl = false,
  } = {}) {
    this.#storage = storage;
    this.#now = now;
    this.#globalPrivacyControl = globalPrivacyControl === true;
  }

  /** The moment a choice made at `time` stops counting: six calendar months later. */
  static expiry(time) {
    const date = new Date(time);
    date.setMonth(date.getMonth() + MONTHS_KEPT);
    return date.getTime();
  }

  get globalPrivacyControl() {
    return this.#globalPrivacyControl;
  }

  /** Whether nothing needs to be asked: the browser refused through Global Privacy Control, or a current choice is saved. */
  get decided() {
    return this.#globalPrivacyControl || this.#saved() !== null;
  }

  /** Anonymous measurement: on until refused, by legitimate interest. */
  get measurementAllowed() {
    if (this.#globalPrivacyControl) return false;
    const saved = this.#saved();
    return saved === null || saved.measurement === true;
  }

  /** Session recording and the heat map: only with consent. */
  get recordingAllowed() {
    return !this.#globalPrivacyControl && this.#saved()?.recording === true;
  }

  save({ measurement, recording }) {
    this.#storage.write(
      PrivacyChoice.STORAGE_KEY,
      JSON.stringify({
        version: PrivacyChoice.VERSION,
        measurement: measurement === true,
        recording: recording === true,
        expires: PrivacyChoice.expiry(this.#now()),
      }),
    );
    const state = { measurement: this.measurementAllowed, recording: this.recordingAllowed };
    for (const listener of this.#listeners) listener(state);
  }

  acceptAll() {
    this.save({ measurement: true, recording: true });
  }

  refuseAll() {
    this.save({ measurement: false, recording: false });
  }

  /** Calls `listener({ measurement, recording })` after every save, and returns the function that stops it. */
  onChange(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** The saved choice while it counts, else null. */
  #saved() {
    let saved;
    try {
      saved = JSON.parse(this.#storage.read(PrivacyChoice.STORAGE_KEY));
    } catch {
      return null;
    }
    return saved !== null &&
      typeof saved === 'object' &&
      saved.version === PrivacyChoice.VERSION &&
      saved.expires > this.#now()
      ? saved
      : null;
  }
}
