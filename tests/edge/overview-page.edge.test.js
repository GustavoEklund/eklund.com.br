import { describe, it, expect } from 'vitest';
import { OverviewPage } from '../../edge/panel/overview-page.js';
import { PanelQuery } from '../../edge/panel/panel-query.js';
import { FakeReadings } from '../support/fake-readings.js';
import { PanelDocument } from '../support/panel-document.js';

const clock = { now: () => Date.parse('2026-11-09T15:00:00Z') };
const top = (...pairs) => pairs.map(([value, views]) => ({ value, views }));
const overview = (input, versions) => ({
  ...input,
  views: 30,
  days_with_views: 2,
  per_day: [
    { day: '2026-11-07', views: 10 },
    { day: '2026-11-09', views: 20 },
  ],
  top: {
    page: top(['/', 24], ['/en/', 6]),
    language: top(['pt-BR', 24], ['en-US', 6]),
    country: top(['BR', 20], ['', 10]),
    device: top(['phone', 30]),
    browser: top(['chrome', 30]),
    referrer: top(['', 25], ['www.google.com', 5]),
    version: versions,
    host: top(['eklund.com.br', 30]),
  },
  sample: FakeReadings.sample(30),
});

describe('OverviewPage', () => {
  const render = async (search, versions) => {
    const queries = new FakeReadings({
      overview: (input) => overview(input, versions),
      vitals: (input) =>
        FakeReadings.vitals(
          input,
          input.version === '1.10.0'
            ? [
                ['CLS', 0.05, 25],
                ['LCP', 1_800, 25],
              ]
            : [['LCP', 2_400, 5]],
        ),
    });
    const page = await new OverviewPage({
      queries,
      query: new PanelQuery(new URL(`https://panel.example/${search}`), clock),
    }).render();
    return { page, queries, document: page.body && PanelDocument.parse(page.body) };
  };

  it('counts the views of the period day by day, ranks each column, and puts the current release beside the previous one', async () => {
    const { page, queries, document } = await render(
      '?from=2026-11-07&to=2026-11-09',
      top(['1.9.2', 5], ['1.10.0', 25]),
    );
    const tables = PanelDocument.tables(document);
    expect([
      page.title,
      queries.calls,
      PanelDocument.texts(document, '.tile'),
      PanelDocument.texts(document, '.sample'),
      PanelDocument.texts(document, '.chart title'),
      tables[0],
      PanelDocument.texts(document, 'h2'),
      tables[3],
      tables[6],
      document.querySelector('.note a').getAttribute('href'),
    ]).toStrictEqual([
      'Overview',
      [
        ['overview', { from: '2026-11-07', to: '2026-11-09' }],
        ['vitals', { from: '2026-11-07', to: '2026-11-09', version: '1.10.0' }],
        ['vitals', { from: '2026-11-07', to: '2026-11-09', version: '1.9.2' }],
      ],
      ['Views 30', 'Days with views 2', 'Current release 1.10.0'],
      ['Sample: 30 views.'],
      ['2026-11-07: 10', '2026-11-08: 0', '2026-11-09: 20'],
      [
        ['p75 of real visits', '1.9.2', '1.10.0'],
        ['Views', '5', '25'],
        ['LCP', '2,400 ms (5, too few)', '1,800 ms (25)'],
        ['INP', '-', '-'],
        ['CLS', '-', '0.05 (25)'],
        ['FCP', '-', '-'],
        ['TTFB', '-', '-'],
      ],
      [
        'Views per day',
        'Current release and the previous one',
        'Pages',
        'Languages',
        'Countries',
        'Devices',
        'Browsers',
        'Referrers',
        'Releases',
        'Hosts',
      ],
      [
        ['country', 'Views', 'Share'],
        ['BR', '20', '66.7%'],
        ['unknown', '10', '33.3%'],
      ],
      [
        ['referrer', 'Views', 'Share'],
        ['none (typed or bookmarked)', '25', '83.3%'],
        ['www.google.com', '5', '16.7%'],
      ],
      '/vitals?before=1.9.2&after=1.10.0',
    ]);
  });

  it('shows one release alone, and says when no release has views', async () => {
    const one = await render('', top(['1.10.0', 30]));
    const none = await render('', []);
    expect([
      PanelDocument.tables(one.document)[0][0],
      PanelDocument.texts(one.document, '.note'),
      one.queries.calls.map(([name]) => name),
      PanelDocument.texts(none.document, '.empty'),
      none.queries.calls,
    ]).toStrictEqual([
      ['p75 of real visits', '1.10.0'],
      [
        'In brackets, the loads each value comes from; below 20 a release is too small to compare. There is no earlier release in this period to compare with.',
      ],
      ['overview', 'vitals'],
      ['No release has views in this period.', 'No views.'],
      [['overview', { from: '2026-10-13', to: '2026-11-09' }]],
    ]);
  });

  it('answers 400 with the reason when the period is not one the readings accept', async () => {
    const { page, queries } = await render('?from=2026-11-09&to=2026-11-01', []);
    expect([page.status, queries.calls]).toStrictEqual([400, []]);
  });
});
