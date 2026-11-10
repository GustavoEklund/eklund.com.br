import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import fc from 'fast-check';
import { PageReport } from '../../edge/src/page-report.js';
import { ReportVocabulary as Words } from '../../edge/src/report-vocabulary.js';
import { FieldReport } from '../../source/js/field-report/field-report.js';
import { LoadReport } from '../../source/js/field-report/load-report.js';
import { PageActivity } from '../../source/js/field-report/page-activity.js';
import { SiteVersion } from '../../source/js/field-report/site-version.js';
import { VitalSummary } from '../../source/js/field-report/vital-summary.js';
import { SiteSource } from '../support/site-source.js';

const PROJECT = join(import.meta.dirname, '..', '..');
const SCHEMA = JSON.parse(
  readFileSync(new URL('./schemas/page-report.schema.json', import.meta.url), 'utf8'),
);
const validate = new Ajv({ allErrors: true, strict: true }).compile(SCHEMA);
const MAIN = SiteSource.read('js/main.js');
/** [what the schema says, what the collector says] about the text a page sends. */
const verdicts = (text) => [validate(JSON.parse(text)), PageReport.parse(text).ok];

/** A page of the site on a phone, as the browser shows it to the measurement, and every report it sends. */
class PhonePage {
  sent = [];
  vitals = {};
  time = 0;

  constructor(address = 'https://eklund.com.br/') {
    this.document = Object.assign(new EventTarget(), {
      visibilityState: 'visible',
      referrer: 'https://www.google.com/',
      wasDiscarded: false,
      prerendering: false,
      getElementById: () => null,
    });
    this.window = Object.assign(new EventTarget(), {
      location: new URL(address),
      document: this.document,
      performance: { getEntriesByType: () => [{ type: 'navigate', activationStart: 0 }] },
      innerWidth: 390,
      devicePixelRatio: 3,
      navigator: { hardwareConcurrency: 6 },
      matchMedia: () => ({ matches: false }),
    });
    this.measurement = new FieldReport({
      window: this.window,
      language: () => Words.LANGUAGES[1],
      sections: Words.SECTIONS,
      links: [],
      regions: [],
      endpoint: 'https://eklund.eklund.workers.dev/v1/page',
      vitals: Object.fromEntries(
        Object.keys(FieldReport.VITALS).map((name) => [
          name,
          (callback) => (this.vitals[name] = callback),
        ]),
      ),
      fetch: (address, { body }) => this.sent.push(body) && Promise.resolve(),
      randomId: () => '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
      now: () => this.time,
    }).start();
  }

  hide() {
    this.document.visibilityState = 'hidden';
    this.window.dispatchEvent(new Event('visibilitychange'));
  }

  dispatch(type, fields) {
    this.window.dispatchEvent(Object.assign(new Event(type), fields));
  }
}

/** What web-vitals' attribution build reports, with every field it has, in the ranges a slow page reaches. */
const METRICS = [
  {
    name: 'LCP',
    value: 4_812.3,
    rating: 'poor',
    attribution: {
      target: 'section#hero > div.globe > canvas#globe-canvas',
      url: 'https://eklund.com.br/assets/hero.webp?v=2',
      timeToFirstByte: 320.5,
      resourceLoadDelay: 12,
      resourceLoadDuration: 900,
      elementRenderDelay: 3_579.8,
      navigationEntry: {},
      lcpEntry: {},
      lcpResourceEntry: {},
    },
  },
  {
    name: 'INP',
    value: 512,
    rating: 'poor',
    attribution: {
      interactionTarget: 'li#command-palette-option-3',
      interactionTime: 9_000,
      interactionType: 'keyboard',
      nextPaintTime: 9_512,
      processedEventEntries: [],
      inputDelay: 30,
      processingDuration: 420,
      presentationDelay: 62,
      loadState: 'complete',
      longAnimationFrameEntries: [],
      longestScript: {
        entry: {
          sourceURL: 'https://eklund.com.br/assets/main-AbC123.js',
          sourceFunctionName: '#render',
          invoker: 'Window.addEventListener:keydown',
        },
        subpart: 'processing-duration',
        intersectingDuration: 400,
      },
      totalScriptDuration: 410,
      totalStyleAndLayoutDuration: 60,
      totalPaintDuration: 12,
      totalUnattributedDuration: 30,
    },
  },
  {
    name: 'CLS',
    value: 0.31,
    rating: 'poor',
    attribution: {
      largestShiftTarget: 'footer.container > p',
      largestShiftTime: 1_200,
      largestShiftValue: 0.3,
      loadState: 'dom-content-loaded',
    },
  },
  {
    name: 'FCP',
    value: 1_000,
    rating: 'good',
    attribution: { timeToFirstByte: 320.5, firstByteToFCP: 679.5, loadState: 'loading' },
  },
  {
    name: 'TTFB',
    value: 320.5,
    rating: 'needs-improvement',
    attribution: {
      waitingDuration: 1,
      cacheDuration: 0,
      dnsDuration: 40,
      connectionDuration: 80,
      requestDuration: 199.5,
    },
  },
];

describe('the page report contract, against the page that sends it', () => {
  it('holds every metric, every event with every detail and every kind of error the page sends, and the collector takes it', () => {
    const page = new PhonePage();
    for (const metric of METRICS) page.vitals[`on${metric.name}`](metric);
    for (const [name, details] of Object.entries(Words.EVENTS))
      for (const detail of details.length ? details : [undefined])
        page.measurement.record(name, detail, name === 'section' ? 1_500.5 : undefined);
    page.time = 2_000;
    page.dispatch('error', {
      message: 'Uncaught TypeError: x is not a function',
      filename: 'https://eklund.com.br/assets/main-AbC123.js',
      lineno: 1,
      colno: 9_999,
    });
    page.dispatch('unhandledrejection', { reason: new Error('falhou\nde novo') });
    page.dispatch('securitypolicyviolation', {
      effectiveDirective: 'connect-src',
      blockedURI: 'https://other.example/x',
      sourceFile: 'https://eklund.com.br/assets/main-AbC123.js',
      lineNumber: 1,
      columnNumber: 2,
    });
    page.time = 60_000;
    page.hide();
    const [text] = page.sent;
    const report = JSON.parse(text);
    expect([
      page.sent.length,
      verdicts(text),
      report.vitals.map(({ name }) => name),
      report.events.length,
      report.errors.map(({ kind }) => kind),
    ]).toStrictEqual([
      1,
      [true, true],
      ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'],
      Object.values(Words.EVENTS).reduce((sum, details) => sum + Math.max(details.length, 1), 0),
      ['error', 'rejection', 'csp'],
    ]);
  });

  it('takes whatever web-vitals reports into a report the collector accepts: any text, any number, any choice', () => {
    const text = fc.oneof(
      fc.string({ maxLength: 300 }),
      fc.string({ unit: 'binary', maxLength: 300 }),
    );
    const number = fc.oneof(
      fc.double(),
      fc.integer(),
      fc.constant(undefined),
      fc.constant(Number.NaN),
      fc.constant(-1),
    );
    const anything = fc.oneof(text, number, fc.constant(null));
    const attribution = fc.record({
      target: anything,
      url: fc.oneof(fc.webUrl(), text, fc.constant('https://eklund.com.br/a?b#c')),
      timeToFirstByte: number,
      resourceLoadDelay: number,
      elementRenderDelay: number,
      interactionTarget: anything,
      interactionType: anything,
      inputDelay: number,
      loadState: anything,
      longestScript: fc.record({
        entry: fc.record({ sourceURL: anything, sourceFunctionName: anything, invoker: anything }),
        subpart: anything,
        intersectingDuration: number,
      }),
      totalPaintDuration: number,
      largestShiftTarget: anything,
      largestShiftValue: number,
      firstByteToFCP: number,
      dnsDuration: number,
    });
    const metrics = fc.uniqueArray(
      fc.record({
        name: fc.constantFrom(...VitalSummary.METRICS),
        value: number,
        rating: fc.constantFrom(...Words.RATINGS),
        attribution,
      }),
      { selector: ({ name }) => name, maxLength: 5 },
    );
    fc.assert(
      fc.property(metrics, (reported) => {
        const page = new PhonePage();
        for (const metric of reported) page.vitals[`on${metric.name}`](metric);
        page.hide();
        expect(verdicts(page.sent[0])).toStrictEqual([true, true]);
      }),
      { numRuns: 300 },
    );
  });

  it('takes any error message, file and position into a report the collector accepts', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: 'binary', maxLength: 400 }),
        fc.oneof(fc.webUrl(), fc.constant('https://eklund.com.br/js/a b.js?x=1')),
        fc.oneof(fc.integer(), fc.double(), fc.constant(undefined)),
        (message, filename, position) => {
          const page = new PhonePage('https://eklund.com.br/');
          page.dispatch('error', { message, filename, lineno: position, colno: position });
          page.dispatch('unhandledrejection', { reason: message });
          page.hide();
          expect(verdicts(page.sent[0])).toStrictEqual([true, true]);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('sends the pages and the release folders the collector reads', () => {
    const pages = ['/', '/en/', '/1.1.0/', '/1.1.0/en/', '/en/index.html'].map((path) => {
      const page = new PhonePage(`https://eklund.com.br${path}`);
      page.hide();
      return JSON.parse(page.sent[0]).page;
    });
    expect(pages).toStrictEqual(['/', '/en/', '/', '/en/', '/en/']);
  });

  it('keeps the limits of the collector', () => {
    const { characters, events, errors, sequence, milliseconds } = PageReport.LIMITS;
    expect(LoadReport.LIMITS).toStrictEqual({ characters, events, errors, sequence, milliseconds });
  });

  it('reports the version that package.json names', () => {
    const { version } = JSON.parse(readFileSync(join(PROJECT, 'package.json'), 'utf8'));
    expect(SiteVersion.NUMBER).toBe(version);
  });

  it('records from App only the palette commands the collector knows, and all of them', () => {
    const ids = [
      ...MAIN.matchAll(/command\(\s*'(\w+)'/g),
      ...MAIN.matchAll(/'(pauseMotion|resumeMotion)'/g),
    ].map(([, id]) => id);
    expect([...new Set(ids)].sort()).toStrictEqual([...Words.PALETTE_COMMANDS].sort());
  });

  it('records from App only events from the fixed lists, with a detail from them when the detail is written out', () => {
    const calls = [...MAIN.matchAll(/#record\('([a-z-]+)'(?:,\s*(?:'([^']*)'|([^,)]+)))?/g)].map(
      ([, name, literal, computed]) => [name, literal ?? (computed ? null : '')],
    );
    const left = [...MAIN.matchAll(/leave\('([a-z]+)'/g)].map(([, detail]) => ['outbound', detail]);
    const measured = (key) =>
      [
        ...MAIN.match(new RegExp(`  ${key}: \\[([\\s\\S]*?)\\n  \\],`))[1].matchAll(
          /\['([a-z-]+)'/g,
        ),
      ].map(([, detail]) => detail);
    const outside = [
      ...calls,
      ...left,
      ...measured('links').map((detail) => ['outbound', detail]),
      ...measured('regions').map((detail) => ['interact', detail]),
    ].filter(
      ([name, detail]) =>
        !Object.hasOwn(Words.EVENTS, name) ||
        (detail !== null &&
          !(Words.EVENTS[name].length ? Words.EVENTS[name].includes(detail) : detail === '')),
    );
    expect([
      [...new Set(calls.map(([name]) => name))].sort(),
      measured('links').length + measured('regions').length,
      outside,
    ]).toStrictEqual([
      [
        'copy-email',
        'hue',
        'language',
        'load-test',
        'motion',
        'outbound',
        'palette-command',
        'palette-open',
        'theme',
      ],
      7,
      [],
    ]);
  });

  it('measures the sections the collector knows, and places rage clicks only where it knows', () => {
    const sections = [...MAIN.matchAll(/selector: '#(\w+)'/g)]
      .map(([, id]) => id)
      .filter((id) => id !== 'hero');
    expect([sections, [...sections, ...PageActivity.PLACES]]).toStrictEqual([
      Words.SECTIONS,
      Words.EVENTS['rage-click'],
    ]);
  });
});
