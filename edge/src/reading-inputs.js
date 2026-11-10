import { z } from 'zod';
import { ReportVocabulary } from './report-vocabulary.js';

const DAY = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[0-9a-z.]{1,20})?$/;
const DAY_MS = 86_400_000;

/**
 * What each reading of the MCP server and the JSON API accepts: closed lists, days and versions, never free text or SQL. Each
 * tool's input is an object whose values are all strings, so the same schema reads a tool call and a query string. The
 * schemas are built the first time they are asked for, not when the module loads.
 */
export class ReadingInputs {
  /** Thirteen months and a little: the rows of visits are kept that long, so a longer period reads nothing more. */
  static LONGEST_PERIOD_DAYS = 400;

  static #tools = null;

  /** Each tool: what it answers, and the schema of its input. */
  static get TOOLS() {
    ReadingInputs.#tools ??= ReadingInputs.#build();
    return ReadingInputs.#tools;
  }

  /** The names of the tools, in the order they are listed. */
  static get NAMES() {
    return Object.keys(ReadingInputs.TOOLS);
  }

  /** Reads the input of a tool: `{ ok: true, input }`, or `{ ok: false, reason }` naming each field that is wrong. */
  static parse(tool, raw) {
    const result = ReadingInputs.TOOLS[tool].input.safeParse(raw);
    return result.success
      ? { ok: true, input: result.data }
      : {
          ok: false,
          reason: result.error.issues
            .map(({ path, message }) => (path.length ? `${path.join('.')}: ${message}` : message))
            .join('; '),
        };
  }

  static #build() {
    const page = ReadingInputs.#choice(ReportVocabulary.PAGES, 'Only this page of the site.');
    const device = ReadingInputs.#choice(
      ['phone', 'tablet', 'desktop'],
      'Only this kind of device.',
    );
    const release = ReadingInputs.#version('Only this release.');
    const labPage = ReadingInputs.#choice(['/', '/en/'], 'The page the lab measures.');
    const formFactor = ReadingInputs.#choice(
      ['mobile', 'desktop'],
      'How PageSpeed Insights loaded the page.',
    );
    const labMetric = ReadingInputs.#choice(
      ['score', 'lcp', 'fcp', 'cls', 'tbt', 'speed_index', 'ttfb'],
      'The number of each run: the performance score (0 to 1), or a metric in milliseconds (CLS has no unit).',
    );
    const recordedPage = ReadingInputs.#choice(
      ReportVocabulary.RECORDED_PAGES,
      'Only this page of the site.',
    );
    const period = ReadingInputs.#period();
    const tool = ReadingInputs.#tool;
    return {
      overview: tool(
        'Page views of a period from the daily totals: how many, how many each day, and the most common pages, languages, devices, browsers, countries, referrers, releases and hosts.',
        {},
        period,
      ),
      vitals: tool(
        "Core Web Vitals of real visits in a period: the 75th percentile and the share of good, needs-improvement and poor loads of each metric, and the elements LCP, INP and CLS most often name, from the visits' own rows.",
        { page: page.optional(), device: device.optional(), version: release.optional() },
        period,
      ),
      compare_vitals: tool(
        'Compares one Core Web Vital of real visits between two releases with a Mann-Whitney U test. Lower is better for every metric.',
        {
          metric: ReadingInputs.#choice(ReportVocabulary.METRICS, 'The metric to compare.'),
          before: ReadingInputs.#version('The earlier release.'),
          after: ReadingInputs.#version('The later release.'),
          page: page.optional(),
          device: device.optional(),
        },
      ),
      events: tool(
        'What visitors did on the pages in a period: each engagement event and its detail, with how many times it happened.',
        { page: page.optional() },
        period,
      ),
      errors: tool(
        "Errors in the site's own code in a period, by kind, file and message. Rows of errors are kept 90 days, their daily totals 25 months.",
        { version: release.optional() },
        period,
      ),
      uptime: tool(
        'How the site answered the uptime monitor in a period, page by page, and whether a page is down now.',
        {},
        period,
      ),
      lab: tool(
        'The median run of each night of the lab job in a period: PageSpeed Insights on / and /en/, mobile and desktop.',
        { page: labPage.optional(), form_factor: formFactor.optional() },
        period,
      ),
      compare_lab: tool(
        'Compares the lab runs of two periods with a Mann-Whitney U test, for one page, form factor and number. Every run counts, five a night.',
        { metric: labMetric, page: labPage, form_factor: formFactor },
        ReadingInputs.#period('before_from', 'before_to'),
        ReadingInputs.#period('after_from', 'after_to'),
      ),
      lab_change_points: tool(
        "Looks for the nights where the lab's median of one number shifted to a new level, by binary segmentation.",
        { metric: labMetric, page: labPage, form_factor: formFactor },
        period,
      ),
      crux: tool(
        "The latest Chrome UX Report reading the lab job stored: the 75th percentile and the shares of the last 28 days of Chrome's own visitors.",
        {
          scope: ReadingInputs.#choice(
            ['origin', '/', '/en/'],
            'The whole origin, or one page.',
          ).optional(),
          form_factor: ReadingInputs.#choice(
            ['phone', 'desktop'],
            'The kind of device CrUX reports.',
          ).optional(),
        },
      ),
      search: tool(
        'How people found the site in Google and Bing in a period: clicks, impressions, and the top queries and pages.',
        {
          engine: ReadingInputs.#choice(['google', 'bing'], 'Only this search engine.').optional(),
        },
        period,
      ),
      certificates: tool(
        'The certificate each host presented to the lab job on its latest night, and how many days it has left.',
      ),
      recordings: tool(
        'The session recordings of a period, the latest first: the code that names each one in R2, its page, language and release, how long it lasted, its chunks and bytes, and its clicks. Only visitors who consented are recorded, and recordings are kept 30 days.',
        { page: recordedPage.optional() },
        period,
      ),
      heat_map: tool(
        'Where the recorded visitors clicked in a period: for each part of the page and range of window width, the clicks in a grid of ten by ten cells laid over that part, from the top left. Clicks are kept 30 days.',
        {
          page: recordedPage.optional(),
          region: ReadingInputs.#choice(
            ReportVocabulary.REGIONS,
            'Only this part of the page: a section by its id, the header, the footer, the privacy notice and dialog, or anything else.',
          ).optional(),
          viewport: ReadingInputs.#choice(
            ReportVocabulary.VIEWPORT_WIDTHS,
            'Only this range of window width, in CSS pixels.',
          ).optional(),
        },
        period,
      ),
    };
  }

  /**
   * A tool whose input refuses any field it does not name, refined with the checks of its periods. `listed` is the same
   * schema for the MCP server, which converts it to JSON Schema once per isolate instead of on every tools/list.
   */
  static #tool(description, shape = {}, ...periods) {
    const input = z
      .strictObject(Object.assign({}, ...periods.map(({ fields }) => fields), shape))
      .superRefine((value, context) => periods.forEach(({ check }) => check(value, context)));
    return { description, input, listed: ReadingInputs.#remembered(input) };
  }

  /** A Standard Schema that validates with `schema` and remembers each JSON Schema it was asked for. */
  static #remembered(schema) {
    const standard = schema['~standard'];
    const converted = new Map();
    const remember = (io) => (options) => {
      const key = `${io} ${options?.target}`;
      if (!converted.has(key)) converted.set(key, standard.jsonSchema[io](options));
      return converted.get(key);
    };
    return {
      '~standard': {
        version: standard.version,
        vendor: standard.vendor,
        validate: (value) => standard.validate(value),
        jsonSchema: { input: remember('input'), output: remember('output') },
      },
    };
  }

  /** A period from one day to another, both included, at most LONGEST_PERIOD_DAYS long. */
  static #period(from = 'from', to = 'to') {
    return {
      fields: {
        [from]: ReadingInputs.#day('The first day of the period, YYYY-MM-DD, in UTC.'),
        [to]: ReadingInputs.#day('The last day of the period, YYYY-MM-DD, in UTC, included.'),
      },
      check: (input, context) => {
        if (
          ![input[from], input[to]].every(
            (value) => DAY.test(value) && ReadingInputs.#exists(value),
          )
        )
          return;
        const length = (Date.parse(input[to]) - Date.parse(input[from])) / DAY_MS;
        if (length < 0)
          context.addIssue({ code: 'custom', path: [to], message: `${to} comes before ${from}` });
        if (length > ReadingInputs.LONGEST_PERIOD_DAYS)
          context.addIssue({
            code: 'custom',
            path: [to],
            message: `a period is at most ${ReadingInputs.LONGEST_PERIOD_DAYS} days long`,
          });
      },
    };
  }

  static #day(description) {
    return z
      .string()
      .regex(DAY, 'a day is written YYYY-MM-DD')
      .refine((value) => !DAY.test(value) || ReadingInputs.#exists(value), {
        message: 'that day does not exist',
      })
      .describe(description);
  }

  /** Whether a day written YYYY-MM-DD is on the calendar: 2026-02-29 is not. */
  static #exists(day) {
    return new Date(`${day}T00:00:00Z`).toISOString().startsWith(day);
  }

  static #version(description) {
    return z.string().regex(VERSION, 'a version is written like 1.2.0').describe(description);
  }

  static #choice(values, description) {
    return z.enum(values).describe(description);
  }
}
