/** The limits of the collector for a chunk (edge/src/session-chunk.js), which a contract test keeps equal. */
const LIMITS = {
  /** The bytes of a chunk's text, in UTF-8. */
  text: 2_097_152,
  sequence: 999,
  events: 10_000,
  clicks: 200,
  milliseconds: 86_400_000,
};
/** Room in a chunk for everything but its events. */
const ENVELOPE = 32_768;
/** The characters a chunk's events may take: a character of JavaScript is at most three bytes of UTF-8. */
const CHARACTERS = Math.floor(LIMITS.text / 3) - ENVELOPE;
/** rrweb's Meta event, which carries the address of the page. */
const META = 4;

/**
 * The events and clicks of one recording that have not been sent yet, and the chunks they go out in, numbered from 0. Each
 * event is written as JSON once, when it arrives, and a chunk is those texts joined, so a large snapshot is never written
 * twice. The address of the page goes without its query or fragment, which can carry what a link put there.
 */
export class RecordingBatch {
  static LIMITS = LIMITS;

  #identity;
  #startedAt;
  #seq = 0;
  #events = [];
  #size = 0;
  #clicks = [];

  /**
   * @param {object} recording
   * @param {string} recording.code a random UUID made for this recording
   * @param {string} recording.version @param {string} recording.page @param {string} recording.language
   * @param {number} recording.startedAt when the recording started, on the clock of `now` in addClick
   */
  constructor({ code, version, page, language, startedAt }) {
    this.#identity = { v: 1, code, seq: 0, version, page, language };
    this.#startedAt = startedAt;
  }

  /** The characters of the events waiting to be sent. */
  get size() {
    return this.#size;
  }

  /** Whether the recording has sent all the chunks it may. */
  get exhausted() {
    return this.#seq > LIMITS.sequence;
  }

  /** Keeps an event of rrweb, and says false for one too large for any chunk, which is dropped. */
  addEvent({ type, data, timestamp }) {
    const text = JSON.stringify({
      type,
      data: RecordingBatch.#withoutQuery(type, data),
      timestamp,
    });
    if (text.length > CHARACTERS) return false;
    this.#events.push(text);
    this.#size += text.length;
    return true;
  }

  /** Keeps where a click landed, `now` on the clock of startedAt, while the chunk has room for it. */
  addClick({ region, viewport, x, y }, now) {
    if (this.#clicks.length >= LIMITS.clicks) return;
    const at = Math.min(Math.max(Math.round(now - this.#startedAt), 0), LIMITS.milliseconds);
    this.#clicks.push({ region, viewport, x, y, at });
  }

  /** The next chunk as the text to send, or null when nothing is waiting or the recording has sent all it may. */
  next() {
    if ((this.#events.length === 0 && this.#clicks.length === 0) || this.exhausted) return null;
    let count = 0;
    let length = 0;
    while (
      count < this.#events.length &&
      count < LIMITS.events &&
      length + this.#events[count].length + 1 <= CHARACTERS
    ) {
      length += this.#events[count].length + 1;
      count += 1;
    }
    const events = this.#events.splice(0, count);
    this.#size -= length - count;
    const clicks = this.#clicks.splice(0);
    const head = JSON.stringify({ ...this.#identity, seq: this.#seq }).slice(0, -1);
    this.#seq += 1;
    return `${head},"events":[${events.join(',')}],"clicks":${JSON.stringify(clicks)}}`;
  }

  static #withoutQuery(type, data) {
    if (type !== META || typeof data?.href !== 'string') return data;
    try {
      const { origin, pathname } = new URL(data.href);
      return { ...data, href: `${origin}${pathname}` };
    } catch {
      return { ...data, href: '' };
    }
  }
}
