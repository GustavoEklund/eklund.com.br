import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { LabBatch } from '../../edge/src/lab-batch.js';
import { LabStore } from '../../edge/src/lab-store.js';
import { EdgeWorker } from '../support/edge-worker.js';
import { LabBatches } from '../support/lab-batches.js';

const readOf = (batch) => LabBatch.parse(JSON.stringify(batch)).batch;

describe('LabStore.save, against D1 in workerd', () => {
  const worker = new EdgeWorker();
  let store;

  const everything = async () => [
    await worker.rows('SELECT * FROM lab_run ORDER BY page, form_factor, run'),
    await worker.rows('SELECT * FROM crux_reading'),
    await worker.rows('SELECT * FROM search_row ORDER BY engine'),
    await worker.rows('SELECT * FROM certificate ORDER BY host'),
  ];

  beforeAll(() => worker.start(), EdgeWorker.START_TIMEOUT_MS);
  afterAll(() => worker.stop());
  beforeEach(async () => {
    await worker.reset();
    store = new LabStore(await worker.database());
  });

  it('writes every kind of row, each in the columns of its table', async () => {
    await store.save(readOf(LabBatches.complete()));
    expect(await everything()).toStrictEqual([
      [
        {
          day: '2026-11-09',
          page: '/',
          form_factor: 'mobile',
          run: 0,
          median: 1,
          score: 0.81,
          lcp_ms: 2_612.5,
          fcp_ms: 1_204,
          cls: 0,
          tbt_ms: 663.25,
          speed_index_ms: 2_890,
          ttfb_ms: 120,
          report: '2026-11-09/home-mobile.json',
        },
        {
          day: '2026-11-09',
          page: '/en/',
          form_factor: 'desktop',
          run: 4,
          median: 0,
          score: 0.98,
          lcp_ms: 702,
          fcp_ms: 410,
          cls: 0.002,
          tbt_ms: 0,
          speed_index_ms: 640,
          ttfb_ms: 95,
          report: null,
        },
      ],
      [
        {
          day: '2026-11-09',
          scope: 'origin',
          form_factor: 'phone',
          metric: 'LCP',
          p75: 2_350,
          good: 0.79,
          needs_improvement: 0.15,
          poor: 0.06,
        },
      ],
      [
        {
          engine: 'bing',
          day: '2026-11-06',
          page: '',
          query: '',
          country: '',
          device: '',
          clicks: 1,
          impressions: 4,
          position: null,
        },
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
      ],
      [
        {
          day: '2026-11-09',
          host: 'eklund.com.br',
          valid_to: 1_799_000_000_000,
          issuer: "Let's Encrypt",
          problem: null,
        },
        {
          day: '2026-11-09',
          host: 'gustavo.eklund.com.br',
          valid_to: null,
          issuer: '',
          problem: 'CERT_HAS_EXPIRED',
        },
      ],
    ]);
  });

  it('replaces the rows of the same night when the job sends it again, and doubles nothing', async () => {
    await store.save(readOf(LabBatches.complete()));
    await store.save(
      readOf(
        LabBatches.with((batch) => {
          batch.runs[1].score = 0.97;
          batch.search[0].clicks = 5;
        }),
      ),
    );
    expect([
      await worker.rows('SELECT page, score FROM lab_run ORDER BY page'),
      await worker.rows('SELECT engine, clicks FROM search_row ORDER BY engine'),
      (await worker.rows('SELECT count(*) AS n FROM crux_reading'))[0].n,
    ]).toStrictEqual([
      [
        { page: '/', score: 0.81 },
        { page: '/en/', score: 0.97 },
      ],
      [
        { engine: 'bing', clicks: 1 },
        { engine: 'google', clicks: 5 },
      ],
      1,
    ]);
  });

  it('writes a full list of search rows in one statement', async () => {
    const rows = Array.from({ length: LabBatch.LIMITS.search }, (_, index) => ({
      ...LabBatches.complete().search[0],
      query: `query ${index}`,
    }));
    await store.save(readOf({ v: 1, runs: [], field: [], search: rows, certificates: [] }));
    expect(await worker.rows('SELECT count(*) AS n FROM search_row')).toStrictEqual([{ n: 500 }]);
  });

  it('writes nothing for a night with nothing to say', async () => {
    await store.save({ runs: [], field: [], search: [], certificates: [] });
    expect(await everything()).toStrictEqual([[], [], [], []]);
  });
});
