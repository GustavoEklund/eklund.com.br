import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TraceBuilder, SERVICE_COLORS } from '@site/js/trace-viewer/trace-builder.js';
import { Translator } from '@site/js/i18n/translator.js';
import { Dictionaries } from '@site/js/i18n/dictionaries.js';
import { Formatter } from '@site/js/shared/format.js';
import { DictionaryText } from '../../support/dictionary-text.js';

const TIME_ORIGIN = 1000;
/** Independent FNV-1a, 8 hex digits, as the trace id is built. */
const fnv1a = (text) => {
  let hash = 0x811c9dc5;
  for (const character of text) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

const NAVIGATION = {
  type: 'navigate',
  nextHopProtocol: 'h2',
  responseStatus: 200,
  transferSize: 20480,
  encodedBodySize: 5120,
  decodedBodySize: 20480,
  redirectCount: 0,
  deliveryType: '',
  domainLookupStart: 5,
  domainLookupEnd: 15,
  connectStart: 15,
  connectEnd: 45,
  secureConnectionStart: 25,
  requestStart: 45,
  responseStart: 100,
  responseEnd: 130,
  domInteractive: 200,
  domContentLoadedEventStart: 210,
  domContentLoadedEventEnd: 212,
  loadEventStart: 300,
  loadEventEnd: 302,
};
const MARKS = {
  'app:start': 120,
  'app:ready': 180,
  'globe:init': 180,
  'globe:ready': 220,
  'globe:first-frame': 240,
};
const resource = (path, startTime, responseEnd, extra = {}) => ({
  name: path.startsWith('http') ? path : `${location.origin}${path}`,
  startTime,
  responseEnd,
  transferSize: 4096,
  nextHopProtocol: 'h2',
  renderBlockingStatus: 'non-blocking',
  deliveryType: '',
  ...extra,
});
const OWN = [
  resource('/css/site.css', 10, 60, { renderBlockingStatus: 'blocking' }),
  resource('/js/main.js', 12, 70, { transferSize: 8192 }),
];
const FONTS = [
  resource('/fonts/bricolage-grotesque-latin.woff2', 20, 80, { transferSize: 1024 }),
  resource('/fonts/font%20file.woff2', 90, 200, { transferSize: 30000 }),
];
const GLOBE = { pointCount: 10000, arcCount: 35, pixelRatio: 2, canvasSize: '800×800' };

describe('TraceBuilder', () => {
  let translator, readings;
  const attrs = (values, locale = 'pt-BR') =>
    Object.fromEntries(
      Object.entries(values).map(([id, value]) => [
        DictionaryText.entry(locale, `trace.attributes.${id}`),
        value,
      ]),
    );
  const label = (key, locale = 'pt-BR') => DictionaryText.entry(locale, key);
  const build = (globe = GLOBE) => new TraceBuilder({ readings, globe, translator }).build();

  beforeEach(() => {
    translator = new Translator({ dictionaries: Dictionaries.BY_LOCALE, locale: 'pt-BR' });
    Formatter.use('pt-BR');
    readings = {
      navigation: { ...NAVIGATION },
      markTime: vi.fn((name) => MARKS[name] ?? 0),
      ownResources: OWN,
      resources: [...OWN, ...FONTS],
      fontResources: FONTS,
      firstContentfulPaint: 150,
      largestContentfulPaint: 400,
    };
    vi.spyOn(performance, 'timeOrigin', 'get').mockReturnValue(TIME_ORIGIN);
  });

  afterEach(() => vi.restoreAllMocks());

  it('maps each service to a stable color slot', () => {
    expect(SERVICE_COLORS).toStrictEqual({
      navigation: 'c0',
      network: 'c2',
      document: 'c3',
      script: 'c1',
      assets: 'c5',
      fonts: 'c4',
    });
  });

  it('returns nothing before the browser has a navigation entry', () => {
    readings.navigation = undefined;
    expect(build()).toBeNull();
  });

  it('builds the whole trace: root, then each service group followed by its children', () => {
    const trace = build();
    const name = (service) => label(`trace.services.${service}`);
    expect(
      trace.spans.map(({ name: spanName, service, depth, start, end }) => [
        spanName,
        service,
        depth,
        start,
        end,
      ]),
    ).toStrictEqual([
      [name('navigation'), 'navigation', 0, 0, 400],
      [name('network'), 'network', 1, 5, 130],
      ['DNS', 'network', 2, 5, 15],
      [label('trace.spans.connection'), 'network', 2, 15, 45],
      ['TTFB', 'network', 2, 45, 100],
      ['download', 'network', 2, 100, 130],
      [name('document'), 'document', 1, 130, 302],
      [label('trace.spans.parse'), 'document', 2, 130, 200],
      ['DOMContentLoaded', 'document', 2, 210, 212],
      ['load', 'document', 2, 300, 302],
      [name('script'), 'script', 1, 120, 240],
      ['app', 'script', 2, 120, 180],
      [label('trace.spans.globeSetup'), 'script', 2, 180, 220],
      [label('trace.spans.globeFirstFrame'), 'script', 2, 220, 240],
      [name('assets'), 'assets', 1, 10, 70],
      ['site.css', 'assets', 2, 10, 60],
      ['main.js', 'assets', 2, 12, 70],
      [name('fonts'), 'fonts', 1, 20, 200],
      ['bricolage-grotesqu', 'fonts', 2, 20, 80],
      ['font file.woff2', 'fonts', 2, 90, 200],
    ]);
  });

  it('describes the navigation root with the page transfer details', () => {
    expect(build().spans[0].attributes).toStrictEqual(
      attrs({
        type: 'navigate',
        protocol: 'h2',
        status: 200,
        transferred: '20,0 KB',
        compressedBody: '5,0 KB',
        rawBody: '20,0 KB',
        redirects: 0,
        delivery: label('trace.values.network'),
      }),
    );
  });

  it('describes the network spans: host, tls handshake or reuse, status, delivery', () => {
    const [, group, dns, connection, ttfb, download] = build().spans.slice(0, 6);
    expect([
      group.attributes,
      dns.attributes,
      connection.attributes,
      ttfb.attributes,
      download.attributes,
    ]).toStrictEqual([
      attrs({ spans: 4 }),
      attrs({ host: location.host }),
      attrs({ tls: label('trace.values.handshake'), protocol: 'h2' }),
      attrs({ status: 200 }),
      attrs({ transferred: '20,0 KB', delivery: label('trace.values.network') }),
    ]);
  });

  it('reports a reused connection when there was no TLS handshake', () => {
    readings.navigation.secureConnectionStart = 0;
    expect(build().spans[3].attributes).toStrictEqual(
      attrs({ tls: label('trace.values.reused'), protocol: 'h2' }),
    );
  });

  it('describes the document spans: node count, and nothing for the two lifecycle events', () => {
    const [group, parse, domContentLoaded, load] = build().spans.slice(6, 10);
    expect([
      group.attributes,
      parse.attributes,
      domContentLoaded.attributes,
      load.attributes,
    ]).toStrictEqual([
      attrs({ spans: 3 }),
      attrs({ domNodes: Formatter.integer(document.querySelectorAll('*').length) }),
      {},
      {},
    ]);
  });

  it('describes the script spans: the app, the globe setup and the first frame', () => {
    const spans = build().spans;
    expect(spans.slice(11, 14).map((span) => span.attributes)).toStrictEqual([
      attrs({ type: 'ES modules', modules: 1, dependencies: 0 }),
      attrs({ points: '10.000', shaders: 8, drawCalls: 38 }),
      attrs({ dpr: '2×', canvas: '800×800' }),
    ]);
  });

  it('describes the resources with size, protocol, delivery and render blocking', () => {
    const spans = build().spans;
    expect(spans.slice(15, 17).map((span) => span.attributes)).toStrictEqual([
      attrs({
        transferred: '4,0 KB',
        protocol: 'h2',
        delivery: label('trace.values.network'),
        blocksRender: 'blocking',
      }),
      attrs({
        transferred: '8,0 KB',
        protocol: 'h2',
        delivery: label('trace.values.network'),
        blocksRender: 'non-blocking',
      }),
    ]);
  });

  it('shows a dash for the protocol and the render blocking status a browser does not report', () => {
    const bare = resource('/js/bare.js', 14, 72, { nextHopProtocol: '', renderBlockingStatus: '' });
    readings.ownResources = [bare];
    readings.resources = [bare, ...FONTS];
    expect(build().spans[15].attributes).toStrictEqual(
      attrs({
        transferred: '4,0 KB',
        protocol: '—',
        delivery: label('trace.values.network'),
        blocksRender: '—',
      }),
    );
  });

  it('marks FCP and LCP, and sizes the trace to the latest of them or of any span', () => {
    const trace = build();
    expect([trace.marks, trace.total]).toStrictEqual([
      [
        ['FCP', 150, 'c2'],
        ['LCP', 400, 'c1'],
      ],
      400,
    ]);
  });

  it('counts the services below the root', () => expect(build().serviceCount).toBe(5));

  it('derives a trace id from the time origin and the end of the response plus the total', () => {
    expect(build().id).toBe(fnv1a('1000') + fnv1a('530'));
  });

  it('records when the visit started', () =>
    expect(build().startedAt).toStrictEqual(new Date(TIME_ORIGIN)));

  it('takes the end of the last span as the total when it is later than the marks', () => {
    readings.largestContentfulPaint = 0;
    readings.firstContentfulPaint = 100;
    const trace = build();
    expect([trace.total, trace.spans[0].end, trace.marks]).toStrictEqual([
      302,
      302,
      [['FCP', 100, 'c2']],
    ]);
  });

  it('is one millisecond long when nothing was measured', () => {
    readings.navigation = { type: 'navigate' };
    readings.ownResources = [];
    readings.fontResources = [];
    readings.resources = [];
    readings.markTime = () => 0;
    readings.firstContentfulPaint = 0;
    readings.largestContentfulPaint = 0;
    const trace = build();
    expect([
      trace.total,
      trace.spans.map((span) => span.name),
      trace.marks,
      trace.serviceCount,
    ]).toStrictEqual([1, [label('trace.services.navigation')], [], 0]);
  });

  it('drops a service group when none of its children is valid', () => {
    readings.markTime = () => 0;
    const services = build().spans.map((span) => span.service);
    expect(services.filter((service, index) => services.indexOf(service) === index)).toStrictEqual([
      'navigation',
      'network',
      'document',
      'assets',
      'fonts',
    ]);
  });

  it('drops a child that ends before it starts or never ended', () => {
    readings.navigation.domainLookupStart = 20;
    readings.navigation.domainLookupEnd = 10;
    readings.navigation.loadEventEnd = 0;
    readings.navigation.loadEventStart = 0;
    const names = build().spans.map((span) => span.name);
    expect([names.includes('DNS'), names.includes('load')]).toStrictEqual([false, false]);
  });

  it('shows dashes for what the browser does not report', () => {
    readings.navigation = { ...NAVIGATION, nextHopProtocol: '', responseStatus: 0 };
    const [root, , , connection, ttfb] = build().spans;
    expect([root.attributes, connection.attributes, ttfb.attributes]).toStrictEqual([
      attrs({
        type: 'navigate',
        protocol: '—',
        status: '—',
        transferred: '20,0 KB',
        compressedBody: '5,0 KB',
        rawBody: '20,0 KB',
        redirects: 0,
        delivery: label('trace.values.network'),
      }),
      attrs({ tls: label('trace.values.handshake'), protocol: '—' }),
      attrs({ status: '—' }),
    ]);
  });

  it('uses the delivery type the browser reports, when there is one', () => {
    readings.navigation = { ...NAVIGATION, deliveryType: 'cache' };
    expect(build().spans[0].attributes[label('trace.attributes.delivery')]).toBe('cache');
  });

  it('says WebGL2 is unavailable and leaves the first frame bare when there is no globe', () => {
    const spans = build(null).spans;
    expect(spans.slice(12, 14).map((span) => span.attributes)).toStrictEqual([
      attrs({ webgl2: label('trace.values.unavailable') }),
      {},
    ]);
  });

  it('lists at most eight own resources and six font resources', () => {
    readings.ownResources = Array.from({ length: 12 }, (_, index) =>
      resource(`/js/file${index}.js`, 10 + index, 50 + index),
    );
    readings.fontResources = Array.from({ length: 9 }, (_, index) =>
      resource(`/fonts/f${index}.woff2`, 20 + index, 90 + index),
    );
    readings.resources = [...readings.ownResources, ...readings.fontResources];
    const trace = build();
    expect([
      trace.spans.filter((span) => span.service === 'assets' && span.depth === 2).length,
      trace.spans.filter((span) => span.service === 'fonts' && span.depth === 2).length,
    ]).toStrictEqual([8, 6]);
  });

  it('cuts long file names to 18 characters and decodes them', () => {
    readings.ownResources = [resource('/js/a-very-long-module-name-indeed.js', 10, 50)];
    readings.resources = readings.ownResources;
    expect(build().spans.find((span) => span.service === 'assets' && span.depth === 2).name).toBe(
      'a-very-long-module',
    );
  });

  it('writes every label in the active language', () => {
    translator.setLocale('en-US');
    Formatter.use('en-US');
    const trace = build();
    expect([trace.spans[0].name, trace.spans[0].attributes, trace.spans[3].name]).toStrictEqual([
      label('trace.services.navigation', 'en-US'),
      attrs(
        {
          type: 'navigate',
          protocol: 'h2',
          status: 200,
          transferred: '20.0 KB',
          compressedBody: '5.0 KB',
          rawBody: '20.0 KB',
          redirects: 0,
          delivery: label('trace.values.network', 'en-US'),
        },
        'en-US',
      ),
      label('trace.spans.connection', 'en-US'),
    ]);
  });
});
