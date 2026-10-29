import { Calendar } from './calendar.js';
import { PageReport } from './page-report.js';
import { Replies } from './replies.js';
import { VisitorAgent } from './visitor-agent.js';

/**
 * Takes the reports of the site's pages: from one of its origins, from a browser and not under Global Privacy Control, and
 * whole. A robot or a visitor who sent GPC gets the same answer as anyone else, and nothing of theirs is stored.
 */
export class Collector {
  #origins;
  #store;
  #clock;

  constructor({ origins, store, clock = Date }) {
    this.#origins = origins;
    this.#store = store;
    this.#clock = clock;
  }

  async take(request) {
    const origin = request.headers.get('origin') ?? '';
    if (!this.#origins.includes(origin)) return Replies.forbidden();
    if (Number(request.headers.get('content-length') ?? 0) > PageReport.LIMITS.characters)
      return Replies.tooLarge(origin);
    const agent = VisitorAgent.of(
      request.headers.get('user-agent') ?? '',
      request.headers.get('sec-ch-ua-mobile'),
    );
    if (request.headers.get('sec-gpc') === '1' || agent.robot) return Replies.accepted(origin);
    const parsed = PageReport.parse(await request.text());
    if (!parsed.ok) return Replies.refused(origin, parsed.reason);
    const receivedAt = this.#clock.now();
    await this.#store.save(parsed.report, {
      receivedAt,
      day: Calendar.day(new Date(receivedAt)),
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
