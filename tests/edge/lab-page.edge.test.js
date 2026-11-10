import { describe, it, expect } from 'vitest';
import { LabPage } from '../../edge/panel/lab-page.js';
import { PanelQuery } from '../../edge/panel/panel-query.js';
import { FakeReadings } from '../support/fake-readings.js';
import { PanelDocument } from '../support/panel-document.js';

const clock = { now: () => Date.parse('2026-11-09T15:00:00Z') };
const PERIOD = { from: '2026-11-07', to: '2026-11-08' };
const run = (day, page, formFactor, lcp) => ({
  day,
  page,
  form_factor: formFactor,
  score: 0.91,
  lcp_ms: lcp,
  fcp_ms: 800,
  cls: 0.012,
  tbt_ms: 120,
  speed_index_ms: 1_500,
  ttfb_ms: 40,
  report: `lab/${day}/home-${formFactor}.json`,
});

describe('LabPage', () => {
  const full = {
    lab: (input) => ({
      ...input,
      page: null,
      form_factor: null,
      runs: [
        run('2026-11-07', '/', 'mobile', 2_400),
        run('2026-11-08', '/', 'mobile', 1_800),
        run('2026-11-08', '/en/', 'desktop', 700),
      ],
      sample: FakeReadings.sample(2, 14),
    }),
    lab_change_points: (input) => ({
      ...input,
      segments:
        input.page === '/' && input.form_factor === 'mobile'
          ? [
              { from: '2026-10-01', to: '2026-10-20', nights: 20, mean: 2_400 },
              { from: '2026-10-21', to: '2026-11-08', nights: 19, mean: 1_800 },
            ]
          : [],
      sample: FakeReadings.sample(
        input.page === '/' && input.form_factor === 'mobile' ? 39 : 2,
        14,
      ),
      verdict:
        input.page === '/' && input.form_factor === 'mobile'
          ? 'the level shifted once'
          : 'too few nights to look for a shift',
    }),
    crux: () => ({
      day: '2026-11-08',
      readings: [
        {
          scope: 'origin',
          form_factor: 'phone',
          metric: 'LCP',
          p75: 2_100,
          good: 0.8,
          needs_improvement: 0.15,
          poor: 0.05,
        },
      ],
      sample: { ...FakeReadings.sample(1, 1), note: 'CrUX gives no counts.' },
    }),
    search: (input) => ({
      ...input,
      engine: null,
      totals: [{ engine: 'google', clicks: 3, impressions: 40 }],
      queries: [
        { engine: 'google', query: 'gustavo eklund', clicks: 3, impressions: 40, position: 1.5 },
      ],
      pages: [{ page: 'https://eklund.com.br/', clicks: 3, impressions: 40 }],
      sample: FakeReadings.sample(40),
    }),
    certificates: () => ({
      day: '2026-11-08',
      certificates: [
        {
          host: 'eklund.com.br',
          issuer: "Let's Encrypt R11",
          problem: null,
          valid_to: '2027-01-01T00:00:00.000Z',
          days_left: 53,
        },
        {
          host: 'gustavo.eklund.com.br',
          issuer: '',
          problem: 'CERT_HAS_EXPIRED',
          valid_to: null,
          days_left: null,
        },
      ],
      sample: FakeReadings.sample(2, 1),
    }),
    uptime: (input) => ({
      ...input,
      pages: [
        {
          target: 'https://eklund.com.br/',
          days: 2,
          checks: 576,
          failures: 1,
          typical_ms: 180,
          worst_p95_ms: 400,
          availability: 0.99826,
        },
        {
          target: 'https://eklund.com.br/en/',
          days: 2,
          checks: 576,
          failures: 0,
          typical_ms: 190,
          worst_p95_ms: 420,
          availability: 1,
        },
      ],
      now: [
        {
          target: 'https://eklund.com.br/',
          failing: true,
          failures_in_a_row: 2,
          failing_since: '2026-11-09T14:50:00.000Z',
          issue: 12,
        },
        {
          target: 'https://eklund.com.br/en/',
          failing: false,
          failures_in_a_row: 0,
          failing_since: null,
          issue: null,
        },
      ],
      sample: FakeReadings.sample(1_152),
    }),
  };
  const render = async (search, answers = full) => {
    const queries = new FakeReadings(answers);
    const page = await new LabPage({
      queries,
      query: new PanelQuery(new URL(`https://panel.example/lab${search}`), clock),
    }).render();
    return { page, queries, document: page.body && PanelDocument.parse(page.body) };
  };

  it('draws the nightly series, gives the latest night and where each series shifted, and the readings beside the lab', async () => {
    const { page, queries, document } = await render('?from=2026-11-07&to=2026-11-08');
    const tables = PanelDocument.tables(document);
    expect([
      page.title,
      queries.calls,
      PanelDocument.texts(document, '.legend li'),
      PanelDocument.texts(document, 'figcaption'),
      [...document.querySelectorAll('.chart')][1].querySelectorAll('polyline').length,
      PanelDocument.texts(document, 'h3'),
      tables[0],
      tables[1],
      tables[2],
      tables.slice(3).map((table) => table.slice(1)),
    ]).toStrictEqual([
      'Lab',
      [
        ['lab', PERIOD],
        ['crux', {}],
        ['search', PERIOD],
        ['certificates', {}],
        ['uptime', PERIOD],
        ...[
          ['/', 'mobile'],
          ['/', 'desktop'],
          ['/en/', 'mobile'],
          ['/en/', 'desktop'],
        ].map(([pageName, formFactor]) => [
          'lab_change_points',
          { page: pageName, form_factor: formFactor, metric: 'lcp', ...PERIOD },
        ]),
      ],
      ['/ mobile', '/ desktop', '/en/ mobile', '/en/ desktop'],
      ['Performance score', 'Largest Contentful Paint', 'Total Blocking Time'],
      4,
      ['The night of 2026-11-08', 'Queries', 'Pages on Google'],
      [
        ['Page', 'Form factor', 'Score', 'LCP', 'FCP', 'CLS', 'TBT', 'Speed Index', 'TTFB'],
        ['/', 'mobile', '91', '1,800 ms', '800 ms', '0.012', '120 ms', '1,500 ms', '40 ms'],
        ['/en/', 'desktop', '91', '700 ms', '800 ms', '0.012', '120 ms', '1,500 ms', '40 ms'],
      ],
      [
        ['Page', 'Form factor', 'Nights', 'Verdict', 'Levels'],
        [
          '/',
          'mobile',
          '39',
          'the level shifted once',
          '2026-10-01 to 2026-10-20: 2,400 ms (20) 2026-10-21 to 2026-11-08: 1,800 ms (19)',
        ],
        ['/', 'desktop', '2 fewer than 14', 'too few nights to look for a shift', ''],
        ['/en/', 'mobile', '2 fewer than 14', 'too few nights to look for a shift', ''],
        ['/en/', 'desktop', '2 fewer than 14', 'too few nights to look for a shift', ''],
      ],
      [
        ['Scope', 'Device', 'Metric', 'p75', 'Good, needs improvement, poor'],
        [
          'origin',
          'phone',
          'LCP',
          '2,100 ms',
          'good: 80%needs improvement: 15%poor: 5% 80% · 15% · 5%',
        ],
      ],
      [
        [['google', '3', '40']],
        [['gustavo eklund', 'google', '3', '40', '1.5']],
        [['https://eklund.com.br/', '3', '40']],
        [
          ['eklund.com.br', "Let's Encrypt R11", '53'],
          ['gustavo.eklund.com.br', 'CERT_HAS_EXPIRED', '-'],
        ],
        [
          [
            'https://eklund.com.br/',
            '99.83%',
            '180 ms',
            '400 ms',
            'down since 2026-11-09T14:50:00.000Z',
          ],
          ['https://eklund.com.br/en/', '100%', '190 ms', '420 ms', 'up'],
        ],
      ],
    ]);
  });

  it('looks for shifts in the number asked for, and refuses one the lab does not have', async () => {
    const tbt = await render('?metric=tbt');
    const refused = await render('?metric=fid');
    expect([
      tbt.queries.calls.at(-1)[1].metric,
      PanelDocument.texts(tbt.document, 'h2')[1],
      refused.page.status,
      refused.queries.calls,
    ]).toStrictEqual(['tbt', 'Where the tbt of the median run shifted', 400, []]);
  });

  it('says what is missing when the lab has sent nothing yet', async () => {
    const { document } = await render('', {
      ...full,
      lab: (input) => ({
        ...input,
        page: null,
        form_factor: null,
        runs: [],
        sample: FakeReadings.sample(0, 14),
      }),
      crux: () => ({
        day: null,
        readings: [],
        sample: { ...FakeReadings.sample(0, 1), note: 'CrUX gives no counts.' },
      }),
      search: (input) => ({
        ...input,
        engine: null,
        totals: [],
        queries: [],
        pages: [],
        sample: FakeReadings.sample(0),
      }),
      certificates: () => ({ day: null, certificates: [], sample: FakeReadings.sample(0, 1) }),
      uptime: (input) => ({ ...input, pages: [], now: [], sample: FakeReadings.sample(0) }),
    });
    expect(PanelDocument.texts(document, '.empty')).toStrictEqual([
      'No night of the lab in this period.',
      'CrUX has reported nothing yet.',
      'None in this period.',
      'None in this period.',
      'The lab has not checked a certificate yet.',
      'None in this period.',
    ]);
  });
});
