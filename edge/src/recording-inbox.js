import { Calendar } from './calendar.js';
import { DailyCeiling } from './daily-ceiling.js';
import { DeletionRequest } from './deletion-request.js';
import { Gzip } from './gzip.js';
import { RecordingStore } from './recording-store.js';
import { Replies } from './replies.js';
import { SendLimit } from './send-limit.js';
import { SessionChunk } from './session-chunk.js';
import { VisitorAgent } from './visitor-agent.js';

/**
 * Takes the chunks of the session recordings that visitors consented to (0010), and the requests to delete them. A chunk comes
 * from one of the site's origins, as gzip or as plain text, within the size and the rate of the collector, from a browser and
 * not under Global Privacy Control; a robot or a visitor who sent GPC gets the same answer as anyone else, and nothing of
 * theirs is stored. A deletion only needs the origin and the codes: it is answered the same way whether a code named a
 * recording or not, so it tells nothing about which codes exist.
 */
export class RecordingInbox {
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
    if (Number(request.headers.get('content-length') ?? 0) > SessionChunk.LIMITS.bytes)
      return Replies.tooLarge(origin);
    if (!(await this.#limit.allows(request)))
      return Replies.tooMany(origin, SendLimit.RETRY_AFTER_SECONDS);
    const agent = VisitorAgent.of(
      request.headers.get('user-agent') ?? '',
      request.headers.get('sec-ch-ua-mobile'),
    );
    if (request.headers.get('sec-gpc') === '1' || agent.robot) return Replies.accepted(origin);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > SessionChunk.LIMITS.bytes) return Replies.tooLarge(origin);
    const gzip = Gzip.is(bytes);
    // A plain body is already shorter than the limit of the text, which only an inflated one can pass.
    const read = gzip ? await Gzip.inflate(bytes, SessionChunk.LIMITS.text) : Gzip.text(bytes);
    if (!read.ok) return Replies.refused(origin, `the chunk is ${read.reason}`);
    const parsed = SessionChunk.parse(read.text);
    if (!parsed.ok) return Replies.refused(origin, parsed.reason);
    const body = gzip ? bytes : await Gzip.deflate(read.text);
    const receivedAt = this.#clock.now();
    const day = Calendar.day(new Date(receivedAt));
    if (!(await this.#ceiling.allows(day, RecordingStore.rowsOf(parsed.chunk), body.byteLength)))
      return Replies.tooMany(origin, DailyCeiling.secondsLeft(receivedAt));
    await this.#store.save(parsed.chunk, body, { receivedAt, day, host: new URL(origin).hostname });
    return Replies.accepted(origin);
  }

  async forget(request) {
    const origin = request.headers.get('origin') ?? '';
    if (!this.#origins.includes(origin)) return Replies.forbidden();
    if (Number(request.headers.get('content-length') ?? 0) > DeletionRequest.LIMITS.characters)
      return Replies.tooLarge(origin);
    if (!(await this.#limit.allows(request)))
      return Replies.tooMany(origin, SendLimit.RETRY_AFTER_SECONDS);
    const parsed = DeletionRequest.parse(await request.text());
    if (!parsed.ok) return Replies.refused(origin, parsed.reason);
    await this.#store.delete(parsed.codes);
    return Replies.accepted(origin);
  }
}
