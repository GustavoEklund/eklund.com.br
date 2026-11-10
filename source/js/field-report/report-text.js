const MAX_LENGTH = 200;
/** A host name as the collector reads one: lower case, with at least one dot. */
const HOST = /^(?=.{1,253}$)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;

/**
 * Puts what the browser says into the forms the collector accepts (tests/contract/schemas/page-report.schema.json): the
 * collector refuses a whole report for one value out of form, so every value is shaped here first.
 */
export class ReportText {
  /** A selector or a function name: printable ASCII, anything else as '?', and at most 200 characters. */
  static label(value) {
    return String(value ?? '')
      .replace(/[^ -~]/g, '?')
      .slice(0, MAX_LENGTH);
  }

  /** An error message: control characters as spaces, and at most 200 characters, never half of one. */
  static message(value) {
    return Array.from(String(value ?? '').replace(/\p{Cc}/gu, ' '))
      .slice(0, MAX_LENGTH)
      .join('');
  }

  /** The path of an address of this site without its query or fragment, 'other' for another origin, '' for none. */
  static path(address, origin) {
    if (!address) return '';
    let url;
    try {
      url = new URL(address, origin);
    } catch {
      return 'other';
    }
    return url.origin === origin ? url.pathname.slice(0, MAX_LENGTH) : 'other';
  }

  /** The host of the page a visitor came from, and nothing else of its address; '' when there is none to keep. */
  static host(referrer) {
    try {
      const { protocol, hostname } = new URL(referrer);
      const host = hostname.toLowerCase();
      return /^https?:$/.test(protocol) && HOST.test(host) ? host : '';
    } catch {
      return '';
    }
  }

  /** A number between 0 and `maximum`, or null when the browser gave none. */
  static number(value, maximum) {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.min(Math.max(value, 0), maximum)
      : null;
  }

  /** A whole number between 0 and `maximum`; 0 when the browser gave none. */
  static integer(value, maximum) {
    return Math.round(ReportText.number(value, maximum) ?? 0);
  }
}
