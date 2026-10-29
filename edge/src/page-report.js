import { ReportVocabulary as Words } from './report-vocabulary.js';

const LIMITS = {
  characters: 16_384,
  vitals: 5,
  events: 100,
  errors: 20,
  text: 200,
  sequence: 1_000,
  milliseconds: 86_400_000,
  position: 10_000_000,
  shift: 100,
};
const VIEW = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[0-9a-z.]{1,20})?$/;
const HOST = /^(?=.{1,253}$)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
/** A selector or a function name, as the browser describes them: printable ASCII. */
const LABEL = /^[ -~]{0,200}$/;
/** An error message, in whatever language the browser wrote it, without control characters. */
const MESSAGE = /^[^\p{Cc}]{0,200}$/u;
/** A path of this site without its query or fragment, `other` for a file from another origin, or nothing. */
const PATH = /^(?:|other|\/[!-"$->@-~]{0,199})$/;
const REPORT_FIELDS = [
  'v',
  'view',
  'seq',
  'version',
  'page',
  'language',
  'referrer',
  'navigation',
  'visible',
  'device',
  'vitals',
  'events',
  'errors',
];
const DEVICE_FIELDS = [
  'viewport',
  'pixelRatio',
  'memory',
  'cores',
  'roundTrip',
  'saveData',
  'colorScheme',
  'reducedMotion',
];

class Refusal extends Error {}

/**
 * What a page sends about one load of itself, read strictly: a report with anything outside the contract is refused whole,
 * never trimmed. The contract is tests/contract/schemas/page-report.schema.json.
 */
export class PageReport {
  static LIMITS = LIMITS;

  /** `{ ok: true, report }`, the report in the shape the store writes, or `{ ok: false, reason }`. */
  static parse(text) {
    if (text.length > LIMITS.characters) return { ok: false, reason: 'the report is too long' };
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, reason: 'the report is not JSON' };
    }
    try {
      return { ok: true, report: PageReport.#report(body) };
    } catch (error) {
      if (error instanceof Refusal) return { ok: false, reason: error.message };
      throw error;
    }
  }

  static #report(body) {
    PageReport.#fields(body, 'the report', REPORT_FIELDS);
    if (body.v !== 1) throw new Refusal('v is not a version this collector reads');
    return {
      view: PageReport.#pattern(body.view, VIEW, 'view'),
      seq: PageReport.#integer(body.seq, LIMITS.sequence, 'seq'),
      version: PageReport.#pattern(body.version, VERSION, 'version'),
      page: PageReport.#choice(body.page, Words.PAGES, 'page'),
      language: PageReport.#choice(body.language, Words.LANGUAGES, 'language'),
      referrer: body.referrer === '' ? null : PageReport.#pattern(body.referrer, HOST, 'referrer'),
      navigation: PageReport.#choice(body.navigation, Words.NAVIGATION_TYPES, 'navigation'),
      visible: PageReport.#integer(body.visible, LIMITS.milliseconds, 'visible'),
      device: PageReport.#device(body.device),
      vitals: PageReport.#vitals(body.vitals),
      events: PageReport.#list(body.events, LIMITS.events, 'events').map((event, index) =>
        PageReport.#event(event, `events[${index}]`),
      ),
      errors: PageReport.#list(body.errors, LIMITS.errors, 'errors').map((error, index) =>
        PageReport.#error(error, `errors[${index}]`),
      ),
    };
  }

  static #device(device) {
    PageReport.#fields(device, 'device', DEVICE_FIELDS);
    return {
      viewport: PageReport.#choice(device.viewport, Words.VIEWPORT_WIDTHS, 'device.viewport'),
      pixelRatio: PageReport.#choice(device.pixelRatio, Words.PIXEL_RATIOS, 'device.pixelRatio'),
      memory: PageReport.#choice(device.memory, Words.MEMORIES, 'device.memory'),
      cores: PageReport.#choice(device.cores, Words.CORES, 'device.cores'),
      roundTrip: PageReport.#choice(device.roundTrip, Words.ROUND_TRIPS, 'device.roundTrip'),
      saveData: PageReport.#boolean(device.saveData, 'device.saveData'),
      colorScheme: PageReport.#choice(
        device.colorScheme,
        Words.COLOR_SCHEMES,
        'device.colorScheme',
      ),
      reducedMotion: PageReport.#boolean(device.reducedMotion, 'device.reducedMotion'),
    };
  }

  static #vitals(vitals) {
    const read = PageReport.#list(vitals, LIMITS.vitals, 'vitals').map((vital, index) => {
      const where = `vitals[${index}]`;
      PageReport.#fields(vital, where, ['name', 'value', 'rating', 'attribution']);
      const name = PageReport.#choice(vital.name, Words.METRICS, `${where}.name`);
      return {
        name,
        value: PageReport.#number(
          vital.value,
          name === 'CLS' ? LIMITS.shift : LIMITS.milliseconds,
          `${where}.value`,
        ),
        rating: PageReport.#choice(vital.rating, Words.RATINGS, `${where}.rating`),
        attribution: PageReport.#attribution(vital.attribution, name, `${where}.attribution`),
      };
    });
    if (new Set(read.map(({ name }) => name)).size !== read.length)
      throw new Refusal('vitals names a metric twice');
    return read;
  }

  /** Only the fields web-vitals reports for that metric, each optional, and nothing else. */
  static #attribution(attribution, metric, where) {
    const { text, number, choice } = Words.ATTRIBUTION[metric];
    PageReport.#fields(attribution, where, [], [...text, ...number, ...Object.keys(choice)]);
    const read = {};
    for (const [field, value] of Object.entries(attribution)) {
      const name = `${where}.${field}`;
      if (text.includes(field))
        read[field] = PageReport.#pattern(value, /url$/i.test(field) ? PATH : LABEL, name);
      else if (number.includes(field))
        read[field] = PageReport.#number(
          value,
          field === 'largestShiftValue' ? LIMITS.shift : LIMITS.milliseconds,
          name,
        );
      else read[field] = PageReport.#choice(value, choice[field], name);
    }
    return read;
  }

  static #event(event, where) {
    PageReport.#fields(event, where, ['name', 'detail', 'at'], ['value']);
    const name = PageReport.#choice(event.name, Object.keys(Words.EVENTS), `${where}.name`);
    const details = Words.EVENTS[name];
    return {
      name,
      detail:
        details.length === 0
          ? PageReport.#empty(event.detail, `${where}.detail`)
          : PageReport.#choice(event.detail, details, `${where}.detail`),
      value:
        'value' in event
          ? PageReport.#number(event.value, LIMITS.milliseconds, `${where}.value`)
          : null,
      at: PageReport.#integer(event.at, LIMITS.milliseconds, `${where}.at`),
    };
  }

  static #error(error, where) {
    PageReport.#fields(error, where, ['kind', 'message', 'source', 'line', 'column', 'at']);
    return {
      kind: PageReport.#choice(error.kind, Words.ERROR_KINDS, `${where}.kind`),
      message: PageReport.#pattern(error.message, MESSAGE, `${where}.message`),
      source: PageReport.#pattern(error.source, PATH, `${where}.source`),
      line: PageReport.#integer(error.line, LIMITS.position, `${where}.line`),
      column: PageReport.#integer(error.column, LIMITS.position, `${where}.column`),
      at: PageReport.#integer(error.at, LIMITS.milliseconds, `${where}.at`),
    };
  }

  /** An object with every `required` field, any of the `optional` ones, and no other. */
  static #fields(value, where, required, optional = []) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw new Refusal(`${where} is not an object`);
    const missing = required.filter((field) => !Object.hasOwn(value, field));
    if (missing.length) throw new Refusal(`${where} has no ${missing[0]}`);
    const unknown = Object.keys(value).filter(
      (field) => !required.includes(field) && !optional.includes(field),
    );
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

  static #empty(value, where) {
    if (value !== '') throw new Refusal(`${where} must be empty for this event`);
    return null;
  }

  static #boolean(value, where) {
    if (typeof value !== 'boolean') throw new Refusal(`${where} is not true or false`);
    return value;
  }

  static #number(value, maximum, where) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum)
      throw new Refusal(`${where} is not a number between 0 and ${maximum}`);
    return value;
  }

  static #integer(value, maximum, where) {
    if (!Number.isInteger(value) || value < 0 || value > maximum)
      throw new Refusal(`${where} is not a whole number between 0 and ${maximum}`);
    return value;
  }
}
