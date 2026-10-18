import { Formatter } from '../shared/format.js';

export const SERVICE_COLORS = {
  navigation: 'c0',
  network: 'c2',
  document: 'c3',
  script: 'c1',
  assets: 'c5',
  fonts: 'c4',
};

/**
 * Turns Navigation/Resource Timing and the app's own performance marks into a
 * span tree: navigation › network / document / script / assets / fonts.
 * Service ids are stable (they pick the color); every label comes from the dictionary.
 */
export class TraceBuilder {
  #readings;
  #globe;
  #translator;

  constructor({ readings, globe, translator }) {
    this.#readings = readings;
    this.#globe = globe;
    this.#translator = translator;
  }

  build() {
    const readings = this.#readings,
      globe = this.#globe;
    const navigation = readings.navigation;
    if (!navigation) return null;
    const mark = (name) => readings.markTime(name);
    const spans = [];
    const protocol = navigation.nextHopProtocol || '—';
    const rootSpan = {
      name: this.#service('navigation'),
      service: 'navigation',
      depth: 0,
      start: 0,
      end: 0,
      attributes: this.#attributes({
        type: navigation.type,
        protocol,
        status: navigation.responseStatus || '—',
        transferred: Formatter.kilobytes(navigation.transferSize),
        compressedBody: Formatter.kilobytes(navigation.encodedBodySize),
        rawBody: Formatter.kilobytes(navigation.decodedBodySize),
        redirects: navigation.redirectCount,
        delivery: navigation.deliveryType || this.#value('network'),
      }),
    };
    spans.push(rootSpan);

    const addGroup = (service, children) => {
      const valid = children.filter((child) => child.end >= child.start && child.end > 0);
      if (!valid.length) return;
      spans.push({
        name: this.#service(service),
        service,
        depth: 1,
        start: Math.min(...valid.map((c) => c.start)),
        end: Math.max(...valid.map((c) => c.end)),
        attributes: this.#attributes({ spans: valid.length }),
      });
      valid.forEach((child) => spans.push({ ...child, service, depth: 2 }));
    };

    addGroup('network', [
      {
        name: 'DNS',
        start: navigation.domainLookupStart,
        end: navigation.domainLookupEnd,
        attributes: this.#attributes({ host: location.host }),
      },
      {
        name: this.#span('connection'),
        start: navigation.connectStart,
        end: navigation.connectEnd,
        attributes: this.#attributes({
          tls:
            navigation.secureConnectionStart > 0 ? this.#value('handshake') : this.#value('reused'),
          protocol,
        }),
      },
      {
        name: 'TTFB',
        start: navigation.requestStart,
        end: navigation.responseStart,
        attributes: this.#attributes({ status: navigation.responseStatus || '—' }),
      },
      {
        name: 'download',
        start: navigation.responseStart,
        end: navigation.responseEnd,
        attributes: this.#attributes({
          transferred: Formatter.kilobytes(navigation.transferSize),
          delivery: navigation.deliveryType || this.#value('network'),
        }),
      },
    ]);
    addGroup('document', [
      {
        name: this.#span('parse'),
        start: navigation.responseEnd,
        end: navigation.domInteractive,
        attributes: this.#attributes({
          domNodes: Formatter.integer(document.querySelectorAll('*').length),
        }),
      },
      {
        name: 'DOMContentLoaded',
        start: navigation.domContentLoadedEventStart,
        end: navigation.domContentLoadedEventEnd,
        attributes: {},
      },
      {
        name: 'load',
        start: navigation.loadEventStart,
        end: navigation.loadEventEnd,
        attributes: {},
      },
    ]);
    addGroup('script', [
      {
        name: 'app',
        start: mark('app:start'),
        end: mark('app:ready'),
        attributes: this.#attributes({
          type: 'ES modules',
          modules: readings.ownResources.filter((r) => /\/js\//.test(r.name)).length,
          dependencies: 0,
        }),
      },
      {
        name: this.#span('globeSetup'),
        start: mark('globe:init'),
        end: mark('globe:ready'),
        attributes: globe
          ? this.#attributes({
              points: Formatter.integer(globe.pointCount),
              shaders: 8,
              drawCalls: 3 + globe.arcCount,
            })
          : this.#attributes({ webgl2: this.#value('unavailable') }),
      },
      {
        name: this.#span('globeFirstFrame'),
        start: mark('globe:ready'),
        end: mark('globe:first-frame'),
        attributes: globe
          ? this.#attributes({ dpr: `${globe.pixelRatio}×`, canvas: globe.canvasSize })
          : {},
      },
    ]);
    addGroup(
      'assets',
      readings.ownResources
        .slice(0, 8)
        .map((entry) => this.#resourceSpan(entry, TraceBuilder.#fileName(entry.name))),
    );
    addGroup(
      'fonts',
      readings.fontResources
        .slice(0, 6)
        .map((entry) => this.#resourceSpan(entry, TraceBuilder.#fileName(entry.name))),
    );

    const marks = [
      ['FCP', readings.firstContentfulPaint, 'c2'],
      ['LCP', readings.largestContentfulPaint, 'c1'],
    ].filter(([, time]) => time > 0);
    const total = Math.max(1, ...spans.map((span) => span.end), ...marks.map(([, time]) => time));
    rootSpan.end = total;
    return {
      spans,
      marks,
      total,
      id:
        TraceBuilder.#fnv1a(String(performance.timeOrigin)) +
        TraceBuilder.#fnv1a(String(navigation.responseEnd + total)),
      startedAt: new Date(performance.timeOrigin),
      serviceCount: new Set(spans.map((span) => span.service)).size - 1,
    };
  }

  /** 32-bit FNV-1a as 8 hex digits: a short, stable id for the trace. */
  static #fnv1a(text) {
    let hash = 0x811c9dc5;
    for (const character of text) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  /** The file name of a URL, decoded, without the query string and cut to 18 characters. */
  static #fileName(url) {
    return decodeURIComponent(url.split('/').pop().split('?')[0]).slice(0, 18);
  }

  #resourceSpan(entry, name) {
    return {
      name,
      start: entry.startTime,
      end: entry.responseEnd,
      attributes: this.#attributes({
        transferred: Formatter.kilobytes(entry.transferSize),
        protocol: entry.nextHopProtocol || '—',
        delivery: entry.deliveryType || this.#value('network'),
        blocksRender: entry.renderBlockingStatus || '—',
      }),
    };
  }

  #service(id) {
    return this.#translator.t(`trace.services.${id}`);
  }
  #span(id) {
    return this.#translator.t(`trace.spans.${id}`);
  }
  #value(id) {
    return this.#translator.t(`trace.values.${id}`);
  }

  /** { type: 'x' } with attribute ids as keys → the same pairs labelled in the active language. */
  #attributes(values) {
    return Object.fromEntries(
      Object.entries(values).map(([id, value]) => [
        this.#translator.t(`trace.attributes.${id}`),
        value,
      ]),
    );
  }
}
