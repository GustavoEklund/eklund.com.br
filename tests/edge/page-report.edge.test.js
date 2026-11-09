import { describe, it, expect } from 'vitest';
import { PageReport } from '../../edge/src/page-report.js';
import { PageReports } from '../support/page-reports.js';

const parse = (report) => PageReport.parse(JSON.stringify(report));
const reasonFor = (change) => parse(PageReports.with(change)).reason;

describe('PageReport.parse', () => {
  it('reads a complete report into the shape the store writes', () => {
    expect(parse(PageReports.complete())).toStrictEqual({
      ok: true,
      report: {
        view: PageReports.VIEW,
        seq: 0,
        version: '1.2.0',
        page: '/',
        language: 'pt-BR',
        referrer: 'www.google.com',
        navigation: 'navigate',
        visible: 5_000,
        device: {
          viewport: '360-413',
          pixelRatio: '3+',
          memory: '4',
          cores: '5-8',
          roundTrip: '100-299',
          saveData: false,
          colorScheme: 'dark',
          reducedMotion: false,
        },
        vitals: [
          {
            name: 'LCP',
            value: 2_100.5,
            rating: 'good',
            attribution: {
              target: 'section#hero>h1',
              url: '',
              timeToFirstByte: 120,
              resourceLoadDelay: 0,
              resourceLoadDuration: 0,
              elementRenderDelay: 1_980.5,
            },
          },
          {
            name: 'INP',
            value: 96,
            rating: 'good',
            attribution: {
              interactionTarget: 'button#theme-toggle',
              interactionType: 'pointer',
              inputDelay: 4,
              processingDuration: 60,
              presentationDelay: 32,
              loadState: 'complete',
              scriptUrl: '/assets/main-AbC123.js',
              scriptFunction: 'toggle',
              scriptInvoker: 'BUTTON#theme-toggle.onclick',
              scriptSubpart: 'processing-duration',
              scriptDuration: 55,
            },
          },
          { name: 'CLS', value: 0, rating: 'good', attribution: { loadState: 'complete' } },
        ],
        events: [
          { name: 'section', detail: 'carga', value: null, at: 4_000 },
          { name: 'copy-email', detail: null, value: null, at: 4_500 },
          { name: 'load-test', detail: 'finish', value: 30_000, at: 34_500 },
        ],
        errors: [
          {
            kind: 'error',
            message: "TypeError: Cannot read properties of undefined (reading 'width')",
            source: '/assets/main-AbC123.js',
            line: 1,
            column: 2_345,
            at: 1_200,
          },
        ],
      },
    });
  });

  it('reads an empty referrer as a visit without one, and empty lists as nothing to store', () => {
    const { report } = parse(
      PageReports.with((report) => {
        report.referrer = '';
        report.vitals = [];
        report.events = [];
        report.errors = [];
      }),
    );
    expect([report.referrer, report.vitals, report.events, report.errors]).toStrictEqual([
      null,
      [],
      [],
      [],
    ]);
  });

  it('accepts a report at every limit: a hundred events, twenty errors, a day of visibility', () => {
    const report = PageReports.with((report) => {
      report.visible = 86_400_000;
      report.events = Array.from({ length: 100 }, (_, at) => ({ name: 'hue', detail: '', at }));
      report.errors = Array.from({ length: 20 }, () => ({ ...report.errors[0] }));
    });
    expect([parse(report).ok, JSON.stringify(report).length <= 16_384]).toStrictEqual([true, true]);
  });

  it('refuses text that is not a report, with the reason', () => {
    expect([
      PageReport.parse('{"v":1'),
      PageReport.parse('x'.repeat(16_385)),
      PageReport.parse('[]'),
      PageReport.parse('null'),
    ]).toStrictEqual([
      { ok: false, reason: 'the report is not JSON' },
      { ok: false, reason: 'the report is too long' },
      { ok: false, reason: 'the report is not an object' },
      { ok: false, reason: 'the report is not an object' },
    ]);
  });

  it('refuses a report with a field missing, an unknown field or another version', () => {
    expect([
      reasonFor((report) => delete report.visible),
      reasonFor((report) => (report.ip = '203.0.113.7')),
      reasonFor((report) => (report.v = 2)),
      reasonFor((report) => delete report.device.memory),
      reasonFor((report) => (report.device.userAgent = 'Mozilla/5.0')),
    ]).toStrictEqual([
      'the report has no visible',
      'the report has an unknown field, ip',
      'v is not a version this collector reads',
      'device has no memory',
      'device has an unknown field, userAgent',
    ]);
  });

  it('refuses a value outside its closed list or its form', () => {
    expect([
      reasonFor((report) => (report.view = PageReports.VIEW.toUpperCase())),
      reasonFor((report) => (report.version = 'latest')),
      reasonFor((report) => (report.page = '/admin/')),
      reasonFor((report) => (report.language = 'es-ES')),
      reasonFor((report) => (report.referrer = 'https://www.google.com/search?q=gustavo')),
      reasonFor((report) => (report.navigation = 'typed')),
      reasonFor((report) => (report.device.viewport = '390')),
      reasonFor((report) => (report.device.saveData = 'false')),
    ]).toStrictEqual([
      'view does not have the expected form',
      'version does not have the expected form',
      'page is not one of the allowed values',
      'language is not one of the allowed values',
      'referrer does not have the expected form',
      'navigation is not one of the allowed values',
      'device.viewport is not one of the allowed values',
      'device.saveData is not true or false',
    ]);
  });

  it('refuses numbers that are negative, fractional where whole, too large or not numbers', () => {
    expect([
      reasonFor((report) => (report.seq = -1)),
      reasonFor((report) => (report.seq = 1.5)),
      reasonFor((report) => (report.visible = 86_400_001)),
      reasonFor((report) => (report.vitals[0].value = Number.NaN)),
      reasonFor((report) => (report.vitals[2].value = 100.5)),
      reasonFor((report) => (report.events[2].value = -30)),
    ]).toStrictEqual([
      'seq is not a whole number between 0 and 1000',
      'seq is not a whole number between 0 and 1000',
      'visible is not a whole number between 0 and 86400000',
      'vitals[0].value is not a number between 0 and 86400000',
      'vitals[2].value is not a number between 0 and 100',
      'events[2].value is not a number between 0 and 86400000',
    ]);
  });

  it('refuses a metric twice, an attribution field of another metric and a script address with a query', () => {
    expect([
      reasonFor((report) => report.vitals.push({ ...report.vitals[0] })),
      reasonFor((report) => (report.vitals[0].attribution.interactionTarget = 'button')),
      reasonFor((report) => (report.vitals[1].attribution.scriptUrl = '/assets/main.js?v=2')),
      reasonFor((report) => (report.vitals[1].attribution.scriptUrl = 'https://cdn.example/x.js')),
      reasonFor((report) => (report.vitals[0].attribution.target = 'h1 \u0007')),
    ]).toStrictEqual([
      'vitals names a metric twice',
      'vitals[0].attribution has an unknown field, interactionTarget',
      'vitals[1].attribution.scriptUrl does not have the expected form',
      'vitals[1].attribution.scriptUrl does not have the expected form',
      'vitals[0].attribution.target does not have the expected form',
    ]);
  });

  it('refuses an event outside its list, and a detail where the event has none', () => {
    expect([
      reasonFor((report) => (report.events[0].name = 'scroll')),
      reasonFor((report) => (report.events[0].detail = 'secret-section')),
      reasonFor((report) => (report.events[1].detail = 'someone@example.com')),
      reasonFor((report) => delete report.events[0].detail),
    ]).toStrictEqual([
      'events[0].name is not one of the allowed values',
      'events[0].detail is not one of the allowed values',
      'events[1].detail must be empty for this event',
      'events[0] has no detail',
    ]);
  });

  it('refuses errors with a control character in the message or a source with a query', () => {
    expect([
      reasonFor((report) => (report.errors[0].message = 'line one\nline two')),
      reasonFor((report) => (report.errors[0].source = '/assets/main.js?token=1')),
      reasonFor((report) => (report.errors[0].kind = 'warning')),
    ]).toStrictEqual([
      'errors[0].message does not have the expected form',
      'errors[0].source does not have the expected form',
      'errors[0].kind is not one of the allowed values',
    ]);
  });

  it('keeps a message in any language and a source from another origin as other', () => {
    const { report } = parse(
      PageReports.with((report) => {
        report.errors[0].message = 'TypeError: x não é uma função';
        report.errors[0].source = 'other';
      }),
    );
    expect([report.errors[0].message, report.errors[0].source]).toStrictEqual([
      'TypeError: x não é uma função',
      'other',
    ]);
  });

  it('refuses lists longer than their limit', () => {
    expect([
      reasonFor((report) => {
        report.events = Array.from({ length: 101 }, (_, at) => ({ name: 'hue', detail: '', at }));
      }),
      reasonFor((report) => {
        report.errors = Array.from({ length: 21 }, () => ({ ...report.errors[0] }));
      }),
      reasonFor((report) => {
        report.vitals = Array.from({ length: 6 }, () => ({ ...report.vitals[2] }));
      }),
    ]).toStrictEqual([
      'events has more than 100 items',
      'errors has more than 20 items',
      'vitals has more than 5 items',
    ]);
  });
});
