import { Calendar } from './calendar.js';

/**
 * Once a day: the daily totals of the last three days, which late reports can still change, then the deletion of every row
 * past its retention (docs/decisions/0010-privacy-by-the-anpd-guidance.md).
 */
export class Retention {
  static RECENT_DAYS = 3;
  static ROW_MONTHS = 13;
  static ERROR_DAYS = 90;
  static TOTAL_MONTHS = 25;

  #db;

  constructor(db) {
    this.#db = db;
  }

  async run(now) {
    const today = Calendar.day(now);
    const recent = Array.from({ length: Retention.RECENT_DAYS }, (_, back) =>
      Calendar.daysBefore(today, back),
    );
    await this.#db.batch(recent.flatMap((day) => this.#totals(day)));
    await this.#db.batch(
      this.#deletions({
        rows: Calendar.monthsBefore(today, Retention.ROW_MONTHS),
        errors: Calendar.daysBefore(today, Retention.ERROR_DAYS),
        totals: Calendar.monthsBefore(today, Retention.TOTAL_MONTHS),
      }),
    );
  }

  /** The totals of one day. Empty text stands for an unknown country, a visit without a referrer and an event without detail. */
  #totals(day) {
    return [
      `INSERT OR REPLACE INTO daily_view (day, host, page, version, language, device, browser, country, referrer, views,
         visible_ms)
       SELECT day, host, page, version, language, device, browser, coalesce(country, ''), coalesce(referrer, ''),
         count(*), sum(visible_ms)
       FROM page_view WHERE day = ?1
       GROUP BY day, host, page, version, language, device, browser, country, referrer`,
      // The nearest-rank percentile: the smallest value whose rank reaches that share of the count.
      `INSERT OR REPLACE INTO daily_vital (day, page, version, device, name, total, p50, p75, p95, good,
         needs_improvement, poor)
       SELECT day, page, version, device, name, count(*),
         min(CASE WHEN rank >= 0.50 * total THEN value END),
         min(CASE WHEN rank >= 0.75 * total THEN value END),
         min(CASE WHEN rank >= 0.95 * total THEN value END),
         sum(rating = 'good'), sum(rating = 'needs-improvement'), sum(rating = 'poor')
       FROM (
         SELECT p.day, p.page, p.version, p.device, v.name, v.value, v.rating,
           row_number() OVER ranking AS rank,
           count(*) OVER (PARTITION BY p.day, p.page, p.version, p.device, v.name) AS total
         FROM vital v JOIN page_view p ON p.id = v.view_id
         WHERE p.day = ?1
         WINDOW ranking AS (PARTITION BY p.day, p.page, p.version, p.device, v.name ORDER BY v.value)
       )
       GROUP BY day, page, version, device, name`,
      `INSERT OR REPLACE INTO daily_event (day, page, version, name, detail, total)
       SELECT p.day, p.page, p.version, e.name, coalesce(e.detail, ''), count(*)
       FROM event e JOIN page_view p ON p.id = e.view_id
       WHERE p.day = ?1
       GROUP BY p.day, p.page, p.version, e.name, e.detail`,
      `INSERT OR REPLACE INTO daily_error (day, version, kind, source, message, total)
       SELECT p.day, p.version, e.kind, e.source, e.message, count(*)
       FROM error e JOIN page_view p ON p.id = e.view_id
       WHERE p.day = ?1
       GROUP BY p.day, p.version, e.kind, e.source, e.message`,
    ].map((sql) => this.#db.prepare(sql).bind(day));
  }

  #deletions({ rows, errors, totals }) {
    const older = (table) =>
      `DELETE FROM ${table} WHERE view_id IN (SELECT id FROM page_view WHERE day < ?1)`;
    return [
      this.#db.prepare(older('error')).bind(errors),
      this.#db.prepare(older('vital')).bind(rows),
      this.#db.prepare(older('event')).bind(rows),
      this.#db.prepare('DELETE FROM page_view WHERE day < ?1').bind(rows),
      ...['daily_view', 'daily_vital', 'daily_event', 'daily_error'].map((table) =>
        this.#db.prepare(`DELETE FROM ${table} WHERE day < ?1`).bind(totals),
      ),
    ];
  }
}
