import { ReportText } from './report-text.js';

const POSITION = 10_000_000;
/** What a Content-Security-Policy report names instead of an address. */
const KEYWORDS = ['inline', 'eval', 'wasm-eval', 'trusted-types-policy', 'trusted-types-sink'];

/**
 * The errors of the page as a report carries them, `{ kind, message, source, line, column }`: uncaught errors in the site's
 * own files (an error from an extension or another origin is left out), unhandled rejections, Content-Security-Policy
 * violations, and the deprecations and interventions the browser reports.
 */
export class PageErrors {
  #window;
  #origin;
  #onError;
  #observer = null;
  #listeners;

  /**
   * @param {object} options
   * @param {Window} options.window where the errors are dispatched
   * @param {string} options.origin the origin of the site's own files
   * @param {(error: object) => void} options.onError
   */
  constructor({ window, origin, onError }) {
    this.#window = window;
    this.#origin = origin;
    this.#onError = onError;
    this.#listeners = [
      ['error', (event) => this.#uncaught(event)],
      ['unhandledrejection', (event) => this.#rejection(event)],
      ['securitypolicyviolation', (event) => this.#violation(event)],
    ];
  }

  install() {
    for (const [type, listener] of this.#listeners) this.#window.addEventListener(type, listener);
    const { ReportingObserver } = this.#window;
    if (ReportingObserver) {
      this.#observer = new ReportingObserver(
        (reports) => {
          for (const report of reports) this.#reported(report);
        },
        { types: ['deprecation', 'intervention'], buffered: true },
      );
      this.#observer.observe();
    }
    return this;
  }

  stop() {
    for (const [type, listener] of this.#listeners)
      this.#window.removeEventListener(type, listener);
    this.#observer?.disconnect();
    this.#observer = null;
  }

  #uncaught({ message, filename, lineno, colno }) {
    const source = ReportText.path(filename, this.#origin);
    if (source.startsWith('/')) this.#add('error', message, source, lineno, colno);
  }

  #rejection({ reason }) {
    const message =
      reason instanceof Error
        ? `${reason.name}: ${reason.message}`
        : typeof reason === 'string'
          ? reason
          : '';
    this.#add('rejection', message, '', 0, 0);
  }

  #violation({ effectiveDirective, blockedURI, sourceFile, lineNumber, columnNumber }) {
    const blocked = KEYWORDS.includes(blockedURI)
      ? blockedURI
      : ReportText.path(blockedURI, this.#origin);
    this.#add(
      'csp',
      `${effectiveDirective} ${blocked}`.trim(),
      ReportText.path(sourceFile, this.#origin),
      lineNumber,
      columnNumber,
    );
  }

  #reported({ type, body }) {
    this.#add(
      type,
      body?.message,
      ReportText.path(body?.sourceFile, this.#origin),
      body?.lineNumber,
      body?.columnNumber,
    );
  }

  #add(kind, message, source, line, column) {
    this.#onError({
      kind,
      message: ReportText.message(message),
      source,
      line: ReportText.integer(line, POSITION),
      column: ReportText.integer(column, POSITION),
    });
  }
}
