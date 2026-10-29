import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PageReport } from '../../edge/src/page-report.js';
import { ReportStore } from '../../edge/src/report-store.js';
import { EdgeWorker } from '../support/edge-worker.js';
import { PageReports } from '../support/page-reports.js';

const CONTEXT = {
  receivedAt: 1_793_241_000_000,
  day: '2026-10-29',
  host: 'eklund.com.br',
  country: 'BR',
  agent: { robot: false, device: 'phone', browser: 'chrome', version: 130 },
};
const readOf = (report) => PageReport.parse(JSON.stringify(report)).report;

describe('ReportStore.save, against D1 in workerd', () => {
  const worker = new EdgeWorker();
  let store;

  beforeAll(() => worker.start(), EdgeWorker.START_TIMEOUT_MS);
  afterAll(() => worker.stop());
  beforeEach(async () => {
    await worker.reset();
    store = new ReportStore(await worker.database());
  });

  it('writes the visit, its metrics, its events and its errors', async () => {
    await store.save(readOf(PageReports.complete()), CONTEXT);
    expect([
      await worker.rows('SELECT * FROM page_view'),
      await worker.rows('SELECT name, value, rating, attribution FROM vital ORDER BY name'),
      await worker.rows(
        'SELECT seq, position, name, detail, value, at_ms FROM event ORDER BY position',
      ),
      await worker.rows(
        'SELECT seq, position, kind, message, source, line, column_number, at_ms FROM error',
      ),
    ]).toStrictEqual([
      [
        {
          id: PageReports.VIEW,
          day: '2026-10-29',
          first_seen: 1_793_241_000_000,
          last_seen: 1_793_241_000_000,
          host: 'eklund.com.br',
          page: '/',
          version: '1.2.0',
          language: 'pt-BR',
          referrer: 'www.google.com',
          country: 'BR',
          device: 'phone',
          browser: 'chrome',
          browser_version: 130,
          viewport: '360-413',
          pixel_ratio: '3+',
          memory: '4',
          cores: '5-8',
          round_trip: '100-299',
          save_data: 0,
          color_scheme: 'dark',
          reduced_motion: 0,
          navigation: 'navigate',
          visible_ms: 5_000,
        },
      ],
      [
        { name: 'CLS', value: 0, rating: 'good', attribution: '{"loadState":"complete"}' },
        {
          name: 'INP',
          value: 96,
          rating: 'good',
          attribution:
            '{"interactionTarget":"button#theme-toggle","interactionType":"pointer","inputDelay":4,"processingDuration":60,"presentationDelay":32,"loadState":"complete","scriptUrl":"/assets/main-AbC123.js","scriptFunction":"toggle","scriptInvoker":"BUTTON#theme-toggle.onclick","scriptSubpart":"processing-duration","scriptDuration":55}',
        },
        {
          name: 'LCP',
          value: 2_100.5,
          rating: 'good',
          attribution:
            '{"target":"section#hero>h1","url":"","timeToFirstByte":120,"resourceLoadDelay":0,"resourceLoadDuration":0,"elementRenderDelay":1980.5}',
        },
      ],
      [
        { seq: 0, position: 0, name: 'section', detail: 'carga', value: null, at_ms: 4_000 },
        { seq: 0, position: 1, name: 'copy-email', detail: null, value: null, at_ms: 4_500 },
        { seq: 0, position: 2, name: 'load-test', detail: 'finish', value: 30_000, at_ms: 34_500 },
      ],
      [
        {
          seq: 0,
          position: 0,
          kind: 'error',
          message: "TypeError: Cannot read properties of undefined (reading 'width')",
          source: '/assets/main-AbC123.js',
          line: 1,
          column_number: 2_345,
          at_ms: 1_200,
        },
      ],
    ]);
  });

  it('updates the same load when it reports again: the last metric, the longest visibility, new events once', async () => {
    await store.save(readOf(PageReports.complete()), CONTEXT);
    const later = readOf(
      PageReports.with((report) => {
        report.seq = 1;
        report.visible = 9_000;
        report.page = '/en/';
        report.vitals = [{ name: 'CLS', value: 0.04, rating: 'good', attribution: {} }];
        report.events = [{ name: 'theme', detail: 'light', at: 8_000 }];
        report.errors = [];
      }),
    );
    await store.save(later, { ...CONTEXT, receivedAt: CONTEXT.receivedAt + 4_000 });
    await store.save(later, { ...CONTEXT, receivedAt: CONTEXT.receivedAt + 4_100 });
    expect([
      await worker.rows('SELECT page, first_seen, last_seen, visible_ms FROM page_view'),
      await worker.rows("SELECT value, attribution FROM vital WHERE name = 'CLS'"),
      await worker.rows('SELECT seq, position, name, detail FROM event ORDER BY seq, position'),
    ]).toStrictEqual([
      [
        {
          page: '/',
          first_seen: 1_793_241_000_000,
          last_seen: 1_793_241_004_100,
          visible_ms: 9_000,
        },
      ],
      [{ value: 0.04, attribution: '{}' }],
      [
        { seq: 0, position: 0, name: 'section', detail: 'carga' },
        { seq: 0, position: 1, name: 'copy-email', detail: null },
        { seq: 0, position: 2, name: 'load-test', detail: 'finish' },
        { seq: 1, position: 0, name: 'theme', detail: 'light' },
      ],
    ]);
  });

  it('keeps the longest visibility when an older report arrives last', async () => {
    await store.save(readOf(PageReports.with((report) => (report.visible = 9_000))), CONTEXT);
    await store.save(readOf(PageReports.with((report) => (report.visible = 5_000))), CONTEXT);
    expect(await worker.rows('SELECT visible_ms FROM page_view')).toStrictEqual([
      { visible_ms: 9_000 },
    ]);
  });
});
