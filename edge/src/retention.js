import { Calendar } from './calendar.js';

/**
 * Once a day: the daily totals of the last three days, which late reports can still change, then the deletion of every row
 * past its retention (docs/decisions/0010-privacy-by-the-anpd-guidance.md). The checks of the uptime monitor follow the
 * retention of errors.
 */
export class Retention {
  static RECENT_DAYS = 3;
  static ROW_MONTHS = 13;
  /** Errors and the checks of the uptime monitor. */
  static ERROR_DAYS = 90;
  static TOTAL_MONTHS = 25;

  #db;

  constructor(db) {
    this.#db = db;
  }

  /**
   * The first day whose totals the next run still rewrites: from it on, a total is a snapshot that late reports can change,
   * so a reading counts those days from their rows.
   */
  static firstRecentDay(today) {
    return Calendar.daysBefore(today, Retention.RECENT_DAYS - 1);
  }

  /**
   * The totals of the days that `where` picks, one row per day and value of each table, as SELECTs: the run writes them into
   * the daily tables, and a reading computes them for the recent days. `where` takes the column of the day.
   */
  static totals(where) {
    return {
      // Empty text stands for an unknown country, a visit without a referrer and an event without detail.
      daily_view: `SELECT day, host, page, version, language, device, browser, coalesce(country, '') AS country,
         coalesce(referrer, '') AS referrer, count(*) AS views, sum(visible_ms) AS visible_ms
       FROM page_view WHERE ${where('day')}
       GROUP BY day, host, page, version, language, device, browser, country, referrer`,
      // The nearest-rank percentile: the smallest value whose rank reaches that share of the count.
      daily_vital: `SELECT day, page, version, device, name, count(*) AS total,
         min(CASE WHEN rank >= 0.50 * total THEN value END) AS p50,
         min(CASE WHEN rank >= 0.75 * total THEN value END) AS p75,
         min(CASE WHEN rank >= 0.95 * total THEN value END) AS p95,
         sum(rating = 'good') AS good, sum(rating = 'needs-improvement') AS needs_improvement, sum(rating = 'poor') AS poor
       FROM (
         SELECT p.day, p.page, p.version, p.device, v.name, v.value, v.rating,
           row_number() OVER ranking AS rank,
           count(*) OVER (PARTITION BY p.day, p.page, p.version, p.device, v.name) AS total
         FROM vital v JOIN page_view p ON p.id = v.view_id
         WHERE ${where('p.day')}
         WINDOW ranking AS (PARTITION BY p.day, p.page, p.version, p.device, v.name ORDER BY v.value)
       )
       GROUP BY day, page, version, device, name`,
      daily_event: `SELECT p.day AS day, p.page AS page, p.version AS version, e.name AS name,
         coalesce(e.detail, '') AS detail, count(*) AS total
       FROM event e JOIN page_view p ON p.id = e.view_id
       WHERE ${where('p.day')}
       GROUP BY p.day, p.page, p.version, e.name, e.detail`,
      daily_uptime: `SELECT day, target, count(*) AS checks, sum(problem IS NOT NULL) AS failures,
         min(CASE WHEN rank >= 0.50 * total THEN duration_ms END) AS p50_ms,
         min(CASE WHEN rank >= 0.95 * total THEN duration_ms END) AS p95_ms
       FROM (
         SELECT day, target, problem, duration_ms,
           row_number() OVER (PARTITION BY day, target ORDER BY duration_ms) AS rank,
           count(*) OVER (PARTITION BY day, target) AS total
         FROM uptime_check WHERE ${where('day')}
       )
       GROUP BY day, target`,
      daily_error: `SELECT p.day AS day, p.version AS version, e.kind AS kind, e.source AS source, e.message AS message,
         count(*) AS total
       FROM error e JOIN page_view p ON p.id = e.view_id
       WHERE ${where('p.day')}
       GROUP BY p.day, p.version, e.kind, e.source, e.message`,
    };
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

  /** The totals of one day, written over the ones an earlier run left. */
  #totals(day) {
    return Object.entries(Retention.totals((column) => `${column} = ?1`)).map(([table, select]) =>
      this.#db.prepare(`INSERT OR REPLACE INTO ${table} ${select}`).bind(day),
    );
  }

  #deletions({ rows, errors, totals }) {
    const older = (table) =>
      `DELETE FROM ${table} WHERE view_id IN (SELECT id FROM page_view WHERE day < ?1)`;
    return [
      this.#db.prepare(older('error')).bind(errors),
      this.#db.prepare(older('vital')).bind(rows),
      this.#db.prepare(older('event')).bind(rows),
      this.#db.prepare('DELETE FROM page_view WHERE day < ?1').bind(rows),
      this.#db.prepare('DELETE FROM uptime_check WHERE day < ?1').bind(errors),
      ...['daily_view', 'daily_vital', 'daily_event', 'daily_error', 'daily_uptime'].map((table) =>
        this.#db.prepare(`DELETE FROM ${table} WHERE day < ?1`).bind(totals),
      ),
    ];
  }
}
