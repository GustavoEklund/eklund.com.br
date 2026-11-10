import { describe, it, expect } from 'vitest';
import { PanelQuery } from '../../edge/panel/panel-query.js';
import { VitalsPage } from '../../edge/panel/vitals-page.js';
import { FakeReadings } from '../support/fake-readings.js';
import { PanelDocument } from '../support/panel-document.js';

const clock = { now: () => Date.parse('2026-11-09T15:00:00Z') };
const RATINGS = 'good: 50%needs improvement: 25%poor: 25%';
const PERIOD = { from: '2026-11-01', to: '2026-11-09' };
const comparison = (input, enough) => ({
  metric: input.metric,
  page: null,
  device: null,
  before: { name: input.before, values: enough ? 40 : 3, median: 2_000, p75: 2_500 },
  after: { name: input.after, values: 40, median: 1_600, p75: 2_100 },
  test: { u: 400, z: -3.2, p: 0.0014, effect: 0.5 },
  sample: {
    before: FakeReadings.sample(enough ? 40 : 3),
    after: FakeReadings.sample(40),
    enough,
  },
  verdict: enough ? 'after is better' : 'too few values to compare',
});

describe('VitalsPage', () => {
  const render = async (search, versions = ['1.1.0', '1.2.0'], enough = true) => {
    const queries = new FakeReadings({
      overview: (input) => ({
        ...input,
        top: { version: versions.map((value) => ({ value, views: 1 })) },
      }),
      vitals: (input) =>
        input.device
          ? FakeReadings.vitals(
              input,
              input.page === '/' && input.device === 'phone' ? [['LCP', 2_000, 30]] : [],
            )
          : FakeReadings.vitals(
              input,
              [
                ['CLS', 0.1, 12],
                ['LCP', 2_500, 30],
              ],
              {
                LCP: [
                  { target: '#hero>h1', loads: 20, poor: 4 },
                  { target: '<img onerror>', loads: 10, poor: 0 },
                ],
              },
            ),
      compare_vitals: (input) => comparison(input, enough),
    });
    const page = await new VitalsPage({
      queries,
      query: new PanelQuery(new URL(`https://panel.example/vitals${search}`), clock),
    }).render();
    return { page, queries, document: page.body && PanelDocument.parse(page.body) };
  };

  it('gives each metric with its ratings, the grid of pages and devices, what LCP points at, and the two latest releases compared', async () => {
    const { page, queries, document } = await render(
      '?from=2026-11-01&to=2026-11-09&version=1.2.0',
    );
    const tables = PanelDocument.tables(document);
    expect([
      page.title,
      queries.calls,
      tables[0],
      tables[1].slice(0, 3),
      PanelDocument.texts(document, 'h3'),
      tables[2],
      tables[3],
      PanelDocument.texts(document, '.verdict'),
    ]).toStrictEqual([
      'Web Vitals',
      [
        ['vitals', { ...PERIOD, version: '1.2.0' }],
        ['overview', PERIOD],
        ...['/', '/en/'].flatMap((page) =>
          ['phone', 'tablet', 'desktop'].map((device) => [
            'vitals',
            { ...PERIOD, page, device, version: '1.2.0' },
          ]),
        ),
        ['compare_vitals', { metric: 'LCP', before: '1.1.0', after: '1.2.0' }],
      ],
      [
        ['Metric', 'p75', 'Good, needs improvement, poor', 'Loads'],
        // The text of a cell includes the titles of its bar.
        ['CLS', '0.1', `${RATINGS} 50% · 25% · 25%`, '12 too few'],
        ['LCP', '2,500 ms', `${RATINGS} 50% · 25% · 25%`, '30'],
      ],
      [
        ['Page', 'Device', 'LCP', 'INP', 'CLS', 'FCP', 'TTFB'],
        ['/', 'phone', '2,000 ms (30)', '-', '-', '-', '-'],
        ['/', 'tablet', '-', '-', '-', '-', '-'],
      ],
      ['LCP'],
      [
        ['Element', 'Loads', 'Poor'],
        ['#hero>h1', '20', '4'],
        ['<img onerror>', '10', '0'],
      ],
      [
        ['Release', 'Loads', 'Median', 'p75'],
        ['1.1.0', '40', '2,000 ms', '2,500 ms'],
        ['1.2.0', '40', '1,600 ms', '2,100 ms'],
      ],
      [
        'Verdict: after is better. Mann-Whitney U, p 0.001, over the latest loads of each release on every page.',
      ],
    ]);
  });

  it('compares the metric and releases asked for, and marks a verdict whose sample is too small', async () => {
    const { queries, document } = await render(
      '?metric=INP&before=1.0.0&after=1.1.0',
      ['1.1.0'],
      false,
    );
    expect([queries.calls.at(-1), document.querySelector('.verdict').className]).toStrictEqual([
      ['compare_vitals', { metric: 'INP', before: '1.0.0', after: '1.1.0' }],
      'verdict is-small',
    ]);
  });

  it('says when two releases are not there to compare, or when what was asked for is not a release', async () => {
    const lone = await render('', ['1.2.0']);
    const wrong = await render('?metric=FID');
    expect([
      PanelDocument.texts(lone.document, '.empty'),
      lone.queries.calls.map(([name]) => name).includes('compare_vitals'),
      PanelDocument.texts(wrong.document, '.empty').at(-1),
    ]).toStrictEqual([
      ['Two releases need views in this period to be compared.'],
      false,
      'metric: Invalid option: expected one of "LCP"|"INP"|"CLS"|"FCP"|"TTFB".',
    ]);
  });

  it('says when no load is in the period, and answers 400 to a filter the reading refuses', async () => {
    const queries = new FakeReadings({
      overview: (input) => ({ ...input, top: { version: [] } }),
      vitals: (input) => FakeReadings.vitals(input, []),
    });
    const empty = await new VitalsPage({
      queries,
      query: new PanelQuery(new URL('https://panel.example/vitals'), clock),
    }).render();
    const refused = await render('?device=watch');
    expect([
      PanelDocument.texts(PanelDocument.parse(empty.body), '.empty'),
      refused.page.status,
    ]).toStrictEqual([
      [
        'No loads in this period.',
        'No load named an element in this period.',
        'Two releases need views in this period to be compared.',
      ],
      400,
    ]);
  });
});
