import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { RecordingInbox } from '../../edge/src/recording-inbox.js';
import { SessionChunk } from '../../edge/src/session-chunk.js';
import { EdgeWorker } from '../support/edge-worker.js';
import { SessionChunks } from '../support/session-chunks.js';

const ORIGIN = 'https://eklund.com.br';
const DESKTOP =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const NOW = Date.parse('2026-10-29T02:30:05Z');

const requestOf = (path, { body, headers = {} }) =>
  new Request(`https://eklund.example.workers.dev${path}`, {
    method: 'POST',
    body,
    headers: { origin: ORIGIN, 'user-agent': DESKTOP, ...headers },
  });
const answer = async (response) => [response.status, await response.text()];

describe('RecordingInbox', () => {
  let saved;
  let deleted;
  let allowed;
  let ceilings;
  let roomLeft;
  let inbox;

  beforeEach(() => {
    [saved, deleted, allowed, ceilings, roomLeft] = [[], [], true, [], Infinity];
    inbox = new RecordingInbox({
      origins: [ORIGIN, 'https://gustavo.eklund.com.br'],
      store: {
        save: async (chunk, body, context) =>
          saved.push([chunk, await SessionChunks.inflate(body), context]),
        delete: async (codes) => deleted.push(codes),
      },
      limit: { allows: async () => allowed },
      ceiling: {
        allows: async (day, rows, bytes) => {
          ceilings.push([day, rows, bytes]);
          return bytes <= roomLeft;
        },
      },
      clock: { now: () => NOW },
    });
  });

  describe('take', () => {
    it('stores a chunk sent as gzip, as it came, with the day, the host and the browser, and answers 204', async () => {
      const body = await SessionChunks.gzip(SessionChunks.complete());
      const response = await inbox.take(requestOf('/v1/session', { body }));
      expect([
        response.status,
        response.headers.get('access-control-allow-origin'),
        saved,
        ceilings,
      ]).toStrictEqual([
        204,
        ORIGIN,
        [
          [
            SessionChunk.parse(JSON.stringify(SessionChunks.complete())).chunk,
            JSON.stringify(SessionChunks.complete()),
            {
              receivedAt: NOW,
              day: '2026-10-29',
              host: 'eklund.com.br',
            },
          ],
        ],
        [['2026-10-29', 4, body.byteLength]],
      ]);
    });

    it('stores a chunk sent as plain text, the last one of a page that closes, as gzip', async () => {
      const text = JSON.stringify(SessionChunks.complete());
      await inbox.take(requestOf('/v1/session', { body: text }));
      expect(saved.map(([, stored]) => stored)).toStrictEqual([text]);
    });

    it('refuses another origin before reading anything, and answers 204 storing nothing for GPC or a robot', async () => {
      const body = await SessionChunks.gzip(SessionChunks.complete());
      expect([
        await answer(
          await inbox.take(
            requestOf('/v1/session', { body, headers: { origin: 'https://evil.example' } }),
          ),
        ),
        (await inbox.take(requestOf('/v1/session', { body, headers: { 'sec-gpc': '1' } }))).status,
        (
          await inbox.take(
            requestOf('/v1/session', { body, headers: { 'user-agent': 'HeadlessChrome/130' } }),
          )
        ).status,
        saved,
      ]).toStrictEqual([[403, 'This origin may not send reports here.\n'], 204, 204, []]);
    });

    it('refuses a body that is too long, a bomb, broken gzip and an invalid chunk, each with its reason', async () => {
      const bomb = await SessionChunks.gzip(`{"v":1,"pad":"${'0'.repeat(3_000_000)}"}`);
      expect([
        await answer(
          await inbox.take(
            requestOf('/v1/session', { body: '{}', headers: { 'content-length': '524289' } }),
          ),
        ),
        await answer(await inbox.take(requestOf('/v1/session', { body: new Uint8Array(524_289) }))),
        await answer(await inbox.take(requestOf('/v1/session', { body: bomb }))),
        await answer(
          await inbox.take(
            requestOf('/v1/session', { body: new Uint8Array([0x1f, 0x8b, 0, 0, 0]) }),
          ),
        ),
        await answer(
          await inbox.take(
            requestOf('/v1/session', {
              body: await SessionChunks.gzip(
                SessionChunks.with((chunk) => (chunk.page = '/privacidade/')),
              ),
            }),
          ),
        ),
        saved,
      ]).toStrictEqual([
        [413, 'the report is too long\n'],
        [413, 'the report is too long\n'],
        [400, 'the chunk is too long\n'],
        [400, 'the chunk is not gzip\n'],
        [400, 'page is not one of the allowed values\n'],
        [],
      ]);
    });

    it("answers 429 past the client's share of the minute, before reading, and past the day's ceiling, until midnight", async () => {
      const body = await SessionChunks.gzip(SessionChunks.complete());
      allowed = false;
      const minute = await inbox.take(requestOf('/v1/session', { body }));
      allowed = true;
      roomLeft = 10;
      const day = await inbox.take(requestOf('/v1/session', { body }));
      expect([
        [minute.status, minute.headers.get('retry-after')],
        [day.status, day.headers.get('retry-after')],
        saved,
      ]).toStrictEqual([[429, '60'], [429, '77395'], []]);
    });
  });

  describe('forget', () => {
    it('deletes the recordings of the codes, from a browser or not, and answers 204 either way', async () => {
      const body = JSON.stringify({ v: 1, codes: [SessionChunks.CODE, SessionChunks.OTHER] });
      const responses = [
        await inbox.forget(requestOf('/v1/session/delete', { body })),
        await inbox.forget(
          requestOf('/v1/session/delete', { body, headers: { 'sec-gpc': '1', 'user-agent': '' } }),
        ),
      ];
      expect([responses.map((response) => response.status), deleted]).toStrictEqual([
        [204, 204],
        [
          [SessionChunks.CODE, SessionChunks.OTHER],
          [SessionChunks.CODE, SessionChunks.OTHER],
        ],
      ]);
    });

    it('refuses another origin, a long body, an invalid request and a client past its share, deleting nothing', async () => {
      const body = JSON.stringify({ v: 1, codes: [SessionChunks.CODE] });
      const refused = [
        await answer(
          await inbox.forget(
            requestOf('/v1/session/delete', { body, headers: { origin: 'https://evil.example' } }),
          ),
        ),
        await answer(
          await inbox.forget(
            requestOf('/v1/session/delete', { body, headers: { 'content-length': '4097' } }),
          ),
        ),
        await answer(
          await inbox.forget(requestOf('/v1/session/delete', { body: '{"v":1,"codes":["*"]}' })),
        ),
      ];
      allowed = false;
      refused.push(await answer(await inbox.forget(requestOf('/v1/session/delete', { body }))));
      expect([refused, deleted]).toStrictEqual([
        [
          [403, 'This origin may not send reports here.\n'],
          [413, 'the report is too long\n'],
          [400, 'a code does not have the expected form\n'],
          [429, 'too many reports, try again later\n'],
        ],
        [],
      ]);
    });
  });
});

describe('recordings, through the whole Worker in workerd', () => {
  const worker = new EdgeWorker();

  beforeAll(() => worker.start(), EdgeWorker.START_TIMEOUT_MS);
  afterAll(() => worker.stop());
  beforeEach(() => worker.reset());

  it('stores the chunks a page sends at /v1/session, and deletes them at /v1/session/delete with their code', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const sent = await worker.sendChunk(await SessionChunks.gzip(SessionChunks.complete()));
    const last = await worker.sendChunk(
      JSON.stringify(
        SessionChunks.with((chunk) => {
          chunk.seq = 1;
          chunk.clicks = [];
        }),
      ),
    );
    const stored = [
      await worker.keys('recordings/'),
      await worker.rows('SELECT code, day, chunks, clicks FROM recording'),
    ];
    const forgotten = await worker.forget([SessionChunks.CODE]);
    expect([
      [sent.status, last.status, forgotten.status],
      sent.headers.get('access-control-allow-origin'),
      stored,
      await worker.keys('recordings/'),
      await worker.rows('SELECT code FROM recording'),
      await worker.rows('SELECT code FROM recording_click'),
    ]).toStrictEqual([
      [204, 204, 204],
      EdgeWorker.ORIGIN,
      [
        [
          `recordings/${today}/${SessionChunks.CODE}/000`,
          `recordings/${today}/${SessionChunks.CODE}/001`,
        ],
        [{ code: SessionChunks.CODE, day: today, chunks: 2, clicks: 1 }],
      ],
      [],
      [],
      [],
    ]);
  });

  it('stores nothing from a headless browser or under Global Privacy Control, and keeps what a deletion does not name', async () => {
    const body = await SessionChunks.gzip(SessionChunks.complete());
    const answers = [
      (await worker.sendChunk(body, { 'user-agent': 'Mozilla/5.0 HeadlessChrome/130.0.0.0' }))
        .status,
      (await worker.sendChunk(body, { 'sec-gpc': '1' })).status,
    ];
    const keptBefore = await worker.keys('recordings/');
    await worker.sendChunk(body);
    const forgotten = await worker.forget([SessionChunks.OTHER]);
    expect([
      answers,
      keptBefore,
      forgotten.status,
      (await worker.rows('SELECT code FROM recording')).length,
    ]).toStrictEqual([[204, 204], [], 204, 1]);
  });

  it('answers only POST on the routes of the recordings', async () => {
    const read = await worker.fetch('/v1/session');
    const put = await worker.fetch('/v1/session/delete', { method: 'PUT', body: '{}' });
    expect([
      [read.status, read.headers.get('allow')],
      [put.status, put.headers.get('allow')],
    ]).toStrictEqual([
      [405, 'POST, OPTIONS'],
      [405, 'POST, OPTIONS'],
    ]);
  });
});
