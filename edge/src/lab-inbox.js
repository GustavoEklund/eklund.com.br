import { LabBatch } from './lab-batch.js';
import { Replies } from './replies.js';

/**
 * Takes what the nightly lab job sends: the rows of a night into D1, and the full Lighthouse report of each median run into R2.
 * Only a request that carries the job's token gets in. The Router builds this only when the Worker has a LAB_TOKEN secret.
 */
export class LabInbox {
  /** A Lighthouse report of the site is about 1 MB; R2 takes it as it comes, unread, to stay within the Worker's CPU time. */
  static REPORT_LIMIT = 8 * 1024 * 1024;

  #token;
  #store;
  #reports;

  constructor({ token, store, reports }) {
    this.#token = token;
    this.#store = store;
    this.#reports = reports;
  }

  async take(request) {
    if (!(await this.#authorized(request))) return Replies.unauthorized();
    if (Number(request.headers.get('content-length') ?? 0) > LabBatch.LIMITS.characters)
      return Replies.tooLarge(null);
    const parsed = LabBatch.parse(await request.text());
    if (!parsed.ok) return Replies.refused(null, parsed.reason);
    await this.#store.save(parsed.batch);
    return Replies.accepted(null);
  }

  /** Keeps a report at lab/<day>/<page>-<form factor>.json, the key a median run names. */
  async keep(request, key) {
    if (!(await this.#authorized(request))) return Replies.unauthorized();
    if (!LabBatch.REPORT.test(key))
      return Replies.refused(null, 'the report key does not have the expected form');
    if (Number(request.headers.get('content-length') ?? 0) > LabInbox.REPORT_LIMIT)
      return Replies.tooLarge(null);
    const body = await request.arrayBuffer();
    if (body.byteLength > LabInbox.REPORT_LIMIT) return Replies.tooLarge(null);
    const bytes = new Uint8Array(body);
    if (bytes[0] !== 0x7b || bytes.at(-1) !== 0x7d)
      return Replies.refused(null, 'the report is not a JSON object');
    await this.#reports.put(`lab/${key}`, body, {
      httpMetadata: { contentType: 'application/json' },
    });
    return Replies.accepted(null);
  }

  /** Compares the digests of the two tokens byte by byte, all of them every time, so the answer takes as long either way. */
  async #authorized(request) {
    const header = request.headers.get('authorization') ?? '';
    const given = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    const [a, b] = await Promise.all(
      [given, this.#token].map(
        async (text) =>
          new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
      ),
    );
    let difference = given.length === 0 ? 1 : 0;
    for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
    return difference === 0;
  }
}
