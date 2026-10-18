import { Locale } from '../i18n/locale.js';

/** Locale-aware number and time formatting. `use(locale)` switches every cached Intl formatter at once. */
export class Formatter {
  static #locale = Locale.DEFAULT;
  static #integerFormat = new Intl.NumberFormat(Locale.DEFAULT);
  static #decimalFormats = new Map();
  static #trimmedFormat = Formatter.#buildDecimalFormat(Locale.DEFAULT, 0, 2);
  static #clockFormat = Formatter.#buildClockFormat(Locale.DEFAULT);
  static #shortDateFormat = Formatter.#buildShortDateFormat(Locale.DEFAULT);
  static #hourAndMinuteFormats = new Map();
  static #decimalSeparator = Formatter.#findDecimalSeparator(Locale.DEFAULT);

  static use(locale) {
    Formatter.#locale = locale;
    Formatter.#integerFormat = new Intl.NumberFormat(locale);
    Formatter.#decimalFormats = new Map();
    Formatter.#trimmedFormat = Formatter.#buildDecimalFormat(locale, 0, 2);
    Formatter.#clockFormat = Formatter.#buildClockFormat(locale);
    Formatter.#shortDateFormat = Formatter.#buildShortDateFormat(locale);
    Formatter.#hourAndMinuteFormats = new Map();
    Formatter.#decimalSeparator = Formatter.#findDecimalSeparator(locale);
  }

  static integer(value) {
    return Formatter.#integerFormat.format(Math.round(value));
  }

  static decimal(value, digits = 2) {
    let format = Formatter.#decimalFormats.get(digits);
    if (!format)
      Formatter.#decimalFormats.set(
        digits,
        (format = Formatter.#buildDecimalFormat(Formatter.#locale, digits, digits)),
      );
    return format.format(value);
  }

  /** Up to two decimals, no trailing zeros: 1.5, 0.25, 2. */
  static trimmed(value) {
    return Formatter.#trimmedFormat.format(value);
  }

  static percent(fraction, digits = 1) {
    return `${Formatter.decimal(fraction * 100, digits)}%`;
  }

  static milliseconds(ms) {
    const whole = Math.round(ms);
    if (whole >= 1000) return `${Formatter.decimal(ms / 1000, ms >= 10000 ? 0 : 2)} s`;
    return `${whole} ms`;
  }

  static seconds(ms) {
    return `${Formatter.decimal(ms / 1000, 2)} s`;
  }

  /** Axis tick: whole milliseconds below one second, otherwise seconds without trailing zeros. */
  static tickTime(ms) {
    return ms >= 1000 ? `${Formatter.trimmed(ms / 1000)} s` : `${Math.round(ms)} ms`;
  }

  static kilobytes(bytes) {
    return bytes ? `${Formatter.decimal(bytes / 1024, 1)} KB` : '—';
  }

  static clock(date) {
    return Formatter.#clockFormat.format(date);
  }

  static clockWithMilliseconds(date) {
    return `${Formatter.clock(date)}${Formatter.#decimalSeparator}${String(date.getMilliseconds()).padStart(3, '0')}`;
  }

  /** 24-hour HH:mm in the given IANA time zone. */
  static hourAndMinute(date, timeZone) {
    let format = Formatter.#hourAndMinuteFormats.get(timeZone);
    if (!format)
      Formatter.#hourAndMinuteFormats.set(
        timeZone,
        (format = new Intl.DateTimeFormat(Formatter.#locale, {
          timeZone,
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        })),
      );
    return format.format(date);
  }

  static shortDate(date) {
    return Formatter.#shortDateFormat.format(date);
  }

  static compactCount(value) {
    const thousands = Math.round(value / 1000);
    if (value >= 1e6 || thousands >= 1000) return `${Formatter.decimal(value / 1e6, 1)}M`;
    if (value >= 1000) return `${thousands}k`;
    return String(Math.round(value));
  }

  static #buildDecimalFormat(locale, minimumFractionDigits, maximumFractionDigits) {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits,
      maximumFractionDigits,
      useGrouping: false,
    });
  }

  static #buildClockFormat(locale) {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  }

  static #buildShortDateFormat(locale) {
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' });
  }

  static #findDecimalSeparator(locale) {
    return new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')
      .value;
  }
}
