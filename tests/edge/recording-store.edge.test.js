import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { RecordingStore } from '../../edge/src/recording-store.js';
import { SessionChunk } from '../../edge/src/session-chunk.js';
import { EdgeWorker } from '../support/edge-worker.js';
import { SessionChunks } from '../support/session-chunks.js';

const RECEIVED = Date.parse('2026-10-29T02:30:05Z');
const CONTEXT = {
  receivedAt: RECEIVED,
  day: '2026-10-29',
  host: 'eklund.com.br',
};
const readOf = (chunk) => SessionChunk.parse(JSON.stringify(chunk)).chunk;
const FIRST = 'recordings/2026-10-29/3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b/000';

describe('RecordingStore, against D1 and R2 in workerd', () => {
  const worker = new EdgeWorker();
  let store;

  /** Saves a chunk as the inbox does: its gzip goes to R2. */
  const save = async (chunk, context = CONTEXT) =>
    store.save(readOf(chunk), await SessionChunks.gzip(chunk), context);
  const bytesOf = async (chunk) => (await SessionChunks.gzip(chunk)).byteLength;

  beforeAll(() => worker.start(), EdgeWorker.START_TIMEOUT_MS);
  afterAll(() => worker.stop());
  beforeEach(async () => {
    await worker.reset();
    store = new RecordingStore({ db: await worker.database(), bucket: await worker.reports() });
  });

  it('names a chunk by the day its recording started, its code and its order', () => {
    expect([
      RecordingStore.key('2026-10-29', SessionChunks.CODE, 0),
      RecordingStore.key('2026-11-01', SessionChunks.OTHER, 42),
    ]).toStrictEqual([FIRST, 'recordings/2026-11-01/7c9e6679-7425-40de-944b-e07fc1f90ae7/042']);
  });

  it('keeps the chunk in R2 as gzip JSON, the recording and its clicks in D1, and counts the rows and bytes of the day', async () => {
    const chunk = SessionChunks.complete();
    await save(chunk);
    const object = await (await worker.reports()).get(FIRST);
    expect([
      await worker.keys(),
      object.httpMetadata,
      JSON.parse(await SessionChunks.inflate(new Uint8Array(await object.arrayBuffer()))),
      await worker.rows('SELECT * FROM recording'),
      await worker.rows('SELECT * FROM recording_click'),
      await worker.rows('SELECT * FROM daily_writes'),
    ]).toStrictEqual([
      [FIRST],
      { contentType: 'application/json', contentEncoding: 'gzip' },
      chunk,
      [
        {
          code: SessionChunks.CODE,
          day: '2026-10-29',
          started_at: RECEIVED,
          last_at: RECEIVED,
          host: 'eklund.com.br',
          page: '/',
          version: '1.2.0',
          language: 'pt-BR',
          first_event_ms: SessionChunks.STARTED,
          last_event_ms: SessionChunks.STARTED + 4_000,
          chunks: 1,
          last_seq: 0,
          bytes: await bytesOf(chunk),
          clicks: 1,
        },
      ],
      [
        {
          code: SessionChunks.CODE,
          seq: 0,
          position: 0,
          region: 'status',
          viewport: '1280-1535',
          x: 0.25,
          y: 0.5,
          at_ms: 4_000,
        },
      ],
      [{ day: '2026-10-29', rows: 4, bytes: await bytesOf(chunk) }],
    ]);
  });

  it('adds the later chunks of a recording to it under the day it started, even past midnight', async () => {
    const later = SessionChunks.with((chunk) => {
      chunk.seq = 1;
      chunk.events = [
        {
          type: 3,
          data: { source: 3, id: 1, x: 0, y: 900 },
          timestamp: SessionChunks.STARTED + 90_000,
        },
      ];
      chunk.clicks = [];
    });
    await save(SessionChunks.complete());
    await save(later, { ...CONTEXT, receivedAt: RECEIVED + 90_000, day: '2026-10-30' });
    expect([
      await worker.keys(),
      await worker.rows(
        'SELECT day, started_at, last_at, first_event_ms, last_event_ms, chunks, last_seq, bytes, clicks FROM recording',
      ),
      await worker.rows('SELECT day, rows FROM daily_writes ORDER BY day'),
    ]).toStrictEqual([
      [FIRST, 'recordings/2026-10-29/3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b/001'],
      [
        {
          day: '2026-10-29',
          started_at: RECEIVED,
          last_at: RECEIVED + 90_000,
          first_event_ms: SessionChunks.STARTED,
          last_event_ms: SessionChunks.STARTED + 90_000,
          chunks: 2,
          last_seq: 1,
          bytes: (await bytesOf(SessionChunks.complete())) + (await bytesOf(later)),
          clicks: 1,
        },
      ],
      [
        { day: '2026-10-29', rows: 4 },
        { day: '2026-10-30', rows: 3 },
      ],
    ]);
  });

  it('deletes the recordings of the codes it is given, every chunk and click, and nothing of anyone else', async () => {
    await save(SessionChunks.complete());
    await save(SessionChunks.with((chunk) => (chunk.seq = 2)));
    await save(SessionChunks.with((chunk) => (chunk.code = SessionChunks.OTHER)));
    await store.delete([SessionChunks.CODE, '00000000-0000-4000-8000-000000000000']);
    expect([
      await worker.keys(),
      await worker.rows('SELECT code FROM recording'),
      await worker.rows('SELECT code FROM recording_click'),
    ]).toStrictEqual([
      ['recordings/2026-10-29/7c9e6679-7425-40de-944b-e07fc1f90ae7/000'],
      [{ code: SessionChunks.OTHER }],
      [{ code: SessionChunks.OTHER }],
    ]);
  });

  it('expires what is past 30 days, chunks without a row included, and keeps the 30 days before today', async () => {
    const bucket = await worker.reports();
    await save(SessionChunks.complete(), { ...CONTEXT, day: '2026-10-09' });
    await save(
      SessionChunks.with((chunk) => (chunk.code = SessionChunks.OTHER)),
      {
        ...CONTEXT,
        day: '2026-10-10',
      },
    );
    await bucket.put('recordings/2026-10-03/00000000-0000-4000-8000-000000000000/000', 'left');
    await bucket.put('recordings/2026-10-01/00000000-0000-4000-8000-000000000000/000', 'old');
    await bucket.put('lab/2026-10-01/home-mobile.json', '{}');
    await store.expire('2026-11-09');
    expect([
      await worker.keys(),
      await worker.rows('SELECT code, day FROM recording'),
      await worker.rows('SELECT code FROM recording_click'),
    ]).toStrictEqual([
      [
        'lab/2026-10-01/home-mobile.json',
        'recordings/2026-10-01/00000000-0000-4000-8000-000000000000/000',
        'recordings/2026-10-10/7c9e6679-7425-40de-944b-e07fc1f90ae7/000',
      ],
      [{ code: SessionChunks.OTHER, day: '2026-10-10' }],
      [{ code: SessionChunks.OTHER }],
    ]);
  });
});
