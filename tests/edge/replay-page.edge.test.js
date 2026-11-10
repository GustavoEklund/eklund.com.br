import { describe, it, expect } from 'vitest';
import { PanelLayout } from '../../edge/panel/panel-layout.js';
import { ReplayPage } from '../../edge/panel/replay-page.js';
import { FakeReadings } from '../support/fake-readings.js';
import { PanelDocument } from '../support/panel-document.js';
import { SessionChunks } from '../support/session-chunks.js';

const RECORDING = {
  code: SessionChunks.CODE,
  day: '2026-11-08',
  page: '/en/',
  language: 'en-US',
  version: '1.2.0',
  started: '2026-11-08T23:59:00.000Z',
  duration_ms: 125_000,
  chunks: 2,
  last_seq: 2,
  bytes: 2_048,
  clicks: 1,
};

describe('ReplayPage', () => {
  const page = () => {
    const gets = [];
    const queries = new FakeReadings({
      recording: (code) => (code === SessionChunks.CODE ? RECORDING : null),
    });
    const bucket = {
      get: async (key) => {
        gets.push(key);
        return key.endsWith('/001') ? null : { body: new Blob(['gzip bytes']).stream() };
      },
    };
    return { replay: new ReplayPage({ queries, bucket }), queries, gets };
  };

  it("replays a recording: its facts, the address of each chunk up to the last one, and the replayer's script with its policy", async () => {
    const { replay, queries } = page();
    const found = await replay.render(SessionChunks.CODE);
    const document = PanelDocument.parse(found.body);
    expect([
      found.title,
      found.scripts,
      found.styles,
      found.policy === PanelLayout.REPLAY_POLICY,
      [...document.querySelectorAll('.facts div')].map((fact) => [
        PanelDocument.text(fact.querySelector('dt')),
        PanelDocument.text(fact.querySelector('dd')),
      ]),
      document.querySelector('.replay').dataset.chunks.split(' '),
      queries.calls,
    ]).toStrictEqual([
      'Recording 3f2b8c1e',
      ['/assets/replay-start.js'],
      ['/assets/rrweb-replay.css'],
      true,
      [
        ['Page', '/en/'],
        ['Language', 'en-US'],
        ['Release', '1.2.0'],
        ['Started', '2026-11-08 23:59 UTC'],
        ['Length', '2:05'],
        ['Size', '2 kB, 2 chunks'],
        ['Clicks', '1'],
      ],
      [0, 1, 2].map((seq) => `/recordings/${SessionChunks.CODE}/00${seq}`),
      [['recording', SessionChunks.CODE]],
    ]);
  });

  it('answers 404 for a code no recording has, and does not ask for one that is not a code', async () => {
    const { replay, queries } = page();
    const [missing, malformed] = await Promise.all([
      replay.render(SessionChunks.OTHER),
      replay.render('../../etc'),
    ]);
    expect([missing.status, missing.title, malformed.status, queries.calls]).toStrictEqual([
      404,
      'No such recording',
      404,
      [['recording', SessionChunks.OTHER]],
    ]);
  });

  it('sends a chunk as the gzip R2 keeps, under the day the recording started, and 404 for any other', async () => {
    const { replay, gets } = page();
    const chunk = await replay.chunk(SessionChunks.CODE, '000');
    const answers = await Promise.all([
      replay.chunk(SessionChunks.CODE, '001'),
      replay.chunk(SessionChunks.OTHER, '000'),
      replay.chunk(SessionChunks.CODE, '0'),
      replay.chunk(SessionChunks.CODE, '../x'),
      replay.chunk('not-a-code', '000'),
    ]);
    expect([
      chunk.status,
      chunk.headers.get('content-type'),
      chunk.headers.get('cache-control'),
      await chunk.text(),
      answers.map(({ status }) => status),
      gets,
    ]).toStrictEqual([
      200,
      'application/gzip',
      'no-store',
      'gzip bytes',
      [404, 404, 404, 404, 404],
      [
        `recordings/2026-11-08/${SessionChunks.CODE}/000`,
        `recordings/2026-11-08/${SessionChunks.CODE}/001`,
      ],
    ]);
  });
});
