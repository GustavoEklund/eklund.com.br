import { ReportText } from './report-text.js';

/** The limits of the collector (edge/src/page-report.js), which a contract test keeps equal. */
const LIMITS = {
  characters: 16_384,
  events: 100,
  errors: 20,
  sequence: 1_000,
  milliseconds: 86_400_000,
};
/** Events that say something only the first time in a load: the same detail again is not news. */
const ONCE = ['section', 'interact', 'hue'];

/**
 * What a page reports about one load of itself, sent as it goes on (seq grows). The identity of the load and its
 * device go in every report, as the collector asks; each metric goes with its latest value; events and errors go once, in
 * the first report after they happen, at most as many as the collector takes. Errors repeat at most once a load.
 */
export class LoadReport {
  static LIMITS = LIMITS;

  #identity;
  #startedAt;
  #seq = 0;
  #vitals = new Map();
  #vitalsChanged = false;
  #events = [];
  #seen = new Set();
  #errors = [];
  #errorKeys = new Set();
  #visibleMs = 0;
  #visibleSince = null;
  #sentVisibleMs = -1;

  /**
   * @param {object} load
   * @param {string} load.view a random UUID made for this load
   * @param {string} load.version @param {string} load.page @param {string} load.language @param {string} load.referrer
   * @param {string} load.navigation @param {object} load.device
   * @param {number} load.startedAt when the load started, on the clock of `now` in the other methods
   * @param {boolean} load.visible whether the page is visible at that moment
   */
  constructor({ view, version, page, language, referrer, navigation, device, startedAt, visible }) {
    this.#identity = { v: 1, view, version, page, language, referrer, navigation, device };
    this.#startedAt = startedAt;
    if (visible) this.#visibleSince = startedAt;
  }

  setVital(summary) {
    if (!summary) return;
    this.#vitals.set(summary.name, summary);
    this.#vitalsChanged = true;
  }

  addEvent({ name, detail = '', value }, now) {
    const key = `${name}|${detail}`;
    if (ONCE.includes(name) && this.#seen.has(key)) return;
    this.#seen.add(key);
    if (this.#events.length >= LIMITS.events) return;
    this.#events.push({
      name,
      detail,
      ...(value === undefined ? {} : { value: ReportText.number(value, LIMITS.milliseconds) ?? 0 }),
      at: this.#at(now),
    });
  }

  addError(error, now) {
    const key = [error.kind, error.message, error.source, error.line, error.column].join('|');
    if (this.#errorKeys.has(key) || this.#errorKeys.size >= LIMITS.errors) return;
    this.#errorKeys.add(key);
    this.#errors.push({ ...error, at: this.#at(now) });
  }

  show(now) {
    this.#visibleSince ??= now;
  }

  hide(now) {
    if (this.#visibleSince === null) return;
    this.#visibleMs += now - this.#visibleSince;
    this.#visibleSince = null;
  }

  /** The next report as the text to send, or null when there is nothing new or the load has sent all it may. */
  next(now) {
    const visible = this.#visible(now);
    const news =
      this.#seq === 0 ||
      this.#vitalsChanged ||
      this.#events.length > 0 ||
      this.#errors.length > 0 ||
      visible > this.#sentVisibleMs;
    if (!news || this.#seq > LIMITS.sequence) return null;
    let events = this.#events.length;
    let errors = this.#errors.length;
    let text = this.#text(visible, events, errors);
    while (text.length > LIMITS.characters && events + errors > 0) {
      if (errors > 0) errors = Math.floor(errors / 2);
      else events = Math.floor(events / 2);
      text = this.#text(visible, events, errors);
    }
    this.#seq += 1;
    this.#events = this.#events.slice(events);
    this.#errors = this.#errors.slice(errors);
    this.#vitalsChanged = false;
    this.#sentVisibleMs = visible;
    return text;
  }

  #text(visible, events, errors) {
    return JSON.stringify({
      ...this.#identity,
      seq: this.#seq,
      visible,
      vitals: [...this.#vitals.values()],
      events: this.#events.slice(0, events),
      errors: this.#errors.slice(0, errors),
    });
  }

  #visible(now) {
    const running = this.#visibleSince === null ? 0 : now - this.#visibleSince;
    return ReportText.integer(this.#visibleMs + running, LIMITS.milliseconds);
  }

  #at(now) {
    return ReportText.integer(now - this.#startedAt, LIMITS.milliseconds);
  }
}
