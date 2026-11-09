import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MannWhitney } from '../../edge/src/mann-whitney.js';
import { ReadingQueries } from '../../edge/src/reading-queries.js';
import { EdgeWorker } from '../support/edge-worker.js';

const HOME = 'https://eklund.com.br/';
const ENGLISH = 'https://eklund.com.br/en/';
/** Midnight of 9 November 2026, UTC. */
const NOW = Date.parse('2026-11-09T00:00:00Z');
const WEEK = { from: '2026-11-01', to: '2026-11-08' };

describe('ReadingQueries, against D1 in workerd', () => {
  const worker = new EdgeWorker();
  let database;
  let queries;
  let views;

  /** Inserts rows into a table, each an object of its columns. */
  const insert = (table, rows) =>
    database.batch(
      rows.map((row) =>
        database
          .prepare(
            `INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row)
              .map(() => '?')
              .join(', ')})`,
          )
          .bind(...Object.values(row)),
      ),
    );
  /** One load, by a phone in Brazil on the home page of 1.2.0 unless `changes` says otherwise, with its vitals. */
  const load = async (changes, vitals) => {
    views += 1;
    const id = `view-${views}`;
    await insert('page_view', [
      {
        id,
        day: '2026-11-03',
        first_seen: views,
        last_seen: views,
        host: 'eklund.com.br',
        page: '/',
        version: '1.2.0',
        language: 'pt-BR',
        country: 'BR',
        device: 'phone',
        browser: 'chrome',
        viewport: '360-413',
        pixel_ratio: '3+',
        memory: '4',
        cores: '5-8',
        round_trip: '100-299',
        save_data: 0,
        color_scheme: 'dark',
        reduced_motion: 0,
        navigation: 'navigate',
        visible_ms: 1_000,
        ...changes,
      },
    ]);
    await insert(
      'vital',
      vitals.map(([name, value, rating]) => ({
        view_id: id,
        name,
        value,
        rating,
        attribution: '{}',
      })),
    );
  };
  /** The five lab runs of a night; the third is the median, and its LCP is `lcp`. */
  const night = (day, lcp, page = '/', formFactor = 'mobile') =>
    [0, 1, 2, 3, 4].map((run) => ({
      day,
      page,
      form_factor: formFactor,
      run,
      median: run === 2 ? 1 : 0,
      score: 0.9,
      lcp_ms: lcp + (run - 2) * 10,
      fcp_ms: 800,
      cls: 0,
      tbt_ms: 100,
      speed_index_ms: 1_200,
      ttfb_ms: 50,
      report: run === 2 ? `${day}/home-mobile.json` : null,
    }));
  const days = (first, count) =>
    Array.from({ length: count }, (_, index) =>
      new Date(Date.parse(`${first}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10),
    );

  beforeAll(() => worker.start(), EdgeWorker.START_TIMEOUT_MS);
  afterAll(() => worker.stop());
  beforeEach(async () => {
    await worker.reset();
    database = await worker.database();
    queries = new ReadingQueries({ db: database, clock: { now: () => NOW } });
    views = 0;
  });

  it('gives the views of a period from the daily totals, and the most common value of each column', async () => {
    const row = (
      day,
      host,
      page,
      version,
      language,
      device,
      browser,
      country,
      referrer,
      count,
    ) => ({
      day,
      host,
      page,
      version,
      language,
      device,
      browser,
      country,
      referrer,
      views: count,
      visible_ms: 1_000,
    });
    await insert('daily_view', [
      row('2026-11-01', 'eklund.com.br', '/', '1.2.0', 'pt-BR', 'phone', 'chrome', 'BR', '', 12),
      row(
        '2026-11-02',
        'eklund.com.br',
        '/en/',
        '1.2.0',
        'en-US',
        'desktop',
        'firefox',
        'US',
        'www.google.com',
        5,
      ),
      row(
        '2026-11-02',
        'gustavo.eklund.com.br',
        '/',
        '1.1.0',
        'pt-BR',
        'desktop',
        'chrome',
        '',
        '',
        3,
      ),
      row('2026-10-20', 'eklund.com.br', '/', '1.1.0', 'pt-BR', 'phone', 'chrome', 'BR', '', 100),
    ]);
    const top = (...pairs) => pairs.map(([value, count]) => ({ value, views: count }));
    expect(await queries.run('overview', WEEK)).toStrictEqual({
      ...WEEK,
      views: 20,
      days_with_totals: 2,
      top: {
        page: top(['/', 15], ['/en/', 5]),
        language: top(['pt-BR', 15], ['en-US', 5]),
        device: top(['phone', 12], ['desktop', 8]),
        browser: top(['chrome', 15], ['firefox', 5]),
        country: top(['BR', 12], ['US', 5], ['', 3]),
        referrer: top(['', 15], ['www.google.com', 5]),
        version: top(['1.2.0', 17], ['1.1.0', 3]),
        host: top(['eklund.com.br', 17], ['gustavo.eklund.com.br', 3]),
      },
      sample: { size: 20, minimum: 20, enough: true },
    });
  });

  it("gives each vital's 75th percentile and shares from the loads' own rows, with the filters it is given", async () => {
    await load({}, [
      ['LCP', 1_000, 'good'],
      ['INP', 100, 'good'],
    ]);
    await load({}, [['LCP', 2_000, 'good']]);
    await load({}, [['LCP', 3_000, 'needs-improvement']]);
    await load({}, [['LCP', 5_000, 'poor']]);
    await load({ page: '/en/', device: 'desktop' }, [['LCP', 1_500, 'good']]);
    await load({ day: '2026-10-01' }, [['LCP', 9_000, 'poor']]);
    const lcp = (p75, [good, middle, poor], loads) => ({
      metric: 'LCP',
      p75,
      good,
      needs_improvement: middle,
      poor,
      sample: { size: loads, minimum: 20, enough: false },
    });
    expect([
      await queries.run('vitals', { ...WEEK, page: '/' }),
      (await queries.run('vitals', WEEK)).metrics[1],
      (await queries.run('vitals', { ...WEEK, device: 'desktop', version: '1.2.0' })).metrics,
    ]).toStrictEqual([
      {
        ...WEEK,
        page: '/',
        device: null,
        version: null,
        metrics: [
          {
            metric: 'INP',
            p75: 100,
            good: 1,
            needs_improvement: 0,
            poor: 0,
            sample: { size: 1, minimum: 20, enough: false },
          },
          lcp(3_000, [0.5, 0.25, 0.25], 4),
        ],
      },
      lcp(3_000, [0.6, 0.2, 0.2], 5),
      [lcp(1_500, [1, 0, 0], 1)],
    ]);
  });

  it('compares a vital between two releases, and says when a release has too few loads', async () => {
    const before = Array.from({ length: 20 }, (_, index) => 2_000 + index * 10);
    const after = Array.from({ length: 20 }, (_, index) => 1_500 + index * 10);
    for (const value of before) await load({ version: '1.1.0' }, [['LCP', value, 'good']]);
    for (const value of after) await load({ version: '1.2.0' }, [['LCP', value, 'good']]);
    await load({ version: '1.0.0' }, [['LCP', 900, 'good']]);
    const compared = await queries.run('compare_vitals', {
      metric: 'LCP',
      before: '1.1.0',
      after: '1.2.0',
    });
    const short = await queries.run('compare_vitals', {
      metric: 'LCP',
      before: '1.0.0',
      after: '1.2.0',
      device: 'phone',
    });
    expect([compared, [short.before, short.sample.enough, short.verdict]]).toStrictEqual([
      {
        metric: 'LCP',
        page: null,
        device: null,
        before: { name: '1.1.0', values: 20, median: 2_090, p75: 2_140 },
        after: { name: '1.2.0', values: 20, median: 1_590, p75: 1_640 },
        test: MannWhitney.test(before, after),
        sample: {
          before: { size: 20, minimum: 20, enough: true },
          after: { size: 20, minimum: 20, enough: true },
          enough: true,
        },
        verdict: 'after is better',
      },
      [{ name: '1.0.0', values: 1, median: 900, p75: 900 }, false, 'too few values to compare'],
    ]);
  });

  it('adds up the engagement events and the errors of a period, most frequent first', async () => {
    await insert('daily_event', [
      { day: '2026-11-02', page: '/', version: '1.2.0', name: 'section', detail: 'hero', total: 4 },
      { day: '2026-11-03', page: '/', version: '1.2.0', name: 'section', detail: 'hero', total: 2 },
      {
        day: '2026-11-03',
        page: '/en/',
        version: '1.2.0',
        name: 'theme',
        detail: 'dark',
        total: 3,
      },
      {
        day: '2026-10-01',
        page: '/',
        version: '1.1.0',
        name: 'section',
        detail: 'hero',
        total: 50,
      },
    ]);
    const error = (day, version, kind, message, total) => ({
      day,
      version,
      kind,
      source: '/assets/main-AbC123.js',
      message,
      total,
    });
    await insert('daily_error', [
      error('2026-11-02', '1.2.0', 'error', 'TypeError: x is null', 2),
      error('2026-11-03', '1.1.0', 'rejection', 'boom', 1),
    ]);
    expect([
      await queries.run('events', WEEK),
      (await queries.run('events', { ...WEEK, page: '/en/' })).events,
      await queries.run('errors', { ...WEEK, version: '1.2.0' }),
    ]).toStrictEqual([
      {
        ...WEEK,
        page: null,
        events: [
          { name: 'section', detail: 'hero', total: 6 },
          { name: 'theme', detail: 'dark', total: 3 },
        ],
        sample: { size: 9, minimum: 20, enough: false },
      },
      [{ name: 'theme', detail: 'dark', total: 3 }],
      {
        ...WEEK,
        version: '1.2.0',
        errors: [
          {
            kind: 'error',
            source: '/assets/main-AbC123.js',
            message: 'TypeError: x is null',
            total: 2,
          },
        ],
        sample: { size: 2, minimum: 20, enough: false },
      },
    ]);
  });

  it('gives the availability of each page in a period and whether one is failing now', async () => {
    await insert('daily_uptime', [
      { day: '2026-11-01', target: HOME, checks: 288, failures: 0, p50_ms: 120, p95_ms: 300 },
      { day: '2026-11-02', target: HOME, checks: 288, failures: 2, p50_ms: 140, p95_ms: 900 },
      { day: '2026-11-01', target: ENGLISH, checks: 288, failures: 0, p50_ms: 100, p95_ms: 200 },
    ]);
    await insert('uptime_target', [
      { target: HOME, failures: 0, failing_since: null, issue: null },
      { target: ENGLISH, failures: 2, failing_since: 1_794_200_000_000, issue: 42 },
    ]);
    expect(await queries.run('uptime', WEEK)).toStrictEqual({
      ...WEEK,
      pages: [
        {
          target: HOME,
          days: 2,
          checks: 576,
          failures: 2,
          typical_ms: 130,
          worst_p95_ms: 900,
          availability: 0.99653,
        },
        {
          target: ENGLISH,
          days: 1,
          checks: 288,
          failures: 0,
          typical_ms: 100,
          worst_p95_ms: 200,
          availability: 1,
        },
      ],
      now: [
        { target: HOME, failing: false, failures_in_a_row: 0, failing_since: null, issue: null },
        {
          target: ENGLISH,
          failing: true,
          failures_in_a_row: 2,
          failing_since: new Date(1_794_200_000_000).toISOString(),
          issue: 42,
        },
      ],
      sample: { size: 864, minimum: 20, enough: true },
    });
  });

  it("gives the lab's median run of each night, counting nights against the series minimum", async () => {
    await insert('lab_run', [
      ...night('2026-11-01', 2_000),
      ...night('2026-11-02', 2_100),
      ...night('2026-11-02', 900, '/en/', 'desktop'),
    ]);
    const median = (day, lcp) => ({
      day,
      page: '/',
      form_factor: 'mobile',
      score: 0.9,
      lcp_ms: lcp,
      fcp_ms: 800,
      cls: 0,
      tbt_ms: 100,
      speed_index_ms: 1_200,
      ttfb_ms: 50,
      report: `${day}/home-mobile.json`,
    });
    expect(await queries.run('lab', { ...WEEK, form_factor: 'mobile' })).toStrictEqual({
      ...WEEK,
      page: null,
      form_factor: 'mobile',
      runs: [median('2026-11-01', 2_000), median('2026-11-02', 2_100)],
      sample: { size: 2, minimum: 14, enough: false },
    });
  });

  it('compares the lab runs of two periods, every run counting, and calls a higher score better', async () => {
    const before = days('2026-10-01', 4);
    const after = days('2026-10-05', 4);
    await insert('lab_run', [
      ...before.flatMap((day) => night(day, 2_000)),
      ...after.flatMap((day) => night(day, 1_500)),
    ]);
    const periods = {
      page: '/',
      form_factor: 'mobile',
      before_from: before[0],
      before_to: before[3],
      after_from: after[0],
      after_to: after[3],
    };
    const values = (lcp) => before.flatMap(() => [-20, -10, 0, 10, 20].map((step) => lcp + step));
    const lcp = await queries.run('compare_lab', { metric: 'lcp', ...periods });
    const score = await queries.run('compare_lab', { metric: 'score', ...periods });
    expect([
      [lcp.before, lcp.after, lcp.verdict],
      lcp.test,
      [score.test.p, score.verdict],
    ]).toStrictEqual([
      [
        { name: '2026-10-01 to 2026-10-04', values: 20, median: 2_000, p75: 2_010 },
        { name: '2026-10-05 to 2026-10-08', values: 20, median: 1_500, p75: 1_510 },
        'after is better',
      ],
      MannWhitney.test(values(2_000), values(1_500)),
      [1, 'no clear difference'],
    ]);
  });

  it("finds the night the lab's median moved to a new level, once there are enough nights", async () => {
    const all = days('2026-10-01', 16);
    const noise = [0, 10, -10, 5, -5, 0, 10, -10];
    await insert(
      'lab_run',
      all.flatMap((day, index) => night(day, (index < 8 ? 2_000 : 1_500) + noise[index % 8])),
    );
    const input = { metric: 'lcp', page: '/', form_factor: 'mobile', from: all[0], to: all[15] };
    const short = await queries.run('lab_change_points', { ...input, to: all[12] });
    expect([
      await queries.run('lab_change_points', input),
      [short.segments, short.sample, short.verdict],
    ]).toStrictEqual([
      {
        ...input,
        segments: [
          { from: all[0], to: all[7], nights: 8, mean: 2_000 },
          { from: all[8], to: all[15], nights: 8, mean: 1_500 },
        ],
        sample: { size: 16, minimum: 14, enough: true },
        verdict: 'the level shifted once',
      },
      [[], { size: 13, minimum: 14, enough: false }, 'too few nights to look for a shift'],
    ]);
  });

  it('gives the latest CrUX reading, and says CrUX gives no counts', async () => {
    const reading = (day, scope, formFactor, metric, p75) => ({
      day,
      scope,
      form_factor: formFactor,
      metric,
      p75,
      good: 0.8,
      needs_improvement: 0.15,
      poor: 0.05,
    });
    await insert('crux_reading', [
      reading('2026-11-07', 'origin', 'phone', 'LCP', 2_400),
      reading('2026-11-08', 'origin', 'phone', 'LCP', 2_300),
      reading('2026-11-08', '/', 'phone', 'LCP', 2_200),
    ]);
    const { day: _day, ...latest } = reading('2026-11-08', 'origin', 'phone', 'LCP', 2_300);
    expect(await queries.run('crux', { scope: 'origin' })).toStrictEqual({
      day: '2026-11-08',
      readings: [latest],
      sample: {
        size: 1,
        minimum: 1,
        enough: true,
        note: 'CrUX gives no counts, and it reports only an origin or a page with enough Chrome visits in 28 days.',
      },
    });
  });

  it("adds up the search rows: Google's rows, Bing's day totals, and the top queries and pages", async () => {
    const row = (engine, page, query, country, device, clicks, impressions, position) => ({
      engine,
      day: '2026-11-02',
      page,
      query,
      country,
      device,
      clicks,
      impressions,
      position,
    });
    await insert('search_row', [
      row('google', HOME, 'gustavo eklund', 'bra', 'mobile', 3, 10, 1.5),
      row('google', ENGLISH, 'pix engineer', 'usa', 'desktop', 1, 20, 4),
      row('bing', '', '', '', '', 2, 30, null),
      row('bing', '', 'gustavo eklund', '', '', 2, 25, 2),
    ]);
    expect([
      await queries.run('search', WEEK),
      (await queries.run('search', { ...WEEK, engine: 'bing' })).pages,
    ]).toStrictEqual([
      {
        ...WEEK,
        engine: null,
        totals: [
          { engine: 'bing', clicks: 2, impressions: 30 },
          { engine: 'google', clicks: 4, impressions: 30 },
        ],
        queries: [
          { engine: 'google', query: 'gustavo eklund', clicks: 3, impressions: 10, position: 1.5 },
          { engine: 'bing', query: 'gustavo eklund', clicks: 2, impressions: 25, position: 2 },
          { engine: 'google', query: 'pix engineer', clicks: 1, impressions: 20, position: 4 },
        ],
        pages: [
          { page: HOME, clicks: 3, impressions: 10 },
          { page: ENGLISH, clicks: 1, impressions: 20 },
        ],
        sample: { size: 60, minimum: 20, enough: true },
      },
      [],
    ]);
  });

  it("gives each host's certificate on the lab's latest night, with the days it has left", async () => {
    await insert('certificate', [
      { day: '2026-11-07', host: 'eklund.com.br', valid_to: 1, issuer: 'Old', problem: null },
      {
        day: '2026-11-08',
        host: 'eklund.com.br',
        valid_to: Date.parse('2027-01-22T10:42:04Z'),
        issuer: "Let's Encrypt",
        problem: null,
      },
      {
        day: '2026-11-08',
        host: 'gustavo.eklund.com.br',
        valid_to: null,
        issuer: '',
        problem: 'CERT_HAS_EXPIRED',
      },
    ]);
    expect(await queries.run('certificates', {})).toStrictEqual({
      day: '2026-11-08',
      certificates: [
        {
          host: 'eklund.com.br',
          issuer: "Let's Encrypt",
          problem: null,
          valid_to: '2027-01-22T10:42:04.000Z',
          days_left: 74,
        },
        {
          host: 'gustavo.eklund.com.br',
          issuer: '',
          problem: 'CERT_HAS_EXPIRED',
          valid_to: null,
          days_left: null,
        },
      ],
      sample: { size: 2, minimum: 1, enough: true },
    });
  });

  it('refuses a reading it does not have', () => {
    expect(() => queries.run('tables', {})).toThrow('no reading is called tables');
  });
});
