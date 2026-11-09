/**
 * The most rows the collector writes in a day (UTC). The free plan allows 100,000 written rows a day in D1, index entries
 * included. The rest is for the uptime monitor (under 3,000 a day), the lab job (a few hundred) and the retention, which
 * deletes at most what one day held: 40,000 + 40,000 + 3,000 leaves room under the quota.
 */
export class DailyCeiling {
  static ROWS = 40_000;

  #db;

  constructor(db) {
    this.#db = db;
  }

  /** Whether `rows` more still fit in `day`. */
  async allows(day, rows) {
    const written = await this.#db
      .prepare('SELECT rows FROM daily_writes WHERE day = ?1')
      .bind(day)
      .first('rows');
    return (written ?? 0) + rows <= DailyCeiling.ROWS;
  }

  /** The seconds from `now` to the next day in UTC, when the ceiling starts again. */
  static secondsLeft(now) {
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);
    return Math.ceil((next.getTime() - now) / 1_000);
  }
}
