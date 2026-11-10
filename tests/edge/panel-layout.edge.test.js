import { describe, it, expect } from 'vitest';
import { PanelHtml } from '../../edge/panel/panel-html.js';
import { PanelLayout } from '../../edge/panel/panel-layout.js';
import { PanelDocument } from '../support/panel-document.js';

const HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'content-type': 'text/html; charset=utf-8',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow',
};

describe('PanelLayout', () => {
  it('wraps a page in the menu, marks the current entry, and sends it with a strict policy, out of caches and search', async () => {
    const response = PanelLayout.page({
      title: 'Web Vitals',
      path: '/vitals',
      body: PanelHtml.html`<p>${'<b>'}</p>`,
      email: 'owner@example.com',
    });
    const page = PanelDocument.parse(await response.text());
    expect([
      response.status,
      Object.fromEntries(response.headers),
      page.title,
      PanelDocument.texts(page, 'nav a'),
      PanelDocument.texts(page, 'nav a[aria-current="page"]'),
      PanelDocument.texts(page, '.who'),
      PanelDocument.texts(page, 'main'),
      [...page.querySelectorAll('link, script')].map((element) => element.outerHTML),
      page.querySelector('meta[name="robots"]').getAttribute('content'),
    ]).toStrictEqual([
      200,
      HEADERS,
      'Web Vitals · eklund.com.br panel',
      ['Overview', 'Web Vitals', 'Events and errors', 'Lab', 'Recordings', 'Heat map'],
      ['Web Vitals'],
      ['owner@example.com · Sign out'],
      ['Web Vitals <b>'],
      ['<link rel="stylesheet" href="/assets/panel.css">'],
      'noindex, nofollow',
    ]);
  });

  it("marks the overview only on its own path, a replay under its list, and loads a page's scripts and styles with its policy", async () => {
    const response = PanelLayout.page({
      status: 404,
      title: 'Recording 3f2b8c1e',
      path: '/recordings/3f2b8c1e',
      body: '',
      scripts: ['/assets/replay-start.js'],
      styles: ['/assets/rrweb-replay.css'],
      policy: PanelLayout.REPLAY_POLICY,
    });
    const page = PanelDocument.parse(await response.text());
    expect([
      response.status,
      response.headers.get('content-security-policy'),
      PanelDocument.texts(page, 'nav a[aria-current="page"]'),
      page.querySelector('.who'),
      [...page.querySelectorAll('link, script')].map((element) => element.outerHTML),
    ]).toStrictEqual([
      404,
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://eklund.com.br https://gustavo.eklund.com.br; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      ['Recordings'],
      null,
      [
        '<link rel="stylesheet" href="/assets/panel.css">',
        '<link rel="stylesheet" href="/assets/rrweb-replay.css">',
        '<script type="module" src="/assets/replay-start.js"></script>',
      ],
    ]);
  });

  it('answers in plain text with the same headers', async () => {
    const response = PanelLayout.text(405, 'Method not allowed\n', { allow: 'GET, HEAD' });
    expect([
      response.status,
      Object.fromEntries(response.headers),
      await response.text(),
    ]).toStrictEqual([
      405,
      {
        allow: 'GET, HEAD',
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
        'cross-origin-opener-policy': 'same-origin',
        'cross-origin-resource-policy': 'same-origin',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'x-robots-tag': 'noindex, nofollow',
      },
      'Method not allowed\n',
    ]);
  });

  it('builds a form of days and choices that keeps what was asked for, with an empty choice unless one is required', () => {
    const form = PanelDocument.parse(
      PanelLayout.form('/vitals', [
        { name: 'from', label: 'From', value: '2026-11-01' },
        { name: 'page', label: 'Page', value: '/en/', options: ['/', '/en/'] },
        { name: 'metric', label: 'Metric', value: 'LCP', options: ['INP', 'LCP'], required: true },
        { name: 'device', label: 'Device', value: null, options: ['phone'] },
      ]),
    ).querySelector('form');
    expect([
      form.getAttribute('action'),
      // The option marked selected in the markup, which is what a browser shows first.
      [...form.querySelectorAll('input, select')].map((field) => [
        field.getAttribute('name'),
        field.tagName === 'INPUT'
          ? field.getAttribute('value')
          : ([...field.querySelectorAll('option')].find((option) => option.hasAttribute('selected'))
              ?.textContent ?? null),
      ]),
      [...form.querySelectorAll('select')].map((select) =>
        [...select.options].map((option) => option.value),
      ),
    ]).toStrictEqual([
      '/vitals',
      [
        ['from', '2026-11-01'],
        ['page', '/en/'],
        ['metric', 'LCP'],
        ['device', 'any'],
      ],
      [
        ['', '/', '/en/'],
        ['INP', 'LCP'],
        ['', 'phone'],
      ],
    ]);
  });

  it('says how large a sample is, and when it is too small to conclude anything', () => {
    expect([
      PanelLayout.sample({ size: 30, minimum: 20, enough: true }, 'views').toString(),
      PanelLayout.sample({ size: 3, minimum: 20, enough: false }).toString(),
    ]).toStrictEqual([
      '<p class="sample">Sample: 30 views.</p>',
      '<p class="sample is-small">Sample too small: 3 values, and a conclusion needs at least 20.</p>',
    ]);
  });

  it('turns a refused query string into a 400 that says why', () => {
    const invalid = PanelLayout.invalid('to: to comes before from');
    expect([
      invalid.status,
      invalid.title,
      PanelDocument.texts(PanelDocument.parse(invalid.body), 'p'),
    ]).toStrictEqual([
      400,
      'Not a request the panel reads',
      ['to: to comes before from.', 'Start again with the last 28 days.'],
    ]);
  });
});
