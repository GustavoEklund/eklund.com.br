import { Calendar } from './calendar.js';
import { DailyCeiling } from './daily-ceiling.js';
import { PageReport } from './page-report.js';
import { Replies } from './replies.js';
import { ReportStore } from './report-store.js';
import { SendLimit } from './send-limit.js';
import { VisitorAgent } from './visitor-agent.js';

/**
 * Takes the reports of the site's pages: from one of its origins, from a browser and not under Global Privacy Control, and
 * whole. A robot or a visitor who sent GPC gets the same answer as anyone else, and nothing of theirs is stored. A client
 * past its share of the minute, or a report past the day's ceiling of rows, gets 429 and nothing is stored either.
 */
export class Collector {
  #origins;
  #store;
  #limit;
  #ceiling;
  #clock;

  constructor({ origins, store, limit, ceiling, clock = Date }) {
    this.#origins = origins;
    this.#store = store;
    this.#limit = limit;
    this.#ceiling = ceiling;
    this.#clock = clock;
  }

  async take(request) {
    const origin = request.headers.get('origin') ?? '';
    if (!this.#origins.includes(origin)) return Replies.forbidden();
    if (Number(request.headers.get('content-length') ?? 0) > PageReport.LIMITS.characters)
      return Replies.tooLarge(origin);
    if (!(await this.#limit.allows(request)))
      return Replies.tooMany(origin, SendLimit.RETRY_AFTER_SECONDS);
    const agent = VisitorAgent.of(
      request.headers.get('user-agent') ?? '',
      request.headers.get('sec-ch-ua-mobile'),
    );
    if (request.headers.get('sec-gpc') === '1' || agent.robot) return Replies.accepted(origin);
    const parsed = PageReport.parse(await request.text());
    if (!parsed.ok) return Replies.refused(origin, parsed.reason);
    const receivedAt = this.#clock.now();
    const day = Calendar.day(new Date(receivedAt));
    if (!(await this.#ceiling.allows(day, ReportStore.rowsOf(parsed.report))))
      return Replies.tooMany(origin, DailyCeiling.secondsLeft(receivedAt));
    await this.#store.save(parsed.report, {
      receivedAt,
      day,
      host: new URL(origin).hostname,
      country: Collector.#country(request.cf?.country),
      agent,
    });
    return Replies.accepted(origin);
  }

  /** Cloudflare's two-letter code, without its codes for an unknown place (XX) and for Tor (T1). */
  static #country(code) {
    return /^[A-Z]{2}$/.test(code ?? '') && code !== 'XX' ? code : null;
  }
}
