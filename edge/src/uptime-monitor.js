import { Calendar } from './calendar.js';

/** The release a page was built from, as the build writes it on the root element. */
const VERSION = /<html[^>]*\sdata-version="(\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[0-9a-z.]{1,20})?)"/;

/**
 * Checks the site every five minutes from the Cron Trigger. A page is up when it answers 200 with HTML and with the headers
 * that keep it safe. Each check is stored, and the issues tell the owner when a page goes down and when it comes back.
 */
export class UptimeMonitor {
  static TIMEOUT_MS = 15_000;
  /** Two failed checks in a row, ten minutes, before anyone is told: one slow answer is not an outage. */
  static FAILURES_BEFORE_ALERT = 2;

  #db;
  #fetch;
  #issues;
  #clock;

  constructor({ db, fetch, issues, clock = Date }) {
    this.#db = db;
    this.#fetch = fetch;
    this.#issues = issues;
    this.#clock = clock;
  }

  /** Checks every target, and the folder of the release the first one says it was built from. */
  async run(targets) {
    const [home, ...rest] = await Promise.all(targets.map((target) => this.#check(target)));
    const version = VERSION.exec(home.html)?.[1];
    const checks = [
      home,
      ...rest,
      ...(version ? [await this.#check(new URL(`/${version}/`, home.target).href)] : []),
    ];
    await this.#db.batch(
      checks.map((check) =>
        this.#db
          .prepare(
            'INSERT INTO uptime_check (checked_at, day, target, status, duration_ms, problem) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
          )
          .bind(
            check.checkedAt,
            Calendar.day(new Date(check.checkedAt)),
            check.target,
            check.status,
            check.durationMs,
            check.problem,
          ),
      ),
    );
    for (const check of checks) await this.#follow(check);
  }

  async #check(target) {
    const checkedAt = this.#clock.now();
    try {
      const response = await this.#fetch(target, {
        redirect: 'manual',
        signal: AbortSignal.timeout(UptimeMonitor.TIMEOUT_MS),
        headers: {
          'user-agent': 'eklund-uptime (+https://github.com/GustavoEklund/eklund.com.br)',
        },
      });
      const html = response.status === 200 ? await response.text() : '';
      return {
        target,
        checkedAt,
        status: response.status,
        durationMs: this.#clock.now() - checkedAt,
        problem: UptimeMonitor.#problemOf(response),
        html,
      };
    } catch (error) {
      return {
        target,
        checkedAt,
        status: null,
        durationMs: this.#clock.now() - checkedAt,
        problem:
          error?.name === 'TimeoutError'
            ? `no answer in ${UptimeMonitor.TIMEOUT_MS / 1_000} s`
            : 'the connection failed',
        html: '',
      };
    }
  }

  static #problemOf(response) {
    const header = (name) => response.headers.get(name) ?? '';
    if (response.status !== 200) return `status ${response.status}`;
    if (!header('content-type').startsWith('text/html')) return 'the answer is not HTML';
    if (!header('content-security-policy').includes("default-src 'self'"))
      return 'no Content-Security-Policy';
    if (!header('strict-transport-security')) return 'no Strict-Transport-Security';
    return null;
  }

  /** Counts the failures in a row of a target, opens an issue at the second and closes it once the page is back. */
  async #follow(check) {
    const state = (await this.#db
      .prepare('SELECT failures, failing_since, issue FROM uptime_target WHERE target = ?1')
      .bind(check.target)
      .first()) ?? { failures: 0, failing_since: null, issue: null };
    let { failures, failing_since: since, issue } = state;
    if (check.problem === null) {
      if (issue !== null && this.#issues.enabled)
        await this.#issues.close({ issue, target: check.target, since, until: check.checkedAt });
      [failures, since, issue] = [0, null, null];
    } else {
      failures += 1;
      since ??= check.checkedAt;
      if (failures >= UptimeMonitor.FAILURES_BEFORE_ALERT && issue === null && this.#issues.enabled)
        issue = await this.#issues.open({ target: check.target, problem: check.problem, since });
    }
    await this.#db
      .prepare(
        `INSERT INTO uptime_target (target, failures, failing_since, issue) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (target) DO UPDATE SET
           failures = excluded.failures, failing_since = excluded.failing_since, issue = excluded.issue`,
      )
      .bind(check.target, failures, since, issue)
      .run();
  }
}
