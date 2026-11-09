import { ChangePoints } from './change-points.js';
import { Calendar } from './calendar.js';
import { MannWhitney } from './mann-whitney.js';
import { Retention } from './retention.js';
import { Sample } from './sample.js';

const DAY_MS = 86_400_000;
/** The columns of lab_run that a lab tool may read, by the name the tool gives them. */
const LAB_COLUMNS = {
  score: 'score',
  lcp: 'lcp_ms',
  fcp: 'fcp_ms',
  cls: 'cls',
  tbt: 'tbt_ms',
  speed_index: 'speed_index_ms',
  ttfb: 'ttfb_ms',
};
/** The columns of daily_view an overview ranks. Empty text is an unknown country, or a visit without a referrer. */
const DIMENSIONS = [
  'page',
  'language',
  'device',
  'browser',
  'country',
  'referrer',
  'version',
  'host',
];

/**
 * The readings of the MCP server and the JSON API: read-only queries on D1 for inputs that ReadingInputs has already checked.
 * Counts come from the daily totals, except for the days the retention still rewrites, which are counted from their rows so
 * that today and yesterday show up at once; percentiles and comparisons come from the visits' own rows, because percentiles
 * of days cannot be added up. Every answer says how large its sample is and whether it is enough to compare.
 */
export class ReadingQueries {
  /** A difference is called one when a test gives less than this. */
  static SIGNIFICANCE = 0.05;
  static TOP = 10;
  static LONG_TOP = 50;
  /**
   * The most values of a release a comparison reads, the latest first: plenty for the test, and a bound on its CPU, which the
   * free plan limits to 10 ms a request (2 × 2,000 values take about 2 ms).
   */
  static VALUES = 2_000;
  static LAB_COLUMNS = LAB_COLUMNS;

  #db;
  #clock;

  constructor({ db, clock = Date }) {
    this.#db = db;
    this.#clock = clock;
  }

  /** Answers one tool, by its name in ReadingInputs.TOOLS. */
  run(tool, input) {
    switch (tool) {
      case 'overview':
        return this.#overview(input);
      case 'vitals':
        return this.#vitals(input);
      case 'compare_vitals':
        return this.#compareVitals(input);
      case 'events':
        return this.#events(input);
      case 'errors':
        return this.#errors(input);
      case 'uptime':
        return this.#uptime(input);
      case 'lab':
        return this.#lab(input);
      case 'compare_lab':
        return this.#compareLab(input);
      case 'lab_change_points':
        return this.#labChangePoints(input);
      case 'crux':
        return this.#crux(input);
      case 'search':
        return this.#search(input);
      case 'certificates':
        return this.#certificates();
      default:
        throw new Error(`no reading is called ${tool}`);
    }
  }

  async #overview({ from, to }) {
    const where = `FROM ${this.#days('daily_view')}`;
    const [[totals], ...tops] = await this.#batch(
      [
        `SELECT coalesce(sum(views), 0) AS views, count(DISTINCT day) AS days ${where}`,
        ...DIMENSIONS.map(
          (column) =>
            `SELECT ${column} AS value, sum(views) AS views ${where}
             GROUP BY ${column} ORDER BY views DESC, value LIMIT ${ReadingQueries.TOP}`,
        ),
      ],
      from,
      to,
      this.#firstRecentDay(),
    );
    return {
      from,
      to,
      views: totals.views,
      days_with_views: totals.days,
      top: Object.fromEntries(DIMENSIONS.map((column, index) => [column, tops[index]])),
      sample: Sample.of(totals.views),
    };
  }

  async #vitals({ from, to, page = null, device = null, version = null }) {
    const rows = await this.#all(
      `SELECT name, count(*) AS loads, min(CASE WHEN rank >= 0.75 * total THEN value END) AS p75,
         sum(rating = 'good') AS good, sum(rating = 'needs-improvement') AS needs_improvement, sum(rating = 'poor') AS poor
       FROM (
         SELECT v.name, v.value, v.rating,
           row_number() OVER (PARTITION BY v.name ORDER BY v.value) AS rank,
           count(*) OVER (PARTITION BY v.name) AS total
         FROM vital v JOIN page_view p ON p.id = v.view_id
         WHERE p.day BETWEEN ?1 AND ?2 AND (?3 IS NULL OR p.page = ?3) AND (?4 IS NULL OR p.device = ?4)
           AND (?5 IS NULL OR p.version = ?5)
       )
       GROUP BY name ORDER BY name`,
      from,
      to,
      page,
      device,
      version,
    );
    return {
      from,
      to,
      page,
      device,
      version,
      metrics: rows.map(({ name, loads, p75, good, needs_improvement: middle, poor }) => ({
        metric: name,
        p75,
        good: ReadingQueries.#share(good, loads),
        needs_improvement: ReadingQueries.#share(middle, loads),
        poor: ReadingQueries.#share(poor, loads),
        sample: Sample.of(loads),
      })),
    };
  }

  async #compareVitals({ metric, before, after, page = null, device = null }) {
    const sql = `SELECT v.value FROM vital v JOIN page_view p ON p.id = v.view_id
       WHERE v.name = ?1 AND p.version = ?2 AND (?3 IS NULL OR p.page = ?3) AND (?4 IS NULL OR p.device = ?4)
       ORDER BY p.first_seen DESC LIMIT ${ReadingQueries.VALUES}`;
    const [first, second] = await this.#db.batch([
      this.#db.prepare(sql).bind(metric, before, page, device),
      this.#db.prepare(sql).bind(metric, after, page, device),
    ]);
    return {
      metric,
      page,
      device,
      ...ReadingQueries.#comparison(
        { name: before, values: first.results.map(({ value }) => value) },
        { name: after, values: second.results.map(({ value }) => value) },
        true,
      ),
    };
  }

  async #events({ from, to, page = null }) {
    const where = `FROM ${this.#days('daily_event')} WHERE ?4 IS NULL OR page = ?4`;
    const [[totals], events] = await this.#batch(
      [
        `SELECT coalesce(sum(total), 0) AS total ${where}`,
        `SELECT name, detail, sum(total) AS total ${where}
         GROUP BY name, detail ORDER BY total DESC, name, detail LIMIT ${ReadingQueries.LONG_TOP}`,
      ],
      from,
      to,
      this.#firstRecentDay(),
      page,
    );
    return { from, to, page, events, sample: Sample.of(totals.total) };
  }

  async #errors({ from, to, version = null }) {
    const where = `FROM ${this.#days('daily_error')} WHERE ?4 IS NULL OR version = ?4`;
    const [[totals], errors] = await this.#batch(
      [
        `SELECT coalesce(sum(total), 0) AS total ${where}`,
        `SELECT kind, source, message, sum(total) AS total ${where}
         GROUP BY kind, source, message ORDER BY total DESC, kind, source, message LIMIT ${ReadingQueries.LONG_TOP}`,
      ],
      from,
      to,
      this.#firstRecentDay(),
      version,
    );
    return { from, to, version, errors, sample: Sample.of(totals.total) };
  }

  async #uptime({ from, to }) {
    const [pages, now] = await this.#db.batch([
      this.#db
        .prepare(
          `SELECT target, count(*) AS days, sum(checks) AS checks, sum(failures) AS failures,
             CAST(round(avg(p50_ms)) AS INTEGER) AS typical_ms, max(p95_ms) AS worst_p95_ms
           FROM ${this.#days('daily_uptime')} GROUP BY target ORDER BY target`,
        )
        .bind(from, to, this.#firstRecentDay()),
      this.#db.prepare(
        'SELECT target, failures, failing_since, issue FROM uptime_target ORDER BY target',
      ),
    ]);
    const checks = pages.results.reduce((sum, page) => sum + page.checks, 0);
    return {
      from,
      to,
      pages: pages.results.map((page) => ({
        ...page,
        availability: ReadingQueries.#share(page.checks - page.failures, page.checks, 5),
      })),
      now: now.results.map(({ target, failures, failing_since: since, issue }) => ({
        target,
        failing: failures > 0,
        failures_in_a_row: failures,
        failing_since: since === null ? null : new Date(since).toISOString(),
        issue,
      })),
      sample: Sample.of(checks),
    };
  }

  async #lab({ from, to, page = null, form_factor: formFactor = null }) {
    const runs = await this.#all(
      `SELECT day, page, form_factor, score, lcp_ms, fcp_ms, cls, tbt_ms, speed_index_ms, ttfb_ms, report FROM lab_run
       WHERE median = 1 AND day BETWEEN ?1 AND ?2 AND (?3 IS NULL OR page = ?3) AND (?4 IS NULL OR form_factor = ?4)
       ORDER BY day, page, form_factor`,
      from,
      to,
      page,
      formFactor,
    );
    return {
      from,
      to,
      page,
      form_factor: formFactor,
      runs,
      sample: Sample.of(new Set(runs.map(({ day }) => day)).size, Sample.SERIES_MINIMUM),
    };
  }

  async #compareLab(input) {
    const { metric, page, form_factor: formFactor } = input;
    const sql = `SELECT ${LAB_COLUMNS[metric]} AS value FROM lab_run
       WHERE page = ?1 AND form_factor = ?2 AND day BETWEEN ?3 AND ?4`;
    const [first, second] = await this.#db.batch([
      this.#db.prepare(sql).bind(page, formFactor, input.before_from, input.before_to),
      this.#db.prepare(sql).bind(page, formFactor, input.after_from, input.after_to),
    ]);
    return {
      metric,
      page,
      form_factor: formFactor,
      ...ReadingQueries.#comparison(
        {
          name: `${input.before_from} to ${input.before_to}`,
          values: first.results.map(({ value }) => value),
        },
        {
          name: `${input.after_from} to ${input.after_to}`,
          values: second.results.map(({ value }) => value),
        },
        metric !== 'score',
      ),
    };
  }

  async #labChangePoints({ metric, page, form_factor: formFactor, from, to }) {
    const nights = await this.#all(
      `SELECT day, ${LAB_COLUMNS[metric]} AS value FROM lab_run
       WHERE median = 1 AND page = ?1 AND form_factor = ?2 AND day BETWEEN ?3 AND ?4 ORDER BY day`,
      page,
      formFactor,
      from,
      to,
    );
    const sample = Sample.of(nights.length, Sample.SERIES_MINIMUM);
    const points = sample.enough ? ChangePoints.find(nights.map(({ value }) => value)) : [];
    const edges = [0, ...points, nights.length];
    return {
      metric,
      page,
      form_factor: formFactor,
      from,
      to,
      segments: sample.enough
        ? edges.slice(1).map((end, index) => {
            const segment = nights.slice(edges[index], end);
            return {
              from: segment[0].day,
              to: segment.at(-1).day,
              nights: segment.length,
              mean: segment.reduce((sum, { value }) => sum + value, 0) / segment.length,
            };
          })
        : [],
      sample,
      verdict: sample.enough
        ? points.length
          ? `the level shifted ${points.length === 1 ? 'once' : `${points.length} times`}`
          : 'no shift in the level'
        : 'too few nights to look for a shift',
    };
  }

  async #crux({ scope = null, form_factor: formFactor = null }) {
    const readings = await this.#all(
      `SELECT day, scope, form_factor, metric, p75, good, needs_improvement, poor FROM crux_reading
       WHERE day = (SELECT max(day) FROM crux_reading) AND (?1 IS NULL OR scope = ?1) AND (?2 IS NULL OR form_factor = ?2)
       ORDER BY scope, form_factor, metric`,
      scope,
      formFactor,
    );
    return {
      day: readings[0]?.day ?? null,
      readings: readings.map(({ day: _day, ...reading }) => reading),
      sample: {
        ...Sample.of(readings.length, 1),
        note: 'CrUX gives no counts, and it reports only an origin or a page with enough Chrome visits in 28 days.',
      },
    };
  }

  async #search({ from, to, engine = null }) {
    const where = 'FROM search_row WHERE day BETWEEN ?1 AND ?2 AND (?3 IS NULL OR engine = ?3)';
    const [totals, queries, pages] = await this.#batch(
      [
        // Bing's totals of a day are its rows without a query; Google's are the sum of its rows.
        `SELECT engine, sum(clicks) AS clicks, sum(impressions) AS impressions ${where}
           AND (engine = 'google' OR query = '') GROUP BY engine ORDER BY engine`,
        `SELECT engine, query, sum(clicks) AS clicks, sum(impressions) AS impressions,
           round(sum(position * impressions) / sum(CASE WHEN position IS NOT NULL THEN impressions END), 1) AS position
         ${where} AND query <> ''
         GROUP BY engine, query ORDER BY clicks DESC, impressions DESC, query LIMIT ${ReadingQueries.LONG_TOP}`,
        `SELECT page, sum(clicks) AS clicks, sum(impressions) AS impressions ${where}
           AND engine = 'google' AND page <> ''
         GROUP BY page ORDER BY clicks DESC, impressions DESC, page LIMIT ${ReadingQueries.TOP}`,
      ],
      from,
      to,
      engine,
    );
    return {
      from,
      to,
      engine,
      totals,
      queries,
      pages,
      sample: Sample.of(totals.reduce((sum, { impressions }) => sum + impressions, 0)),
    };
  }

  async #certificates() {
    const now = this.#clock.now();
    const hosts = await this.#all(
      `SELECT day, host, valid_to, issuer, problem FROM certificate
       WHERE day = (SELECT max(day) FROM certificate) ORDER BY host`,
    );
    return {
      day: hosts[0]?.day ?? null,
      certificates: hosts.map(({ host, valid_to: validTo, issuer, problem }) => ({
        host,
        issuer,
        problem,
        valid_to: validTo === null ? null : new Date(validTo).toISOString(),
        days_left: validTo === null ? null : Math.floor((validTo - now) / DAY_MS),
      })),
      sample: Sample.of(hosts.length, 1),
    };
  }

  /**
   * The rows of a daily table from ?1 to ?2: its stored totals before the first recent day ?3, and from ?3 on the same totals
   * computed from the rows, so no day is counted twice.
   */
  #days(table) {
    const recent = Retention.totals((day) => `${day} BETWEEN ?1 AND ?2 AND ${day} >= ?3`)[table];
    return `(SELECT * FROM ${table} WHERE day BETWEEN ?1 AND ?2 AND day < ?3 UNION ALL ${recent})`;
  }

  #firstRecentDay() {
    return Retention.firstRecentDay(Calendar.day(new Date(this.#clock.now())));
  }

  /** Two groups compared: each one's size, median and 75th percentile, the test, and what it means. */
  static #comparison(before, after, lowerIsBetter) {
    const test = MannWhitney.test(before.values, after.values);
    const enough = before.values.length >= Sample.MINIMUM && after.values.length >= Sample.MINIMUM;
    // The test's effect is positive when the values before tend to be larger: after is lower.
    const lower = test.effect > 0;
    return {
      before: ReadingQueries.#group(before),
      after: ReadingQueries.#group(after),
      test,
      sample: {
        before: Sample.of(before.values.length),
        after: Sample.of(after.values.length),
        enough,
      },
      verdict: !enough
        ? 'too few values to compare'
        : test.p >= ReadingQueries.SIGNIFICANCE
          ? 'no clear difference'
          : lower === lowerIsBetter
            ? 'after is better'
            : 'after is worse',
    };
  }

  static #group({ name, values }) {
    const sorted = [...values].sort((a, b) => a - b);
    const rank = (share) => sorted[Math.max(Math.ceil(share * sorted.length) - 1, 0)] ?? null;
    return { name, values: sorted.length, median: rank(0.5), p75: rank(0.75) };
  }

  static #share(part, whole, digits = 4) {
    return whole ? Math.round((part / whole) * 10 ** digits) / 10 ** digits : null;
  }

  async #all(sql, ...values) {
    return (
      await this.#db
        .prepare(sql)
        .bind(...values)
        .all()
    ).results;
  }

  /** Several statements with the same values, in one round trip. */
  async #batch(statements, ...values) {
    return (
      await this.#db.batch(statements.map((sql) => this.#db.prepare(sql).bind(...values)))
    ).map(({ results }) => results);
  }
}
