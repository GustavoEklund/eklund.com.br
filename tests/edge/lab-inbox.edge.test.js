import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { LabInbox } from '../../edge/src/lab-inbox.js';
import { EdgeWorker } from '../support/edge-worker.js';
import { LabBatches } from '../support/lab-batches.js';

const BEARER = { authorization: `Bearer ${LabBatches.TOKEN}` };
const REPORT = `${LabBatches.DAY}/home-mobile.json`;
const LIGHTHOUSE = JSON.stringify({ lighthouseVersion: '13.0.0', categories: {} });
const answer = async (response) => [
  response.status,
  response.headers.get('www-authenticate'),
  await response.text(),
];

describe('LabInbox, through the whole Worker in workerd with a LAB_TOKEN', () => {
  const worker = new EdgeWorker({ LAB_TOKEN: LabBatches.TOKEN });
  const post = (body, headers = BEARER) =>
    worker.fetch('/v1/lab', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...headers },
    });
  const put = (key, body, headers = BEARER) =>
    worker.fetch(`/v1/lab/report/${key}`, { method: 'PUT', body, headers });

  beforeAll(() => worker.start(), EdgeWorker.START_TIMEOUT_MS);
  afterAll(() => worker.stop());
  beforeEach(() => worker.reset());

  it('stores a batch sent with the token, and answers with no content', async () => {
    const response = await post(LabBatches.complete());
    expect([
      await answer(response),
      await worker.rows('SELECT page, run, median FROM lab_run ORDER BY page'),
      await worker.rows('SELECT engine, clicks FROM search_row ORDER BY engine'),
    ]).toStrictEqual([
      [204, null, ''],
      [
        { page: '/', run: 0, median: 1 },
        { page: '/en/', run: 4, median: 0 },
      ],
      [
        { engine: 'bing', clicks: 1 },
        { engine: 'google', clicks: 3 },
      ],
    ]);
  });

  it('turns away a request without the token, with another token or with the token in another scheme', async () => {
    const asked = [
      await answer(await post(LabBatches.complete(), {})),
      await answer(await post(LabBatches.complete(), { authorization: 'Bearer another-token' })),
      await answer(await post(LabBatches.complete(), { authorization: LabBatches.TOKEN })),
      await answer(await post(LabBatches.complete(), { authorization: 'Bearer ' })),
      await answer(await put(REPORT, LIGHTHOUSE, {})),
    ];
    const refused = [401, 'Bearer', 'This needs the token of the lab job.\n'];
    expect([asked, await worker.rows('SELECT * FROM lab_run')]).toStrictEqual([
      [refused, refused, refused, refused, refused],
      [],
    ]);
  });

  it('says what is wrong with a batch it refuses, and stores none of it', async () => {
    expect([
      await answer(await post('{')),
      await answer(await post(LabBatches.with((batch) => (batch.runs[0].page = '/x/')))),
      await answer(await post(' '.repeat(600_000))),
      await worker.rows('SELECT * FROM lab_run'),
    ]).toStrictEqual([
      [400, null, 'the batch is not JSON\n'],
      [400, null, 'runs[0].page is not one of the allowed values\n'],
      [413, null, 'the report is too long\n'],
      [],
    ]);
  });

  it('keeps the report of a median run in R2, under lab/, as JSON', async () => {
    const response = await put(REPORT, LIGHTHOUSE);
    const kept = await (await worker.reports()).get(`lab/${REPORT}`);
    expect([
      await answer(response),
      kept.httpMetadata.contentType,
      await kept.text(),
    ]).toStrictEqual([[204, null, ''], 'application/json', LIGHTHOUSE]);
  });

  it('refuses a report under another key, one that is not a JSON object, and one too large', async () => {
    const asked = [
      await answer(await put(`${LabBatches.DAY}/home-tablet.json`, LIGHTHOUSE)),
      await answer(await put(`${LabBatches.DAY}/../../secrets.json`, LIGHTHOUSE)),
      await answer(await put(REPORT, '<html>')),
      await answer(await put(REPORT, `{${' '.repeat(LabInbox.REPORT_LIMIT)}}`)),
      await answer(await worker.fetch('/v1/lab/report/x', { method: 'GET', headers: BEARER })),
    ];
    expect([asked, (await (await worker.reports()).list()).objects]).toStrictEqual([
      [
        [400, null, 'the report key does not have the expected form\n'],
        [404, null, 'Not found\n'],
        [400, null, 'the report is not a JSON object\n'],
        [413, null, 'the report is too long\n'],
        [405, null, 'Method not allowed\n'],
      ],
      [],
    ]);
  });
});

describe('the lab routes, in a Worker without a LAB_TOKEN', () => {
  const worker = new EdgeWorker();

  beforeAll(() => worker.start(), EdgeWorker.START_TIMEOUT_MS);
  afterAll(() => worker.stop());

  it('do not exist', async () => {
    expect([
      await answer(await worker.fetch('/v1/lab', { method: 'POST', body: '{}', headers: BEARER })),
      await answer(
        await worker.fetch(`/v1/lab/report/${REPORT}`, {
          method: 'PUT',
          body: LIGHTHOUSE,
          headers: BEARER,
        }),
      ),
    ]).toStrictEqual([
      [404, null, 'Not found\n'],
      [404, null, 'Not found\n'],
    ]);
  });
});
