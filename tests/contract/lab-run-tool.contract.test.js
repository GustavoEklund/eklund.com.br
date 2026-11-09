import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:tls';
import Ajv from 'ajv';
import {
  BingWebmaster,
  Certificates,
  ChromeUxReport,
  LabRun,
  LabSender,
  PageSpeed,
  SearchConsole,
} from '../../tools/lab-run.mjs';
import { Certificate } from '../../tools/production-server.mjs';

const SCHEMA = JSON.parse(
  readFileSync(new URL('./schemas/lab-batch.schema.json', import.meta.url), 'utf8'),
);
const validate = new Ajv({ allErrors: true, strict: true }).compile(SCHEMA);
/** 04:23 in Taubaté on 9 November 2026, when the workflow runs. */
const NOW = Date.parse('2026-11-09T07:23:00Z');
const clock = { now: () => NOW };
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A Lighthouse report with this score and these values of the six audits the collector keeps. */
const lighthouse = (
  score,
  [lcp, fcp, cls, tbt, speedIndex, ttfb] = [2_600, 1_200, 0, 600, 2_900, 120],
) => ({
  categories: { performance: { score } },
  audits: {
    'largest-contentful-paint': { numericValue: lcp },
    'first-contentful-paint': { numericValue: fcp },
    'cumulative-layout-shift': { numericValue: cls },
    'total-blocking-time': { numericValue: tbt },
    'speed-index': { numericValue: speedIndex },
    'server-response-time': { numericValue: ttfb },
  },
});

describe('PageSpeed', () => {
  it('asks the API for one performance run of a page and answers its Lighthouse report', async () => {
    const asked = [];
    const report = await new PageSpeed({
      key: 'a-key',
      fetch: async (url) => {
        asked.push(url);
        return json({ lighthouseResult: lighthouse(0.8) });
      },
    }).run('https://eklund.com.br/en/', 'desktop');
    expect([asked, report]).toStrictEqual([
      [
        'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https%3A%2F%2Feklund.com.br%2Fen%2F&strategy=desktop&category=performance&key=a-key',
      ],
      lighthouse(0.8),
    ]);
  });

  it('fails a run that Lighthouse could not measure, or that the API refused', async () => {
    const answering = (response) => new PageSpeed({ key: 'k', fetch: async () => response });
    await expect(
      answering(json({ lighthouseResult: { runtimeError: { code: 'NO_FCP' } } })).run(
        'u',
        'mobile',
      ),
    ).rejects.toThrow('Lighthouse: NO_FCP');
    await expect(answering(json({}, 429)).run('https://eklund.com.br/', 'mobile')).rejects.toThrow(
      'PageSpeed Insights (mobile https://eklund.com.br/) answered 429',
    );
  });

  it('keeps the score and the six numbers of a report, and refuses a report without one of them', () => {
    const partial = lighthouse(0.9);
    delete partial.audits['server-response-time'];
    expect(
      PageSpeed.numbers(lighthouse(0.81, [2_612.5, 1_204, 0.01, 663.25, 2_890, 95])),
    ).toStrictEqual({
      score: 0.81,
      lcp: 2_612.5,
      fcp: 1_204,
      cls: 0.01,
      tbt: 663.25,
      speedIndex: 2_890,
      ttfb: 95,
    });
    expect(() => PageSpeed.numbers(partial)).toThrow('the report has no server-response-time');
  });

  it('picks the run in the middle by score, the lower middle one of an even count', () => {
    const scores = (...list) => list.map((score) => ({ score }));
    expect([
      PageSpeed.median(scores(0.8, 0.95, 0.7, 0.9, 0.85)),
      PageSpeed.median(scores(0.5, 0.9, 0.7, 0.6)),
      PageSpeed.median(scores(0.4)),
    ]).toStrictEqual([4, 3, 0]);
  });
});

describe('ChromeUxReport', () => {
  const record = {
    record: {
      collectionPeriod: { lastDate: { year: 2026, month: 11, day: 7 } },
      metrics: {
        largest_contentful_paint: {
          histogram: [{ density: 0.79 }, { density: 0.15 }, { density: 0.06 }],
          percentiles: { p75: 2_350 },
        },
        cumulative_layout_shift: {
          histogram: [{ density: 0.97 }, { density: 0.02 }],
          percentiles: { p75: '0.01' },
        },
      },
    },
  };

  it('asks for the origin or a page, reads p75 and the three shares of each metric there is', async () => {
    const asked = [];
    const crux = new ChromeUxReport({
      key: 'a-key',
      fetch: async (url, init) => {
        asked.push([url, init.method, JSON.parse(init.body)]);
        return json(record);
      },
    });
    const metrics = Object.keys(ChromeUxReport.METRICS);
    expect([
      await crux.readings('origin', 'phone'),
      await crux.readings('/en/', 'desktop'),
      asked,
    ]).toStrictEqual([
      [
        {
          day: '2026-11-07',
          scope: 'origin',
          formFactor: 'phone',
          metric: 'LCP',
          p75: 2_350,
          good: 0.79,
          needsImprovement: 0.15,
          poor: 0.06,
        },
        {
          day: '2026-11-07',
          scope: 'origin',
          formFactor: 'phone',
          metric: 'CLS',
          p75: 0.01,
          good: 0.97,
          needsImprovement: 0.02,
          poor: 0,
        },
      ],
      [
        {
          day: '2026-11-07',
          scope: '/en/',
          formFactor: 'desktop',
          metric: 'LCP',
          p75: 2_350,
          good: 0.79,
          needsImprovement: 0.15,
          poor: 0.06,
        },
        {
          day: '2026-11-07',
          scope: '/en/',
          formFactor: 'desktop',
          metric: 'CLS',
          p75: 0.01,
          good: 0.97,
          needsImprovement: 0.02,
          poor: 0,
        },
      ],
      [
        [
          'https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=a-key',
          'POST',
          { origin: 'https://eklund.com.br', formFactor: 'PHONE', metrics },
        ],
        [
          'https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=a-key',
          'POST',
          { url: 'https://eklund.com.br/en/', formFactor: 'DESKTOP', metrics },
        ],
      ],
    ]);
  });

  it('reads no rows when CrUX has too few visits to say (404), and fails on any other error', async () => {
    const answering = (status) =>
      new ChromeUxReport({ key: 'k', fetch: async () => json({ error: {} }, status) });
    expect(await answering(404).readings('/', 'phone')).toStrictEqual([]);
    await expect(answering(403).readings('/', 'phone')).rejects.toThrow(
      'CrUX (phone /) answered 403',
    );
  });
});

describe('SearchConsole', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = {
    client_email: 'lab@eklund-lab.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };

  it('trades a signed token for access, then reads the day by page, query, country and device', async () => {
    const asked = [];
    const rows = await new SearchConsole({
      account,
      clock,
      fetch: async (url, init) => {
        asked.push([url, init.method, init.headers, init.body]);
        return url.startsWith('https://oauth2')
          ? json({ access_token: 'an-access-token' })
          : json({
              rows: [
                {
                  keys: ['https://eklund.com.br/', 'gustavo eklund', 'bra', 'MOBILE'],
                  clicks: 3,
                  impressions: 12,
                  ctr: 0.25,
                  position: 1.5,
                },
                {
                  keys: [
                    'https://eklund.com.br/en/',
                    `x\u0007${'y'.repeat(300)}`,
                    'zzz',
                    'DESKTOP',
                  ],
                  clicks: 0,
                  impressions: 1,
                  ctr: 0,
                  position: 8,
                },
                {
                  keys: ['http://eklund.com.br/', 'old address', 'bra', 'MOBILE'],
                  clicks: 1,
                  impressions: 1,
                  ctr: 1,
                  position: 1,
                },
              ],
            });
      },
    }).rows('2026-11-06');
    const assertion = new URLSearchParams(asked[0][3]).get('assertion');
    const [header, claims, signature] = assertion.split('.');
    const decoded = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    expect([
      decoded(header),
      decoded(claims),
      createVerify('RSA-SHA256')
        .update(`${header}.${claims}`)
        .verify(publicKey, signature, 'base64url'),
      asked.map(([url, method]) => [url, method]),
      asked[1][2],
      JSON.parse(asked[1][3]),
      rows,
    ]).toStrictEqual([
      { alg: 'RS256', typ: 'JWT' },
      {
        iss: 'lab@eklund-lab.iam.gserviceaccount.com',
        scope: 'https://www.googleapis.com/auth/webmasters.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        iat: NOW / 1_000,
        exp: NOW / 1_000 + 3_600,
      },
      true,
      [
        ['https://oauth2.googleapis.com/token', 'POST'],
        [
          'https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Aeklund.com.br/searchAnalytics/query',
          'POST',
        ],
      ],
      { authorization: 'Bearer an-access-token', 'content-type': 'application/json' },
      {
        startDate: '2026-11-06',
        endDate: '2026-11-06',
        dimensions: ['page', 'query', 'country', 'device'],
        type: 'web',
        rowLimit: 25_000,
      },
      [
        {
          engine: 'google',
          day: '2026-11-06',
          page: 'https://eklund.com.br/',
          query: 'gustavo eklund',
          country: 'bra',
          device: 'mobile',
          clicks: 3,
          impressions: 12,
          position: 1.5,
        },
        {
          engine: 'google',
          day: '2026-11-06',
          page: 'https://eklund.com.br/en/',
          query: `x ${'y'.repeat(198)}`,
          country: 'zzz',
          device: 'desktop',
          clicks: 0,
          impressions: 1,
          position: 8,
        },
      ],
    ]);
  });

  it('fails when Google refuses the token', async () => {
    await expect(
      new SearchConsole({ account, clock, fetch: async () => json({}, 400) }).rows('2026-11-06'),
    ).rejects.toThrow('Google OAuth answered 400');
  });
});

describe('BingWebmaster', () => {
  it('reads the totals of each day and the rows of each query, with no page, country or device', async () => {
    const asked = [];
    const rows = await new BingWebmaster({
      key: 'a-key',
      fetch: async (url) => {
        asked.push(url);
        return json({
          d: url.includes('GetRankAndTrafficStats')
            ? [{ Clicks: 1, Impressions: 4, Date: '/Date(1793952000000-0800)/' }]
            : [
                {
                  Query: 'eklund',
                  Clicks: 1,
                  Impressions: 3,
                  AvgImpressionPosition: 2.5,
                  AvgClickPosition: 1,
                  Date: '/Date(1793952000000)/',
                },
                {
                  Query: 'pix',
                  Clicks: 0,
                  Impressions: 1,
                  AvgImpressionPosition: -1,
                  AvgClickPosition: -1,
                  Date: '/Date(1793952000000)/',
                },
              ],
        });
      },
    }).rows();
    const bing = { engine: 'bing', day: '2026-11-06', page: '', country: '', device: '' };
    expect([asked, rows]).toStrictEqual([
      [
        'https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats?siteUrl=https%3A%2F%2Feklund.com.br%2F&apikey=a-key',
        'https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats?siteUrl=https%3A%2F%2Feklund.com.br%2F&apikey=a-key',
      ],
      [
        { ...bing, query: '', clicks: 1, impressions: 4, position: null },
        { ...bing, query: 'eklund', clicks: 1, impressions: 3, position: 2.5 },
        { ...bing, query: 'pix', clicks: 0, impressions: 1, position: null },
      ],
    ]);
  });

  it('reads the day of a date in UTC, and fails on a date in another form', () => {
    expect(BingWebmaster.day('/Date(1794009599999+0100)/')).toBe('2026-11-06');
    expect(() => BingWebmaster.day('2026-11-06')).toThrow(
      'Bing Webmaster Tools wrote a date as 2026-11-06',
    );
  });
});

describe('Certificates', () => {
  let server;
  let port;

  beforeAll(async () => {
    server = createServer(Certificate.create(), (socket) => socket.end());
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    port = server.address().port;
  }, 30_000);
  afterAll(() => new Promise((done) => server.close(done)));

  it('reads when the certificate of a host expires, and who issued it, even when no authority signed it (its name stands for the missing organization)', async () => {
    const { validTo, issuer } = await new Certificates({ port }).read('127.0.0.1');
    const day = 86_400_000;
    expect([validTo > Date.now(), validTo < Date.now() + 2 * day, issuer]).toStrictEqual([
      true,
      true,
      '127.0.0.1',
    ]);
  });

  it('fails when nothing answers', async () => {
    await expect(new Certificates({ port: 1 }).read('127.0.0.1')).rejects.toThrow('ECONNREFUSED');
  });
});

describe('LabSender', () => {
  it('posts a batch and puts a report with the token, and fails loudly on a refusal', async () => {
    const asked = [];
    const sender = (status) =>
      new LabSender({
        endpoint: 'https://collector.example',
        token: 'a-token',
        fetch: async (url, init) => {
          asked.push([url, init.method, init.headers, init.body]);
          return new Response(
            status === 204 ? null : 'runs[0].page is not one of the allowed values\n',
            { status },
          );
        },
      });
    await sender(204).send({ v: 1 });
    await sender(204).keep('2026-11-09/home-mobile.json', { a: 1 });
    await expect(sender(400).send({ v: 1 })).rejects.toThrow(
      'the collector answered 400 to POST /v1/lab: runs[0].page is not one of the allowed values',
    );
    const headers = { authorization: 'Bearer a-token', 'content-type': 'application/json' };
    expect(asked.slice(0, 2)).toStrictEqual([
      ['https://collector.example/v1/lab', 'POST', headers, '{"v":1}'],
      [
        'https://collector.example/v1/lab/report/2026-11-09/home-mobile.json',
        'PUT',
        headers,
        '{"a":1}',
      ],
    ]);
  });
});

describe('LabRun', () => {
  /** Sources that answer at once: five runs a page and strategy, scores going down, and one reading or row of each kind. */
  const sources = (overrides = {}) => {
    let score = 1;
    return {
      pageSpeed: {
        run: async () => lighthouse((score = Math.round((score - 0.01) * 100) / 100)),
      },
      crux: {
        readings: async (scope, formFactor) =>
          scope === 'origin'
            ? [
                {
                  day: '2026-11-07',
                  scope,
                  formFactor,
                  metric: 'LCP',
                  p75: 2_350,
                  good: 0.79,
                  needsImprovement: 0.15,
                  poor: 0.06,
                },
              ]
            : [],
      },
      searchConsole: {
        rows: async (day) => [
          {
            engine: 'google',
            day,
            page: 'https://eklund.com.br/',
            query: 'eklund',
            country: 'bra',
            device: 'mobile',
            clicks: 1,
            impressions: 2,
            position: 1,
          },
        ],
      },
      bing: { rows: async () => [] },
      certificates: { read: async () => ({ validTo: 1_799_000_000_000, issuer: "Let's Encrypt" }) },
      ...overrides,
    };
  };
  const recorder = () => {
    const sent = { batches: [], reports: [] };
    return {
      sent,
      sender: {
        send: async (batch) => sent.batches.push(batch),
        keep: async (key, report) => sent.reports.push([key, report.categories.performance.score]),
      },
    };
  };

  it('sends one batch the contract allows, with the median of each page and strategy kept in R2', async () => {
    const { sent, sender } = recorder();
    const log = [];
    const failed = await new LabRun({
      sources: sources(),
      sender,
      clock,
      log: (line) => log.push(line),
    }).run();
    const [batch] = sent.batches;
    expect([
      failed,
      sent.batches.length,
      validate(batch),
      batch.runs.length,
      batch.runs
        .filter((run) => run.median)
        .map(({ page, formFactor, run, score, report }) => [page, formFactor, run, score, report]),
      sent.reports,
      batch.field.length,
      batch.search.map(({ day }) => day),
      batch.certificates.map(({ day, host }) => [day, host]),
      log,
    ]).toStrictEqual([
      [],
      1,
      true,
      20,
      [
        ['/', 'mobile', 2, 0.97, '2026-11-09/home-mobile.json'],
        ['/', 'desktop', 2, 0.92, '2026-11-09/home-desktop.json'],
        ['/en/', 'mobile', 2, 0.87, '2026-11-09/en-mobile.json'],
        ['/en/', 'desktop', 2, 0.82, '2026-11-09/en-desktop.json'],
      ],
      [
        ['2026-11-09/home-mobile.json', 0.97],
        ['2026-11-09/home-desktop.json', 0.92],
        ['2026-11-09/en-mobile.json', 0.87],
        ['2026-11-09/en-desktop.json', 0.82],
      ],
      2,
      ['2026-11-06'],
      [
        ['2026-11-09', 'eklund.com.br'],
        ['2026-11-09', 'gustavo.eklund.com.br'],
      ],
      [
        'PageSpeed Insights: 20 rows',
        'CrUX: 2 rows',
        'Search Console: 1 rows',
        'Bing Webmaster Tools: 0 rows',
        'Certificates: 2 rows',
      ],
    ]);
  });

  it('leaves out a source without its key, and one that fails, and still sends the others', async () => {
    const { sent, sender } = recorder();
    const log = [];
    const failed = await new LabRun({
      sources: sources({
        pageSpeed: null,
        crux: null,
        bing: {
          rows: async () =>
            Promise.reject(new Error('Bing Webmaster Tools (GetQueryStats) answered 401')),
        },
      }),
      sender,
      clock,
      log: (line) => log.push(line),
    }).run();
    expect([failed, sent.batches.map(validate), sent.batches[0].search.length, log]).toStrictEqual([
      ['Bing Webmaster Tools'],
      [true],
      1,
      [
        'PageSpeed Insights: skipped, GOOGLE_API_KEY is not set',
        'CrUX: skipped, GOOGLE_API_KEY is not set',
        'Search Console: 1 rows',
        'Bing Webmaster Tools: failed, Bing Webmaster Tools (GetQueryStats) answered 401',
        'Certificates: 2 rows',
      ],
    ]);
  });

  it('leaves out a run Lighthouse could not measure, and fails the source for a page and strategy with no run, keeping the rest', async () => {
    let call = 0;
    const flaky = {
      run: async (url, strategy) => {
        call++;
        if (strategy === 'desktop' && url.endsWith('/en/')) throw new Error('Lighthouse: NO_FCP');
        if (call === 2) throw new Error('Lighthouse: NO_LCP');
        return lighthouse(0.9);
      },
    };
    const { sent, sender } = recorder();
    const log = [];
    const failed = await new LabRun({
      sources: sources({ pageSpeed: flaky }),
      sender,
      clock,
      log: (line) => log.push(line),
    }).run();
    const runs = sent.batches[0].runs;
    expect([
      failed,
      validate(sent.batches[0]),
      [runs.length, runs.filter(({ median }) => median).map(({ report }) => report)],
      sent.reports.map(([key]) => key),
      log.slice(0, 8),
    ]).toStrictEqual([
      ['PageSpeed Insights'],
      true,
      [
        14,
        [
          '2026-11-09/home-mobile.json',
          '2026-11-09/home-desktop.json',
          '2026-11-09/en-mobile.json',
        ],
      ],
      ['2026-11-09/home-mobile.json', '2026-11-09/home-desktop.json', '2026-11-09/en-mobile.json'],
      [
        'PageSpeed Insights: run 1 of mobile / left out, Lighthouse: NO_LCP',
        ...[0, 1, 2, 3, 4].map(
          (run) => `PageSpeed Insights: run ${run} of desktop /en/ left out, Lighthouse: NO_FCP`,
        ),
        'PageSpeed Insights: no run of desktop /en/ worked',
        'PageSpeed Insights: 14 rows',
      ],
    ]);
  });

  it('splits search rows into batches of 500, the first one carrying everything else', () => {
    const search = Array.from({ length: 1_001 }, (_, index) => index);
    expect(
      LabRun.batches({ runs: ['r'], field: ['f'], search, certificates: ['c'] }).map((batch) => [
        batch.v,
        batch.runs,
        batch.field,
        batch.search.length,
        batch.certificates,
      ]),
    ).toStrictEqual([
      [1, ['r'], ['f'], 500, ['c']],
      [1, [], [], 500, []],
      [1, [], [], 1, []],
    ]);
  });

  it('builds a source only for the keys the environment has, and refuses to start without the token', () => {
    const { sources: built } = LabRun.fromEnvironment(
      { LAB_TOKEN: 't', GOOGLE_API_KEY: 'g' },
      fetch,
    );
    expect([
      Object.entries(built).map(([name, source]) => [name, source?.constructor.name ?? null]),
      LabRun.batches({ runs: [], field: [], search: [], certificates: [] }).length,
    ]).toStrictEqual([
      [
        ['pageSpeed', 'PageSpeed'],
        ['crux', 'ChromeUxReport'],
        ['searchConsole', null],
        ['bing', null],
        ['certificates', 'Certificates'],
      ],
      1,
    ]);
    expect(() => LabRun.fromEnvironment({}, fetch)).toThrow(
      'LAB_TOKEN is not set: the collector would refuse every batch',
    );
  });
});
