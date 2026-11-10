import { Calendar } from '../src/calendar.js';
import { ReadingInputs } from '../src/reading-inputs.js';

/**
 * What a page of the panel was asked for in its query string: the period, the last 28 days through today unless `from`
 * and `to` say otherwise, and the filters of a reading, checked by the same schemas as the MCP tools and the JSON API.
 * Parameters a reading does not take are left out, and the first of a repeated one counts.
 */
export class PanelQuery {
  static DAYS = 28;

  #params;
  #today;

  constructor(url, clock = Date) {
    this.#params = url.searchParams;
    this.#today = Calendar.day(new Date(clock.now()));
  }

  get today() {
    return this.#today;
  }

  /** A parameter as given, or empty text. */
  value(name) {
    return this.#params.get(name) ?? '';
  }

  /** The period asked for, as given, before any check. */
  period() {
    return {
      from: this.value('from') || Calendar.daysBefore(this.#today, PanelQuery.DAYS - 1),
      to: this.value('to') || this.#today,
    };
  }

  /**
   * The input of a reading: the period unless `period` is false, and each of `names` that has a value. `{ ok: true, input }`
   * or `{ ok: false, reason }`.
   */
  input(reading, names = [], { period = true } = {}) {
    const raw = period ? this.period() : {};
    for (const name of names) if (this.value(name)) raw[name] = this.value(name);
    return ReadingInputs.parse(reading, raw);
  }
}
