import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FieldReport } from '@site/js/field-report/field-report.js';
import { SiteVersion } from '@site/js/field-report/site-version.js';
import { onCLS, onFCP, onINP, onLCP, onTTFB } from '@site/js/vendor/web-vitals.attribution.js';

const ENDPOINT = 'https://eklund.eklund.workers.dev/v1/page';
const VIEWS = ['1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed', '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b'];
const DEVICE = {
  viewport: '360-413',
  pixelRatio: '2',
  memory: '4',
  cores: '5-8',
  roundTrip: '100-299',
  saveData: false,
  colorScheme: 'dark',
  reducedMotion: false,
};
const LCP = {
  name: 'LCP',
  value: 1_500,
  rating: 'good',
  delta: 1_500,
  id: 'v6-1',
  entries: [],
  navigationType: 'navigate',
  attribution: { target: 'section#hero>h1', elementRenderDelay: 1_300 },
};
const SENT = {
  method: 'POST',
  keepalive: true,
  mode: 'cors',
  credentials: 'omit',
  referrerPolicy: 'no-referrer',
  priority: 'low',
};

/** The parts of a window the measurement reads, for a phone that opened `address` from a Google search. */
const phone = (address, document = {}) => {
  const page = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
    referrer: 'https://www.google.com/search?q=gustavo+eklund',
    wasDiscarded: false,
    prerendering: false,
    getElementById: () => null,
    ...document,
  });
  return Object.assign(new EventTarget(), {
    location: new URL(address),
    document: page,
    performance: {
      getEntriesByType: (type) =>
        type === 'navigation' ? [{ type: 'reload', activationStart: 0 }] : [],
    },
    innerWidth: 412,
    devicePixelRatio: 2.625,
    navigator: { deviceMemory: 4, hardwareConcurrency: 8, connection: { rtt: 150 } },
    matchMedia: (query) => ({ matches: query === '(prefers-color-scheme: dark)' }),
  });
};

describe('FieldReport', () => {
  let window, fetch, vitals, time, views, language;
  const report = (options = {}) =>
    new FieldReport({
      window,
      language: () => language,
      sections: ['status'],
      links: [['github', 'https://github.com/GustavoEklund']],
      regions: [],
      endpoint: ENDPOINT,
      vitals: Object.fromEntries(
        ['onCLS', 'onFCP', 'onINP', 'onLCP', 'onTTFB'].map((name) => [
          name,
          (callback) => (vitals[name] = callback),
        ]),
      ),
      fetch,
      randomId: () => views.shift(),
      now: () => time,
      ...options,
    });
  const hide = () => {
    window.document.visibilityState = 'hidden';
    window.dispatchEvent(new Event('visibilitychange'));
  };
  const show = () => {
    window.document.visibilityState = 'visible';
    window.dispatchEvent(new Event('visibilitychange'));
  };
  const bodies = () => fetch.mock.calls.map(([, init]) => JSON.parse(init.body));

  beforeEach(() => {
    window = phone('https://eklund.com.br/1.1.0/en/');
    fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vitals = {};
    time = 0;
    views = [...VIEWS];
    language = 'en-US';
  });

  it('sends the report of the load when the page hides, with fetch, as text, without credentials or referrer', () => {
    report().start();
    time = 4_000;
    hide();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenNthCalledWith(1, ENDPOINT, {
      ...SENT,
      body: JSON.stringify({
        v: 1,
        view: VIEWS[0],
        version: SiteVersion.NUMBER,
        page: '/en/',
        language: 'en-US',
        referrer: 'www.google.com',
        navigation: 'reload',
        device: DEVICE,
        seq: 0,
        visible: 4_000,
        vitals: [],
        events: [],
        errors: [],
      }),
    });
  });

  it('carries the vitals web-vitals reported, the events recorded and the errors of the site', () => {
    report().start();
    vitals.onLCP(LCP);
    vitals.onCLS({ ...LCP, name: 'CLS', value: 0, attribution: { loadState: 'complete' } });
    time = 1_000;
    window.dispatchEvent(
      Object.assign(new Event('error'), {
        message: 'Uncaught Error: broken',
        filename: 'https://eklund.com.br/1.1.0/assets/main-AbC.js',
        lineno: 3,
        colno: 7,
      }),
    );
    hide();
    const [sent] = bodies();
    expect([sent.vitals, sent.errors]).toStrictEqual([
      [
        {
          name: 'LCP',
          value: 1_500,
          rating: 'good',
          attribution: { target: 'section#hero>h1', elementRenderDelay: 1_300 },
        },
        { name: 'CLS', value: 0, rating: 'good', attribution: { loadState: 'complete' } },
      ],
      [
        {
          kind: 'error',
          message: 'Uncaught Error: broken',
          source: '/1.1.0/assets/main-AbC.js',
          line: 3,
          column: 7,
          at: 1_000,
        },
      ],
    ]);
  });

  it('records the events App gives it, with their detail and value, and the links that leave the site', () => {
    const measurement = report().start();
    time = 2_000;
    measurement.record('palette-open', 'shortcut');
    measurement.record('copy-email');
    measurement.record('load-test', 'finish', 21_000);
    hide();
    expect(bodies()[0].events).toStrictEqual([
      { name: 'palette-open', detail: 'shortcut', at: 2_000 },
      { name: 'copy-email', detail: '', at: 2_000 },
      { name: 'load-test', detail: 'finish', value: 21_000, at: 2_000 },
    ]);
  });

  it('sends once when the page hides and then unloads, and again when it comes back and hides with news', () => {
    const measurement = report().start();
    time = 1_000;
    hide();
    window.dispatchEvent(new Event('pagehide'));
    time = 5_000;
    show();
    time = 6_000;
    measurement.record('theme', 'light');
    hide();
    expect(bodies().map(({ seq, visible, events }) => [seq, visible, events.length])).toStrictEqual(
      [
        [0, 1_000, 0],
        [1, 2_000, 1],
      ],
    );
  });

  it('starts a new load when the page comes back from the back/forward cache, with a new code and no referrer', () => {
    report().start();
    time = 1_000;
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    time = 30_000;
    const restored = Object.assign(new Event('pageshow'), { persisted: true });
    Object.defineProperty(restored, 'timeStamp', { value: 29_000 });
    window.dispatchEvent(restored);
    hide();
    expect(
      bodies().map(({ view, seq, navigation, referrer, visible }) => [
        view,
        seq,
        navigation,
        referrer,
        visible,
      ]),
    ).toStrictEqual([
      [VIEWS[0], 0, 'reload', 'www.google.com', 1_000],
      [VIEWS[1], 0, 'back-forward-cache', '', 1_000],
    ]);
  });

  it('sends nothing after it stops, and ignores what web-vitals and the page report from then on', () => {
    const measurement = report().start();
    measurement.stop();
    vitals.onLCP(LCP);
    measurement.record('copy-email');
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'late' }));
    hide();
    window.dispatchEvent(new Event('pagehide'));
    expect(fetch).toHaveBeenCalledTimes(0);
  });

  it('measures but sends nothing when its address has no collector', () => {
    const measurement = report({ endpoint: null }).start();
    measurement.record('copy-email');
    hide();
    expect([fetch.mock.calls.length, Object.keys(vitals).sort()]).toStrictEqual([
      0,
      ['onCLS', 'onFCP', 'onINP', 'onLCP', 'onTTFB'],
    ]);
  });

  it('does nothing on a page that does not measure', () => {
    window = phone('https://eklund.com.br/privacidade/');
    report().start();
    hide();
    expect([fetch.mock.calls.length, Object.keys(vitals)]).toStrictEqual([0, []]);
  });

  it('lets a failed send go, so the page goes on', async () => {
    fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    report().start();
    hide();
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('starts once, however many times it is asked', () => {
    const measurement = report();
    measurement.start();
    measurement.start();
    hide();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('uses the real web-vitals, the collector of the page address and the browser by default', () => {
    expect(FieldReport.VITALS).toStrictEqual({ onCLS, onFCP, onINP, onLCP, onTTFB });
  });

  it('names the page without its release folder or index.html, and only the pages that run scripts', () => {
    expect(
      [
        '/',
        '/en/',
        '/index.html',
        '/en/index.html',
        '/1.1.0/',
        '/1.2.0-rc.1/en/',
        '/privacidade/',
        '/1.1.0',
        '/x/',
      ].map((pathname) => FieldReport.pageOf(pathname)),
    ).toStrictEqual(['/', '/en/', '/', '/en/', '/', '/en/', null, null, null]);
  });

  it('reads how the page was reached from its navigation entry and the document', () => {
    const document = { wasDiscarded: false, prerendering: false };
    expect([
      FieldReport.navigationOf(document, { type: 'navigate', activationStart: 0 }),
      FieldReport.navigationOf(document, { type: 'reload', activationStart: 0 }),
      FieldReport.navigationOf(document, { type: 'back_forward', activationStart: 0 }),
      FieldReport.navigationOf(document, { type: 'navigate', activationStart: 120 }),
      FieldReport.navigationOf({ ...document, prerendering: true }, undefined),
      FieldReport.navigationOf({ ...document, wasDiscarded: true }, { type: 'reload' }),
      FieldReport.navigationOf(document, undefined),
    ]).toStrictEqual([
      'navigate',
      'reload',
      'back-forward',
      'prerender',
      'prerender',
      'restore',
      'navigate',
    ]);
  });
});
