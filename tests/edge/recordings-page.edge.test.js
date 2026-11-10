import { describe, it, expect } from 'vitest';
import { PanelQuery } from '../../edge/panel/panel-query.js';
import { RecordingsPage } from '../../edge/panel/recordings-page.js';
import { FakeReadings } from '../support/fake-readings.js';
import { PanelDocument } from '../support/panel-document.js';
import { SessionChunks } from '../support/session-chunks.js';

const clock = { now: () => Date.parse('2026-11-09T15:00:00Z') };

describe('RecordingsPage', () => {
  const render = async (search, recordings, size = recordings.length) => {
    const queries = new FakeReadings({
      recordings: (input) => ({
        ...input,
        page: input.page ?? null,
        recordings,
        sample: FakeReadings.sample(size, 1),
      }),
    });
    const page = await new RecordingsPage({
      queries,
      query: new PanelQuery(new URL(`https://panel.example/recordings${search}`), clock),
    }).render();
    return { page, queries, document: page.body && PanelDocument.parse(page.body) };
  };

  it('lists the recordings of the period, each linking to its replay, and says when more exist than it lists', async () => {
    const { page, queries, document } = await render(
      '?page=/',
      [
        {
          code: SessionChunks.CODE,
          day: '2026-11-09',
          page: '/',
          language: 'pt-BR',
          version: '1.2.0',
          started: '2026-11-09T14:00:00.000Z',
          duration_ms: 95_000,
          chunks: 3,
          bytes: 45_300,
          clicks: 4,
        },
        {
          code: SessionChunks.OTHER,
          day: '2026-11-08',
          page: '/',
          language: 'en-US',
          version: '1.1.0',
          started: '2026-11-08T09:30:00.000Z',
          duration_ms: 4_000,
          chunks: 1,
          bytes: 900,
          clicks: 0,
        },
      ],
      60,
    );
    expect([
      page.title,
      queries.calls,
      PanelDocument.tables(document)[0],
      [...document.querySelectorAll('tbody a')].map((link) => link.getAttribute('href')),
      PanelDocument.texts(document, '.note'),
    ]).toStrictEqual([
      'Recordings',
      [['recordings', { from: '2026-10-13', to: '2026-11-09', page: '/' }]],
      [
        ['Recording', 'Page', 'Language', 'Release', 'Started', 'Length', 'Size', 'Clicks'],
        [
          '3f2b8c1e',
          '/',
          'pt-BR',
          '1.2.0',
          '2026-11-09 14:00 UTC',
          '1:35',
          '45.3 kB (3 chunks)',
          '4',
        ],
        ['7c9e6679', '/', 'en-US', '1.1.0', '2026-11-08 09:30 UTC', '0:04', '900 B (1 chunk)', '0'],
      ],
      [`/recordings/${SessionChunks.CODE}`, `/recordings/${SessionChunks.OTHER}`],
      [
        'Only visitors who consented are recorded, without anything they typed, and each recording is deleted after 30 days or when its browser asks. This period has 60; the latest 50 are listed.',
      ],
    ]);
  });

  it('says when the period has none, and answers 400 to a page that is never recorded', async () => {
    const empty = await render('', []);
    const refused = await render('?page=/termos/', []);
    expect([PanelDocument.texts(empty.document, '.empty'), refused.page.status]).toStrictEqual([
      ['No recording in this period.'],
      400,
    ]);
  });
});
