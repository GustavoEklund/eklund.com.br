import { ReportVocabulary as Words } from './report-vocabulary.js';

const LIMITS = {
  /** What one request may carry, compressed or not. */
  bytes: 524_288,
  /** The text of a chunk once inflated: the first chunk holds the whole page, about 400 kB of JSON. */
  text: 2_097_152,
  sequence: 999,
  events: 10_000,
  clicks: 200,
  milliseconds: 86_400_000,
};
const CODE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[0-9a-z.]{1,20})?$/;
/** rrweb's event types, from DomContentLoaded (0) to Plugin (6). */
const EVENT_TYPES = [0, 1, 2, 3, 4, 5, 6];
/** The clock of an event, in milliseconds since 1970: from 2020 to 2100. */
const TIMESTAMPS = [1_577_836_800_000, 4_102_444_800_000];
const CHUNK_FIELDS = ['v', 'code', 'seq', 'version', 'page', 'language', 'events', 'clicks'];
const EVENT_FIELDS = ['type', 'data', 'timestamp'];
const CLICK_FIELDS = ['region', 'viewport', 'x', 'y', 'at'];
/** A click's position is kept to a thousandth of the part it landed in. */
const POSITION_STEPS = 1_000;

class Refusal extends Error {}

/**
 * One chunk of a session recording, read strictly: the recording's code and order, the page and its release, rrweb's events
 * and the clicks of the heat map. Anything outside the contract refuses the chunk whole. The events are kept as rrweb wrote
 * them: each must be an object with a known type, a time and its data, and what the data says about the page is the recording
 * itself. The contract is tests/contract/schemas/session-chunk.schema.json.
 */
export class SessionChunk {
  static LIMITS = LIMITS;
  static CODE = CODE;

  /** `{ ok: true, chunk }`, the chunk in the shape the store writes, or `{ ok: false, reason }`. */
  static parse(text) {
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, reason: 'the chunk is not JSON' };
    }
    try {
      return { ok: true, chunk: SessionChunk.#chunk(body) };
    } catch (error) {
      if (error instanceof Refusal) return { ok: false, reason: error.message };
      throw error;
    }
  }

  static #chunk(body) {
    SessionChunk.#fields(body, 'the chunk', CHUNK_FIELDS);
    if (body.v !== 1) throw new Refusal('v is not a version this collector reads');
    const events = SessionChunk.#list(body.events, LIMITS.events, 'events');
    let first = Infinity;
    let last = -Infinity;
    events.forEach((event, index) => {
      const timestamp = SessionChunk.#event(event, `events[${index}]`);
      first = Math.min(first, timestamp);
      last = Math.max(last, timestamp);
    });
    return {
      code: SessionChunk.#pattern(body.code, CODE, 'code'),
      seq: SessionChunk.#integer(body.seq, 0, LIMITS.sequence, 'seq'),
      version: SessionChunk.#pattern(body.version, VERSION, 'version'),
      page: SessionChunk.#choice(body.page, Words.RECORDED_PAGES, 'page'),
      language: SessionChunk.#choice(body.language, Words.LANGUAGES, 'language'),
      events: events.length,
      first: events.length ? first : null,
      last: events.length ? last : null,
      clicks: SessionChunk.#list(body.clicks, LIMITS.clicks, 'clicks').map((click, index) =>
        SessionChunk.#click(click, `clicks[${index}]`),
      ),
    };
  }

  /** Checks an event and gives its time. */
  static #event(event, where) {
    SessionChunk.#fields(event, where, EVENT_FIELDS);
    SessionChunk.#choice(event.type, EVENT_TYPES, `${where}.type`);
    if (typeof event.data !== 'object' || event.data === null || Array.isArray(event.data))
      throw new Refusal(`${where}.data is not an object`);
    return SessionChunk.#integer(event.timestamp, ...TIMESTAMPS, `${where}.timestamp`);
  }

  static #click(click, where) {
    SessionChunk.#fields(click, where, CLICK_FIELDS);
    return {
      region: SessionChunk.#choice(click.region, Words.REGIONS, `${where}.region`),
      viewport: SessionChunk.#choice(click.viewport, Words.VIEWPORT_WIDTHS, `${where}.viewport`),
      x: SessionChunk.#position(click.x, `${where}.x`),
      y: SessionChunk.#position(click.y, `${where}.y`),
      at: SessionChunk.#integer(click.at, 0, LIMITS.milliseconds, `${where}.at`),
    };
  }

  /** An object with exactly these fields. */
  static #fields(value, where, fields) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw new Refusal(`${where} is not an object`);
    const missing = fields.filter((field) => !Object.hasOwn(value, field));
    if (missing.length) throw new Refusal(`${where} has no ${missing[0]}`);
    const unknown = Object.keys(value).filter((field) => !fields.includes(field));
    if (unknown.length) throw new Refusal(`${where} has an unknown field, ${unknown[0]}`);
  }

  static #list(value, limit, where) {
    if (!Array.isArray(value)) throw new Refusal(`${where} is not a list`);
    if (value.length > limit) throw new Refusal(`${where} has more than ${limit} items`);
    return value;
  }

  static #choice(value, choices, where) {
    if (!choices.includes(value)) throw new Refusal(`${where} is not one of the allowed values`);
    return value;
  }

  static #pattern(value, pattern, where) {
    if (typeof value !== 'string' || !pattern.test(value))
      throw new Refusal(`${where} does not have the expected form`);
    return value;
  }

  /** A share of the part a click landed in, from 0 to 1, rounded to a thousandth. */
  static #position(value, where) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
      throw new Refusal(`${where} is not a number between 0 and 1`);
    return Math.round(value * POSITION_STEPS) / POSITION_STEPS;
  }

  static #integer(value, minimum, maximum, where) {
    if (!Number.isInteger(value) || value < minimum || value > maximum)
      throw new Refusal(`${where} is not a whole number between ${minimum} and ${maximum}`);
    return value;
  }
}
