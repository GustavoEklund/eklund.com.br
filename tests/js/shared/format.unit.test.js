import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { Formatter } from '@site/js/shared/format.js';

const LOCAL_MOMENT = new Date(2026, 9, 17, 9, 5, 7, 42);
const UTC_MOMENT = new Date('2026-10-17T15:04:00Z');

describe.each([
  { tag: 'pt-BR', decimalMark: ',', groupMark: '.', shortDate: '17 de out.' },
  { tag: 'en-US', decimalMark: '.', groupMark: ',', shortDate: 'Oct 17' },
])('Formatter in $tag', ({ tag, decimalMark, groupMark, shortDate }) => {
  beforeEach(() => Formatter.use(tag));
  afterAll(() => Formatter.use('pt-BR'));

  it('groups integers and rounds them', () =>
    expect(Formatter.integer(1234567.6)).toBe(`1${groupMark}234${groupMark}568`));
  it('keeps small integers ungrouped', () => expect(Formatter.integer(999)).toBe('999'));

  it('pads decimals to the requested digits, without grouping', () => {
    expect(Formatter.decimal(1.5)).toBe(`1${decimalMark}50`);
    expect(Formatter.decimal(1234.56, 1)).toBe(`1234${decimalMark}6`);
    expect(Formatter.decimal(2.4, 0)).toBe('2');
  });

  it('caches one format per digit count and still honours each count', () => {
    expect(Formatter.decimal(1, 3)).toBe(`1${decimalMark}000`);
    expect(Formatter.decimal(1, 1)).toBe(`1${decimalMark}0`);
    expect(Formatter.decimal(1, 3)).toBe(`1${decimalMark}000`);
  });

  it('trims trailing zeros but keeps up to two decimals', () => {
    expect(Formatter.trimmed(1.5)).toBe(`1${decimalMark}5`);
    expect(Formatter.trimmed(2)).toBe('2');
    expect(Formatter.trimmed(0.256)).toBe(`0${decimalMark}26`);
    expect(Formatter.trimmed(1234.5)).toBe(`1234${decimalMark}5`);
  });

  it('formats percentages from a fraction', () => {
    expect(Formatter.percent(0.1234)).toBe(`12${decimalMark}3%`);
    expect(Formatter.percent(0.5, 0)).toBe('50%');
    expect(Formatter.percent(1, 2)).toBe(`100${decimalMark}00%`);
  });

  it('shows milliseconds below one second and seconds above it', () => {
    expect(Formatter.milliseconds(0.4)).toBe('0 ms');
    expect(Formatter.milliseconds(250.4)).toBe('250 ms');
    expect(Formatter.milliseconds(999)).toBe('999 ms');
    expect(Formatter.milliseconds(1000)).toBe(`1${decimalMark}00 s`);
    expect(Formatter.milliseconds(1500)).toBe(`1${decimalMark}50 s`);
  });

  it('drops the decimals from ten seconds up', () => {
    expect(Formatter.milliseconds(9999)).toBe(`10${decimalMark}00 s`);
    expect(Formatter.milliseconds(10000)).toBe('10 s');
    expect(Formatter.milliseconds(12345)).toBe('12 s');
  });

  it('always shows seconds with two decimals', () => {
    expect(Formatter.seconds(1234)).toBe(`1${decimalMark}23 s`);
    expect(Formatter.seconds(50)).toBe(`0${decimalMark}05 s`);
  });

  it('labels axis ticks in ms below one second and in trimmed seconds above', () => {
    expect(Formatter.tickTime(250.4)).toBe('250 ms');
    expect(Formatter.tickTime(999)).toBe('999 ms');
    expect(Formatter.tickTime(1000)).toBe('1 s');
    expect(Formatter.tickTime(2500)).toBe(`2${decimalMark}5 s`);
    expect(Formatter.tickTime(1230)).toBe(`1${decimalMark}23 s`);
  });

  it('shows kilobytes with one decimal and a dash for nothing', () => {
    expect(Formatter.kilobytes(0)).toBe('—');
    expect(Formatter.kilobytes(2048)).toBe(`2${decimalMark}0 KB`);
    expect(Formatter.kilobytes(1536)).toBe(`1${decimalMark}5 KB`);
  });

  it('prints a 24-hour clock', () => expect(Formatter.clock(LOCAL_MOMENT)).toBe('09:05:07'));
  it('prints a 24-hour clock past noon', () =>
    expect(Formatter.clock(new Date(2026, 0, 1, 21, 0, 0))).toBe('21:00:00'));
  it('appends zero-padded milliseconds with the locale decimal mark', () => {
    expect(Formatter.clockWithMilliseconds(LOCAL_MOMENT)).toBe(`09:05:07${decimalMark}042`);
    expect(Formatter.clockWithMilliseconds(new Date(2026, 0, 1, 0, 0, 0, 5))).toBe(
      `00:00:00${decimalMark}005`,
    );
  });

  it('prints hour and minute in the requested time zone', () => {
    expect(Formatter.hourAndMinute(UTC_MOMENT, 'America/Sao_Paulo')).toBe('12:04');
    expect(Formatter.hourAndMinute(UTC_MOMENT, 'Asia/Tokyo')).toBe('00:04');
  });

  it('prints a short date in the locale style', () =>
    expect(Formatter.shortDate(LOCAL_MOMENT)).toBe(shortDate));

  it('compacts counts', () => {
    expect(Formatter.compactCount(0.4)).toBe('0');
    expect(Formatter.compactCount(999)).toBe('999');
    expect(Formatter.compactCount(1000)).toBe('1k');
    expect(Formatter.compactCount(1499)).toBe('1k');
    expect(Formatter.compactCount(1500)).toBe('2k');
    expect(Formatter.compactCount(1e6)).toBe(`1${decimalMark}0M`);
    expect(Formatter.compactCount(2345678)).toBe(`2${decimalMark}3M`);
    expect(Formatter.compactCount(24e6)).toBe(`24${decimalMark}0M`);
  });
});

describe('Formatter.use', () => {
  afterAll(() => Formatter.use('pt-BR'));

  it('starts in the default locale', () => {
    expect(Formatter.decimal(1.5)).toBe('1,50');
  });

  it('switches every cached format at once and switches back', () => {
    Formatter.decimal(1, 3);
    Formatter.hourAndMinute(UTC_MOMENT, 'Asia/Tokyo');
    Formatter.use('en-US');
    expect(Formatter.decimal(1, 3)).toBe('1.000');
    expect(Formatter.integer(1234)).toBe('1,234');
    expect(Formatter.trimmed(1.5)).toBe('1.5');
    expect(Formatter.shortDate(LOCAL_MOMENT)).toBe('Oct 17');
    expect(Formatter.clockWithMilliseconds(LOCAL_MOMENT)).toBe('09:05:07.042');
    Formatter.use('pt-BR');
    expect(Formatter.decimal(1, 3)).toBe('1,000');
    expect(Formatter.integer(1234)).toBe('1.234');
    expect(Formatter.clockWithMilliseconds(LOCAL_MOMENT)).toBe('09:05:07,042');
  });
});

describe('Formatter caching', () => {
  beforeEach(() => Formatter.use('pt-BR'));
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => Formatter.use('pt-BR'));

  it('builds one decimal format per digit count and reuses it', () => {
    const numberFormat = vi.spyOn(Intl, 'NumberFormat');
    Formatter.decimal(1, 5);
    Formatter.decimal(2, 5);
    Formatter.decimal(3, 4);
    Formatter.decimal(4, 5);
    expect(numberFormat.mock.calls).toStrictEqual([
      ['pt-BR', { minimumFractionDigits: 5, maximumFractionDigits: 5, useGrouping: false }],
      ['pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4, useGrouping: false }],
    ]);
  });

  it('builds one hour-and-minute format per time zone and reuses it', () => {
    const dateTimeFormat = vi.spyOn(Intl, 'DateTimeFormat');
    const moment = new Date('2026-10-17T15:04:00Z');
    Formatter.hourAndMinute(moment, 'Asia/Tokyo');
    Formatter.hourAndMinute(moment, 'Asia/Tokyo');
    Formatter.hourAndMinute(moment, 'Europe/Lisbon');
    Formatter.hourAndMinute(moment, 'Asia/Tokyo');
    expect(dateTimeFormat.mock.calls).toStrictEqual([
      ['pt-BR', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }],
      [
        'pt-BR',
        { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
      ],
    ]);
  });
});

describe('Formatter rounding at the unit boundaries', () => {
  beforeEach(() => Formatter.use('en-US'));
  afterAll(() => Formatter.use('pt-BR'));

  it.each([
    [999.4, '999 ms'],
    [999.5, '1.00 s'],
    [999.6, '1.00 s'],
    [1000, '1.00 s'],
  ])('prints %f ms as %s, rounding before it picks the unit', (ms, expected) => {
    expect(Formatter.milliseconds(ms)).toBe(expected);
  });

  it.each([
    [999499, '999k'],
    [999500, '1.0M'],
    [999999, '1.0M'],
    [1e6, '1.0M'],
    [1499, '1k'],
    [1500, '2k'],
  ])('prints %d as %s, rounding before it picks the unit', (value, expected) => {
    expect(Formatter.compactCount(value)).toBe(expected);
  });
});
