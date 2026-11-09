const LIMITS = {
  characters: 524_288,
  runs: 40,
  field: 60,
  search: 500,
  certificates: 10,
  run: 9,
  milliseconds: 600_000,
  shift: 100,
  count: 1_000_000_000,
  position: 1_000,
  /** 1 January 2100, as milliseconds since 1970: a certificate never lasts that long. */
  validTo: 4_102_444_800_000,
};
const WORDS = {
  PAGES: ['/', '/en/'],
  FORM_FACTORS: ['mobile', 'desktop'],
  SCOPES: ['origin', '/', '/en/'],
  FIELD_FORM_FACTORS: ['phone', 'desktop'],
  FIELD_METRICS: ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'],
  ENGINES: ['google', 'bing'],
  DEVICES: ['', 'desktop', 'mobile', 'tablet'],
  HOSTS: ['eklund.com.br', 'gustavo.eklund.com.br'],
};
const DAY = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
/** Where the full Lighthouse report of a median run is kept in R2, under lab/: the day, the page and the form factor. */
const REPORT =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\/(?:home|en)-(?:mobile|desktop)\.json$/;
/** A page of the site as Google or Bing name it, without spaces or control characters. */
const URL_OF_PAGE = /^(?:|https:\/\/(?:gustavo\.)?eklund\.com\.br\/[!-~]{0,250})$/;
/** What someone typed into a search engine, or a certificate's issuer: any script, no control characters. */
const TEXT = /^[^\p{Cc}]{0,200}$/u;
const COUNTRY = /^(?:|[a-z]{3})$/;
/** Why the lab's connection refused a certificate, as Node names it: CERT_HAS_EXPIRED, ERR_TLS_CERT_ALTNAME_INVALID. */
const PROBLEM = /^[A-Z][A-Z0-9_]{2,63}$/;
const BATCH_FIELDS = ['v', 'runs', 'field', 'search', 'certificates'];
const RUN_FIELDS = [
  'day',
  'page',
  'formFactor',
  'run',
  'median',
  'score',
  'lcp',
  'fcp',
  'cls',
  'tbt',
  'speedIndex',
  'ttfb',
  'report',
];
const FIELD_FIELDS = [
  'day',
  'scope',
  'formFactor',
  'metric',
  'p75',
  'good',
  'needsImprovement',
  'poor',
];
const SEARCH_FIELDS = [
  'engine',
  'day',
  'page',
  'query',
  'country',
  'device',
  'clicks',
  'impressions',
  'position',
];
const CERTIFICATE_FIELDS = ['day', 'host', 'validTo', 'issuer', 'problem'];

class Refusal extends Error {}

/**
 * What the nightly lab job sends (tools/lab-run.mjs): the PageSpeed Insights runs, the CrUX readings, the rows of Google
 * Search Console and Bing Webmaster Tools and the certificates of the site. Read strictly, like a page report: a batch with
 * anything outside the contract is refused whole. The contract is tests/contract/schemas/lab-batch.schema.json.
 */
export class LabBatch {
  static LIMITS = LIMITS;
  static WORDS = WORDS;
  static REPORT = REPORT;

  /** `{ ok: true, batch }` or `{ ok: false, reason }`. */
  static parse(text) {
    if (text.length > LIMITS.characters) return { ok: false, reason: 'the batch is too long' };
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, reason: 'the batch is not JSON' };
    }
    try {
      return { ok: true, batch: LabBatch.#batch(body) };
    } catch (error) {
      if (error instanceof Refusal) return { ok: false, reason: error.message };
      throw error;
    }
  }

  static #batch(body) {
    LabBatch.#fields(body, 'the batch', BATCH_FIELDS);
    if (body.v !== 1) throw new Refusal('v is not a version this collector reads');
    const each = (name, limit, read) =>
      LabBatch.#list(body[name], limit, name).map((row, index) => read(row, `${name}[${index}]`));
    return {
      runs: each('runs', LIMITS.runs, LabBatch.#run),
      field: each('field', LIMITS.field, LabBatch.#reading),
      search: each('search', LIMITS.search, LabBatch.#search),
      certificates: each('certificates', LIMITS.certificates, LabBatch.#certificate),
    };
  }

  static #run(run, where) {
    LabBatch.#fields(run, where, RUN_FIELDS);
    const median = LabBatch.#boolean(run.median, `${where}.median`);
    const time = (field) => LabBatch.#number(run[field], LIMITS.milliseconds, `${where}.${field}`);
    if (median !== (run.report !== null))
      throw new Refusal(`${where}.report is kept for the median run, and only for it`);
    return {
      day: LabBatch.#pattern(run.day, DAY, `${where}.day`),
      page: LabBatch.#choice(run.page, WORDS.PAGES, `${where}.page`),
      formFactor: LabBatch.#choice(run.formFactor, WORDS.FORM_FACTORS, `${where}.formFactor`),
      run: LabBatch.#integer(run.run, LIMITS.run, `${where}.run`),
      median,
      score: LabBatch.#number(run.score, 1, `${where}.score`),
      lcp: time('lcp'),
      fcp: time('fcp'),
      cls: LabBatch.#number(run.cls, LIMITS.shift, `${where}.cls`),
      tbt: time('tbt'),
      speedIndex: time('speedIndex'),
      ttfb: time('ttfb'),
      report: median ? LabBatch.#pattern(run.report, REPORT, `${where}.report`) : null,
    };
  }

  static #reading(reading, where) {
    LabBatch.#fields(reading, where, FIELD_FIELDS);
    const metric = LabBatch.#choice(reading.metric, WORDS.FIELD_METRICS, `${where}.metric`);
    const share = (field) => LabBatch.#number(reading[field], 1, `${where}.${field}`);
    return {
      day: LabBatch.#pattern(reading.day, DAY, `${where}.day`),
      scope: LabBatch.#choice(reading.scope, WORDS.SCOPES, `${where}.scope`),
      formFactor: LabBatch.#choice(
        reading.formFactor,
        WORDS.FIELD_FORM_FACTORS,
        `${where}.formFactor`,
      ),
      metric,
      p75: LabBatch.#number(
        reading.p75,
        metric === 'CLS' ? LIMITS.shift : LIMITS.milliseconds,
        `${where}.p75`,
      ),
      good: share('good'),
      needsImprovement: share('needsImprovement'),
      poor: share('poor'),
    };
  }

  static #search(row, where) {
    LabBatch.#fields(row, where, SEARCH_FIELDS);
    return {
      engine: LabBatch.#choice(row.engine, WORDS.ENGINES, `${where}.engine`),
      day: LabBatch.#pattern(row.day, DAY, `${where}.day`),
      page: LabBatch.#pattern(row.page, URL_OF_PAGE, `${where}.page`),
      query: LabBatch.#pattern(row.query, TEXT, `${where}.query`),
      country: LabBatch.#pattern(row.country, COUNTRY, `${where}.country`),
      device: LabBatch.#choice(row.device, WORDS.DEVICES, `${where}.device`),
      clicks: LabBatch.#integer(row.clicks, LIMITS.count, `${where}.clicks`),
      impressions: LabBatch.#integer(row.impressions, LIMITS.count, `${where}.impressions`),
      position:
        row.position === null
          ? null
          : LabBatch.#number(row.position, LIMITS.position, `${where}.position`),
    };
  }

  /** A certificate the lab could read, with its expiry, or one its connection refused, with the problem instead. */
  static #certificate(certificate, where) {
    LabBatch.#fields(certificate, where, CERTIFICATE_FIELDS);
    const refused = certificate.problem !== null;
    if (refused !== (certificate.validTo === null))
      throw new Refusal(`${where} has an expiry or a problem, never both and never neither`);
    return {
      day: LabBatch.#pattern(certificate.day, DAY, `${where}.day`),
      host: LabBatch.#choice(certificate.host, WORDS.HOSTS, `${where}.host`),
      validTo: refused
        ? null
        : LabBatch.#integer(certificate.validTo, LIMITS.validTo, `${where}.validTo`),
      issuer: LabBatch.#pattern(certificate.issuer, TEXT, `${where}.issuer`),
      problem: refused ? LabBatch.#pattern(certificate.problem, PROBLEM, `${where}.problem`) : null,
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
