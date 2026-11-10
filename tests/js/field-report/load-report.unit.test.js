import { describe, it, expect } from 'vitest';
import { LoadReport } from '@site/js/field-report/load-report.js';

const VIEW = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';
const DEVICE = {
  viewport: '360-413',
  pixelRatio: '3+',
  memory: '4',
  cores: '5-8',
  roundTrip: '100-299',
  saveData: false,
  colorScheme: 'dark',
  reducedMotion: false,
};
const IDENTITY = {
  v: 1,
  view: VIEW,
  version: '1.1.0',
  page: '/',
  language: 'pt-BR',
  referrer: 'www.google.com',
  navigation: 'navigate',
  device: DEVICE,
};
const LCP = { name: 'LCP', value: 1_200, rating: 'good', attribution: { target: 'h1' } };
const CLS = { name: 'CLS', value: 0, rating: 'good', attribution: {} };
const ERROR = { kind: 'error', message: 'TypeError: x', source: '/js/main.js', line: 1, column: 2 };

const load = (fields = {}) =>
  new LoadReport({ ...IDENTITY, startedAt: 0, visible: true, ...fields });
const parsed = (text) => (text === null ? null : JSON.parse(text));

describe('LoadReport', () => {
  it('sends the load, its device and how long it was visible in the first report, even with nothing else', () => {
    expect(parsed(load().next(2_500.4))).toStrictEqual({
      ...IDENTITY,
      seq: 0,
      visible: 2_500,
      vitals: [],
      events: [],
      errors: [],
    });
  });

  it('counts only the time the page was visible, across hides and shows', () => {
    const report = load({ startedAt: 100, visible: false });
    report.show(1_000);
    report.hide(3_000);
    report.hide(3_500);
    report.show(10_000);
    report.show(10_500);
    report.hide(11_000);
    expect(parsed(report.next(20_000)).visible).toBe(3_000);
  });

  it('sends each metric with its latest value, and events and errors once, with the time since the load started', () => {
    const report = load({ startedAt: 1_000 });
    report.setVital(LCP);
    report.setVital(null);
    report.addEvent({ name: 'section', detail: 'carga' }, 5_000);
    report.addEvent({ name: 'load-test', detail: 'finish', value: 20_000.5 }, 26_000.6);
    report.addError(ERROR, 1_500);
    const first = parsed(report.next(30_000));
    report.setVital({ ...LCP, value: 1_300 });
    report.setVital(CLS);
    report.addEvent({ name: 'copy-email' }, 31_000);
    const second = parsed(report.next(32_000));
    expect([
      [first.seq, first.vitals, first.events, first.errors],
      [second.seq, second.vitals, second.events, second.errors],
    ]).toStrictEqual([
      [
        0,
        [LCP],
        [
          { name: 'section', detail: 'carga', at: 4_000 },
          { name: 'load-test', detail: 'finish', value: 20_000.5, at: 25_001 },
        ],
        [{ ...ERROR, at: 500 }],
      ],
      [1, [{ ...LCP, value: 1_300 }, CLS], [{ name: 'copy-email', detail: '', at: 30_000 }], []],
    ]);
  });

  it('has nothing to send when nothing happened and the page stayed hidden since the last report', () => {
    const report = load();
    report.next(1_000);
    report.hide(1_000);
    expect([report.next(1_000), report.next(5_000)]).toStrictEqual([null, null]);
  });

  it('sends again when the page was visible longer, a metric changed, or an event or an error happened', () => {
    const report = load();
    report.next(1_000);
    const visible = parsed(report.next(2_000));
    report.hide(2_000);
    report.setVital(CLS);
    const vital = parsed(report.next(3_000));
    report.addEvent({ name: 'theme', detail: 'light' }, 4_000);
    const event = parsed(report.next(4_000));
    report.addError(ERROR, 5_000);
    const error = parsed(report.next(5_000));
    expect([visible.seq, vital.seq, event.seq, error.seq]).toStrictEqual([1, 2, 3, 4]);
  });

  it('keeps one section, one touch of each part and one change of color a load, and every other event', () => {
    const report = load();
    for (const event of [
      { name: 'section', detail: 'status' },
      { name: 'section', detail: 'status' },
      { name: 'section', detail: 'perfil' },
      { name: 'interact', detail: 'globe' },
      { name: 'interact', detail: 'globe' },
      { name: 'hue' },
      { name: 'hue' },
      { name: 'theme', detail: 'light' },
      { name: 'theme', detail: 'light' },
    ])
      report.addEvent(event, 0);
    expect(parsed(report.next(0)).events.map(({ name, detail }) => [name, detail])).toStrictEqual([
      ['section', 'status'],
      ['section', 'perfil'],
      ['interact', 'globe'],
      ['hue', ''],
      ['theme', 'light'],
      ['theme', 'light'],
    ]);
  });

  it('keeps one copy of an error and at most 20 errors a load', () => {
    const report = load();
    report.addError(ERROR, 0);
    report.addError(ERROR, 10);
    for (let line = 2; line <= 30; line++) report.addError({ ...ERROR, line }, 20);
    const first = parsed(report.next(100));
    report.addError({ ...ERROR, line: 31 }, 200);
    expect([first.errors.length, first.errors.at(-1).line, report.next(100)]).toStrictEqual([
      20,
      20,
      null,
    ]);
  });

  it('holds at most 100 events waiting, which the collector takes in one report', () => {
    const report = load();
    for (let at = 0; at < 150; at++) report.addEvent({ name: 'theme', detail: 'dark' }, at);
    expect(parsed(report.next(200)).events.length).toBe(100);
  });

  it('sends at most the 16,384 characters the collector reads, leaving the rest for the next report', () => {
    const report = load();
    const long = 'Error: '.padEnd(200, 'x');
    for (let line = 0; line < 20; line++)
      report.addError({ ...ERROR, message: long, source: `/${'a'.repeat(199)}`, line }, 0);
    for (let at = 0; at < 100; at++)
      report.addEvent(
        { name: 'load-test', detail: 'finish', value: 86_399_999.123456 },
        86_000_000 + at,
      );
    const reports = [];
    let text;
    while ((text = report.next(1_000)) !== null) {
      const { errors, events } = JSON.parse(text);
      reports.push([errors.length, events.length, text.length <= 16_384]);
    }
    expect(reports).toStrictEqual([
      [10, 100, true],
      [10, 0, true],
    ]);
  });

  it('stops after the report numbered 1,000, the last one the collector takes', () => {
    const report = load();
    let last = null;
    for (let at = 0; at < 1_005; at++) {
      report.addEvent({ name: 'theme', detail: 'dark' }, at);
      const text = report.next(at);
      if (text !== null) last = JSON.parse(text).seq;
    }
    expect([last, report.next(2_000)]).toStrictEqual([1_000, null]);
  });

  it('has the limits of the collector', () => {
    expect(LoadReport.LIMITS).toStrictEqual({
      characters: 16_384,
      events: 100,
      errors: 20,
      sequence: 1_000,
      milliseconds: 86_400_000,
    });
  });
});
