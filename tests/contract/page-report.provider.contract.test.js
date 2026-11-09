import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import fc from 'fast-check';
import { PageReport } from '../../edge/src/page-report.js';
import { ReportVocabulary as Words } from '../../edge/src/report-vocabulary.js';
import { PageReports } from '../support/page-reports.js';

const SCHEMA = JSON.parse(
  readFileSync(new URL('./schemas/page-report.schema.json', import.meta.url), 'utf8'),
);
const validate = new Ajv({ allErrors: true, strict: true }).compile(SCHEMA);
/** [what the schema says, what the collector says] about one report. */
const verdicts = (report) => [validate(report), PageReport.parse(JSON.stringify(report)).ok];
const enumAt = (path) => path.reduce((node, key) => node[key], SCHEMA.properties).enum;

/** Reports the schema allows, built only from the closed lists and the limits of the contract. */
const REPORTS = fc.record({
  v: fc.constant(1),
  view: fc.uuid({ version: 4 }),
  seq: fc.integer({ min: 0, max: 1_000 }),
  version: fc.tuple(fc.nat(999), fc.nat(999), fc.nat(999)).map((parts) => parts.join('.')),
  page: fc.constantFrom(...Words.PAGES),
  language: fc.constantFrom(...Words.LANGUAGES),
  referrer: fc.oneof(
    fc.constant(''),
    fc.domain().map((domain) => domain.toLowerCase()),
  ),
  navigation: fc.constantFrom(...Words.NAVIGATION_TYPES),
  visible: fc.integer({ min: 0, max: 86_400_000 }),
  device: fc.record({
    viewport: fc.constantFrom(...Words.VIEWPORT_WIDTHS),
    pixelRatio: fc.constantFrom(...Words.PIXEL_RATIOS),
    memory: fc.constantFrom(...Words.MEMORIES),
    cores: fc.constantFrom(...Words.CORES),
    roundTrip: fc.constantFrom(...Words.ROUND_TRIPS),
    saveData: fc.boolean(),
    colorScheme: fc.constantFrom(...Words.COLOR_SCHEMES),
    reducedMotion: fc.boolean(),
  }),
  vitals: fc.subarray(Words.METRICS).chain((metrics) =>
    fc.tuple(
      ...metrics.map((name) =>
        fc.record({
          name: fc.constant(name),
          value: fc.double({ min: 0, max: name === 'CLS' ? 100 : 600_000, noNaN: true }),
          rating: fc.constantFrom(...Words.RATINGS),
          attribution: fc.constant({}),
        }),
      ),
    ),
  ),
  events: fc.array(
    fc.constantFrom(...Object.entries(Words.EVENTS)).chain(([name, details]) =>
      fc.record({
        name: fc.constant(name),
        detail: details.length ? fc.constantFrom(...details) : fc.constant(''),
        at: fc.integer({ min: 0, max: 86_400_000 }),
      }),
    ),
    { maxLength: 20 },
  ),
  errors: fc.array(
    fc.record({
      kind: fc.constantFrom(...Words.ERROR_KINDS),
      message: fc.string({ maxLength: 60 }).filter((text) => !/\p{Cc}/u.test(text)),
      source: fc.constantFrom('', 'other', '/assets/main-AbC123.js'),
      line: fc.nat(10_000),
      column: fc.nat(10_000),
      at: fc.integer({ min: 0, max: 86_400_000 }),
    }),
    { maxLength: 5 },
  ),
});

describe('the page report contract, against the collector that reads it', () => {
  it('has the closed lists of the collector, value for value', () => {
    expect([
      enumAt(['page']),
      enumAt(['language']),
      enumAt(['navigation']),
      enumAt(['device', 'properties', 'viewport']),
      enumAt(['device', 'properties', 'pixelRatio']),
      enumAt(['device', 'properties', 'memory']),
      enumAt(['device', 'properties', 'cores']),
      enumAt(['device', 'properties', 'roundTrip']),
      enumAt(['device', 'properties', 'colorScheme']),
      SCHEMA.properties.vitals.items.oneOf.map((vital) => vital.properties.name.const),
      SCHEMA.properties.vitals.items.oneOf.map((vital) =>
        Object.keys(vital.properties.attribution.properties),
      ),
      SCHEMA.properties.events.items.oneOf.map((event) => [
        event.properties.name.const,
        event.properties.detail.enum ?? [],
      ]),
      enumAt(['errors', 'items', 'properties', 'kind']),
    ]).toStrictEqual([
      Words.PAGES,
      Words.LANGUAGES,
      Words.NAVIGATION_TYPES,
      Words.VIEWPORT_WIDTHS,
      Words.PIXEL_RATIOS,
      Words.MEMORIES,
      Words.CORES,
      Words.ROUND_TRIPS,
      Words.COLOR_SCHEMES,
      Words.METRICS,
      Words.METRICS.map((metric) => {
        const { text, number, choice } = Words.ATTRIBUTION[metric];
        return [...text, ...number, ...Object.keys(choice)];
      }),
      Object.entries(Words.EVENTS),
      Words.ERROR_KINDS,
    ]);
  });

  it('allows the complete report, and so does the collector', () => {
    expect(verdicts(PageReports.complete())).toStrictEqual([true, true]);
  });

  it('allows every event with every detail, and so does the collector', () => {
    const reports = Object.entries(Words.EVENTS).flatMap(([name, details]) =>
      (details.length ? details : ['']).map((detail) =>
        PageReports.with((report) => (report.events = [{ name, detail, at: 0 }])),
      ),
    );
    expect(reports.map(verdicts)).toStrictEqual(reports.map(() => [true, true]));
  });

  it('refuses, with the collector, every report outside the contract', () => {
    const outside = [
      (report) => (report.v = 2),
      (report) => (report.ip = '203.0.113.7'),
      (report) => delete report.device,
      (report) => (report.page = '/admin/'),
      (report) => (report.referrer = 'https://www.google.com/search?q=gustavo'),
      (report) => (report.device.viewport = '390'),
      (report) => (report.vitals[0].attribution.interactionTarget = 'button'),
      (report) => (report.vitals[1].attribution.scriptUrl = '/assets/main.js?v=2'),
      (report) => (report.vitals[2].value = 100.5),
      (report) => (report.events[0].detail = 'secret-section'),
      (report) => (report.events[1].detail = 'someone@example.com'),
      (report) => (report.errors[0].message = 'line one\nline two'),
      (report) => (report.errors = Array.from({ length: 21 }, () => ({ ...report.errors[0] }))),
    ].map((change) => verdicts(PageReports.with(change)));
    expect(outside).toStrictEqual(outside.map(() => [false, false]));
  });

  it('leaves one rule to the collector alone: a metric reported twice in the same report', () => {
    expect(
      verdicts(PageReports.with((report) => report.vitals.push({ ...report.vitals[2] }))),
    ).toStrictEqual([true, false]);
  });

  it('agrees with the collector on any report built from the closed lists', () => {
    fc.assert(
      fc.property(REPORTS, (report) => {
        expect(verdicts(report)).toStrictEqual([true, true]);
      }),
      { numRuns: 300 },
    );
  });
});
