// The nightly lab job (docs/decisions/0009-measurement-on-a-cloudflare-worker.md), which .github/workflows/lab.yml runs once a
// day. It runs PageSpeed Insights five times on each page, mobile and desktop, reads CrUX, Google Search Console and Bing
// Webmaster Tools, and the certificates of the site, and sends it all to the collector: the rows to POST /v1/lab, and the full
// report of each median run to R2 through PUT /v1/lab/report/<key>. A source whose key is missing is left out with a note, and
// the job fails at the end when a source it could read did not answer, after sending what the others gave.
// usage: node tools/lab-run.mjs
//   GOOGLE_API_KEY          PageSpeed Insights and CrUX
//   GOOGLE_ACCESS_TOKEN     an access token of the service account that is a user of the Search Console property
//   BING_API_KEY            Bing Webmaster Tools
//   LAB_TOKEN               the collector's token for the lab routes (required)
//   LAB_ENDPOINT            the collector, https://eklund.eklund.workers.dev unless set
import { connect } from 'node:tls';
import { pathToFileURL } from 'node:url';

const SITE = 'https://eklund.com.br';
/** The pages the lab measures, with the name each one has in the key of its report. */
const PAGES = [
  { path: '/', name: 'home' },
  { path: '/en/', name: 'en' },
];
const HOSTS = ['eklund.com.br', 'gustavo.eklund.com.br'];
const TIMEOUT_MS = 120_000;
/** The most rows of one kind the collector takes in a batch (edge/src/lab-batch.js). */
const SEARCH_ROWS_PER_BATCH = 500;
const TEXT_LIMIT = 200;
const SEARCH_PAGE = /^https:\/\/(?:gustavo\.)?eklund\.com\.br\/[!-~]{0,250}$/;

/** Days as `YYYY-MM-DD` in UTC, as the collector files them. */
class Day {
  static of(time) {
    return new Date(time).toISOString().slice(0, 10);
  }

  static before(time, days) {
    return Day.of(time - days * 86_400_000);
  }
}

/** Text from a search engine as the collector takes it: no control characters and at most 200 characters. */
class SearchText {
  static of(text) {
    return [...String(text ?? '').replace(/\p{Cc}/gu, ' ')].slice(0, TEXT_LIMIT).join('');
  }
}

/** A JSON request that fails loudly, naming what it asked, when the answer is not a success. */
class JsonRequest {
  static async send(fetch, url, init = {}, what = url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), ...init });
    if (!response.ok) throw new Error(`${what} answered ${response.status}`);
    return response.json();
  }
}

/** PageSpeed Insights, version 5: one Lighthouse run of a page on Google's machines. */
export class PageSpeed {
  static RUNS = 5;
  static STRATEGIES = ['mobile', 'desktop'];

  #key;
  #fetch;

  constructor({ key, fetch }) {
    this.#key = key;
    this.#fetch = fetch;
  }

  /** The Lighthouse report of one run, or an error when Lighthouse could not measure the page. */
  async run(url, strategy) {
    const query = new URLSearchParams({ url, strategy, category: 'performance', key: this.#key });
    const { lighthouseResult: report } = await JsonRequest.send(
      this.#fetch,
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${query}`,
      {},
      `PageSpeed Insights (${strategy} ${url})`,
    );
    if (report?.runtimeError) throw new Error(`Lighthouse: ${report.runtimeError.code}`);
    return report;
  }

  /** The numbers the collector keeps from a report. */
  static numbers(report) {
    const value = (audit) => {
      const number = report.audits?.[audit]?.numericValue;
      if (typeof number !== 'number') throw new Error(`the report has no ${audit}`);
      return number;
    };
    const score = report.categories?.performance?.score;
    if (typeof score !== 'number') throw new Error('the report has no performance score');
    return {
      score,
      lcp: value('largest-contentful-paint'),
      fcp: value('first-contentful-paint'),
      cls: value('cumulative-layout-shift'),
      tbt: value('total-blocking-time'),
      speedIndex: value('speed-index'),
      ttfb: value('server-response-time'),
    };
  }

  /** The position of the run in the middle by score; with an even count, the lower of the two in the middle. */
  static median(runs) {
    const order = runs.map((run, index) => [run.score, index]).sort(([a], [b]) => a - b);
    return order[Math.floor((order.length - 1) / 2)][1];
  }
}

/** The Chrome UX Report API: what real Chrome users measured in the last 28 days, when there were enough of them. */
export class ChromeUxReport {
  static FORM_FACTORS = { phone: 'PHONE', desktop: 'DESKTOP' };
  static METRICS = {
    largest_contentful_paint: 'LCP',
    interaction_to_next_paint: 'INP',
    cumulative_layout_shift: 'CLS',
    first_contentful_paint: 'FCP',
    experimental_time_to_first_byte: 'TTFB',
  };

  #key;
  #fetch;

  constructor({ key, fetch }) {
    this.#key = key;
    this.#fetch = fetch;
  }

  /** The readings of a scope ('origin', '/' or '/en/') and form factor; none when CrUX has too few visits to say. */
  async readings(scope, formFactor) {
    const target = scope === 'origin' ? { origin: SITE } : { url: `${SITE}${scope}` };
    const response = await this.#fetch(
      `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(this.#key)}`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...target,
          formFactor: ChromeUxReport.FORM_FACTORS[formFactor],
          metrics: Object.keys(ChromeUxReport.METRICS),
        }),
      },
    );
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`CrUX (${formFactor} ${scope}) answered ${response.status}`);
    const { record } = await response.json();
    const { year, month, day } = record.collectionPeriod.lastDate;
    const last = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return Object.entries(ChromeUxReport.METRICS)
      .filter(([name]) => record.metrics[name])
      .map(([name, metric]) => {
        const { histogram, percentiles } = record.metrics[name];
        const [good, needsImprovement, poor] = [0, 1, 2].map((bin) => histogram[bin]?.density ?? 0);
        return {
          day: last,
          scope,
          formFactor,
          metric,
          p75: Number(percentiles.p75),
          good,
          needsImprovement,
          poor,
        };
      });
  }
}

/**
 * Google Search Console, read with an access token of the lab's service account. The workflow gets that token through
 * Workload Identity Federation (google-github-actions/auth): the account has no key, and the token lasts an hour.
 */
export class SearchConsole {
  static PROPERTY = 'sc-domain:eklund.com.br';

  #token;
  #fetch;

  constructor({ token, fetch }) {
    this.#token = token;
    this.#fetch = fetch;
  }

  /** The rows of one day, by page, query, country and device, in the form the collector takes. */
  async rows(day) {
    const { rows = [] } = await JsonRequest.send(
      this.#fetch,
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SearchConsole.PROPERTY)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${this.#token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          startDate: day,
          endDate: day,
          dimensions: ['page', 'query', 'country', 'device'],
          type: 'web',
          rowLimit: 25_000,
        }),
      },
      'Search Console',
    );
    return rows
      .filter(({ keys: [page] }) => SEARCH_PAGE.test(page))
      .map(({ keys: [page, query, country, device], clicks, impressions, position }) => ({
        engine: 'google',
        day,
        page,
        query: SearchText.of(query),
        country: /^[a-z]{3}$/i.test(country) ? country.toLowerCase() : '',
        device: ['desktop', 'mobile', 'tablet'].includes(device?.toLowerCase())
          ? device.toLowerCase()
          : '',
        clicks,
        impressions,
        position,
      }));
  }
}

/** Bing Webmaster Tools: the clicks and impressions of each day, and of each query, of the last months. */
export class BingWebmaster {
  #key;
  #fetch;

  constructor({ key, fetch }) {
    this.#key = key;
    this.#fetch = fetch;
  }

  async rows() {
    const read = async (method) =>
      (
        await JsonRequest.send(
          this.#fetch,
          `https://ssl.bing.com/webmaster/api.svc/json/${method}?${new URLSearchParams({
            siteUrl: `${SITE}/`,
            apikey: this.#key,
          })}`,
          {},
          `Bing Webmaster Tools (${method})`,
        )
      ).d ?? [];
    const row = (entry, query, position) => ({
      engine: 'bing',
      day: BingWebmaster.day(entry.Date),
      page: '',
      query,
      country: '',
      device: '',
      clicks: entry.Clicks,
      impressions: entry.Impressions,
      position,
    });
    return [
      ...(await read('GetRankAndTrafficStats')).map((entry) => row(entry, '', null)),
      ...(await read('GetQueryStats')).map((entry) =>
        row(
          entry,
          SearchText.of(entry.Query),
          entry.AvgImpressionPosition >= 0 ? entry.AvgImpressionPosition : null,
        ),
      ),
    ];
  }

  /** The day of a date as the API writes it, `/Date(1730880000000-0800)/`: milliseconds since 1970, read in UTC. */
  static day(date) {
    const [, milliseconds] = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(date) ?? [];
    if (!milliseconds) throw new Error(`Bing Webmaster Tools wrote a date as ${date}`);
    return Day.of(Number(milliseconds));
  }
}

/** The certificate a host presents: when it expires and who issued it. Read whether or not it is still valid. */
export class Certificates {
  #port;

  constructor({ port = 443 } = {}) {
    this.#port = port;
  }

  read(host) {
    return new Promise((done, fail) => {
      const socket = connect({
        host,
        port: this.#port,
        servername: /^[\d.]+$/.test(host) ? undefined : host,
        rejectUnauthorized: false,
        timeout: 15_000,
      });
      socket.once('secureConnect', () => {
        const { valid_to: validTo, issuer } = socket.getPeerCertificate();
        socket.end();
        done({ validTo: Date.parse(validTo), issuer: SearchText.of(issuer?.O ?? issuer?.CN) });
      });
      socket.once('timeout', () => socket.destroy(new Error(`${host} did not answer in 15 s`)));
      socket.once('error', fail);
    });
  }
}

/** Sends what the lab found to the collector, with the token of the lab routes. */
export class LabSender {
  #endpoint;
  #token;
  #fetch;

  constructor({ endpoint, token, fetch }) {
    this.#endpoint = endpoint;
    this.#token = token;
    this.#fetch = fetch;
  }

  send(batch) {
    return this.#request('POST', '/v1/lab', JSON.stringify(batch), 'application/json');
  }

  keep(key, report) {
    return this.#request(
      'PUT',
      `/v1/lab/report/${key}`,
      JSON.stringify(report),
      'application/json',
    );
  }

  async #request(method, path, body, type) {
    const response = await this.#fetch(`${this.#endpoint}${path}`, {
      method,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { authorization: `Bearer ${this.#token}`, 'content-type': type },
    });
    if (!response.ok)
      throw new Error(
        `the collector answered ${response.status} to ${method} ${path}: ${(await response.text()).trim()}`,
      );
  }
}

/** One night of the lab: every source that has its key, then the batches to the collector. */
export class LabRun {
  #sources;
  #sender;
  #clock;
  #log;

  /** `sources` holds pageSpeed, crux, searchConsole and bing, each null when its key is missing, and certificates. */
  constructor({ sources, sender, clock = Date, log = () => {} }) {
    this.#sources = sources;
    this.#sender = sender;
    this.#clock = clock;
    this.#log = log;
  }

  /** The sources and the sender that the environment of the workflow gives. */
  static fromEnvironment(env, fetch) {
    if (!env.LAB_TOKEN)
      throw new Error('LAB_TOKEN is not set: the collector would refuse every batch');
    const google = env.GOOGLE_API_KEY;
    return {
      sources: {
        pageSpeed: google ? new PageSpeed({ key: google, fetch }) : null,
        crux: google ? new ChromeUxReport({ key: google, fetch }) : null,
        searchConsole: env.GOOGLE_ACCESS_TOKEN
          ? new SearchConsole({ token: env.GOOGLE_ACCESS_TOKEN, fetch })
          : null,
        bing: env.BING_API_KEY ? new BingWebmaster({ key: env.BING_API_KEY, fetch }) : null,
        certificates: new Certificates(),
      },
      sender: new LabSender({
        endpoint: env.LAB_ENDPOINT || 'https://eklund.eklund.workers.dev',
        token: env.LAB_TOKEN,
        fetch,
      }),
    };
  }

  /** Answers the sources that failed, by name. The rows of the others are sent all the same. */
  async run() {
    const now = this.#clock.now();
    const day = Day.of(now);
    const found = { runs: [], field: [], search: [], certificates: [] };
    const failed = [];
    const read = async (name, missing, source, into, collect) => {
      if (!source) return this.#log(`${name}: skipped, ${missing} is not set`);
      /** A part of the source that did not answer: the source fails, and its other parts are kept. */
      const fail = (message) => {
        if (!failed.includes(name)) failed.push(name);
        this.#log(`${name}: ${message}`);
      };
      try {
        const rows = await collect(source, fail);
        found[into].push(...rows);
        this.#log(`${name}: ${rows.length} rows`);
      } catch (error) {
        fail(`failed, ${error.message}`);
      }
    };
    const { pageSpeed, crux, searchConsole, bing, certificates } = this.#sources;
    await read('PageSpeed Insights', 'GOOGLE_API_KEY', pageSpeed, 'runs', (source, fail) =>
      this.#lab(source, day, fail),
    );
    await read('CrUX', 'GOOGLE_API_KEY', crux, 'field', async (source) =>
      (
        await Promise.all(
          ['origin', ...PAGES.map(({ path }) => path)].flatMap((scope) =>
            Object.keys(ChromeUxReport.FORM_FACTORS).map((formFactor) =>
              source.readings(scope, formFactor),
            ),
          ),
        )
      ).flat(),
    );
    // Search Console needs about two days to settle a day's numbers.
    await read('Search Console', 'GOOGLE_ACCESS_TOKEN', searchConsole, 'search', (source) =>
      source.rows(Day.before(now, 3)),
    );
    await read('Bing Webmaster Tools', 'BING_API_KEY', bing, 'search', (source) => source.rows());
    await read('Certificates', 'nothing', certificates, 'certificates', (source) =>
      Promise.all(HOSTS.map(async (host) => ({ day, host, ...(await source.read(host)) }))),
    );
    for (const batch of LabRun.batches(found)) await this.#sender.send(batch);
    return failed;
  }

  /**
   * The runs of every page and strategy, the median of each marked, and its full report kept in R2 first. A page and strategy
   * with no run that worked fails the source, and the others are kept.
   */
  async #lab(pageSpeed, day, fail) {
    const rows = [];
    for (const { path, name } of PAGES)
      for (const formFactor of PageSpeed.STRATEGIES) {
        const runs = [];
        for (let run = 0; run < PageSpeed.RUNS; run++) {
          try {
            const report = await pageSpeed.run(`${SITE}${path}`, formFactor);
            runs.push({ run, report, ...PageSpeed.numbers(report) });
          } catch (error) {
            this.#log(
              `PageSpeed Insights: run ${run} of ${formFactor} ${path} left out, ${error.message}`,
            );
          }
        }
        if (!runs.length) {
          fail(`no run of ${formFactor} ${path} worked`);
          continue;
        }
        const median = PageSpeed.median(runs);
        const key = `${day}/${name}-${formFactor}.json`;
        await this.#sender.keep(key, runs[median].report);
        rows.push(
          ...runs.map(({ report: _full, ...numbers }, index) => ({
            day,
            page: path,
            formFactor,
            ...numbers,
            median: index === median,
            report: index === median ? key : null,
          })),
        );
      }
    return rows;
  }

  /** The rows in batches the collector takes: everything in the first, and the search rows that do not fit in more. */
  static batches({ runs, field, search, certificates }) {
    const batches = [];
    for (let start = 0; start === 0 || start < search.length; start += SEARCH_ROWS_PER_BATCH)
      batches.push({
        v: 1,
        runs: start === 0 ? runs : [],
        field: start === 0 ? field : [],
        search: search.slice(start, start + SEARCH_ROWS_PER_BATCH),
        certificates: start === 0 ? certificates : [],
      });
    return batches;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fetch = globalThis.fetch.bind(globalThis);
  const failed = await new LabRun({
    ...LabRun.fromEnvironment(process.env, fetch),
    log: (line) => console.log(line),
  }).run();
  if (failed.length) {
    console.error(`::error::These sources did not answer: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
}
