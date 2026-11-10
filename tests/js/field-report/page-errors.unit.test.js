import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PageErrors } from '@site/js/field-report/page-errors.js';

const ORIGIN = 'https://eklund.com.br';
const event = (type, fields) => Object.assign(new Event(type), fields);

/** A ReportingObserver the test drives: it keeps its callback and options, and delivers reports when asked. */
class FakeReportingObserver {
  static last = null;
  observing = false;

  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    FakeReportingObserver.last = this;
  }

  observe() {
    this.observing = true;
  }

  disconnect() {
    this.observing = false;
  }
}

describe('PageErrors', () => {
  let window, onError, errors;

  beforeEach(() => {
    FakeReportingObserver.last = null;
    window = Object.assign(new EventTarget(), { ReportingObserver: FakeReportingObserver });
    onError = vi.fn();
    errors = new PageErrors({ window, origin: ORIGIN, onError }).install();
  });

  it('reports an uncaught error of the site, with the path of its file, its line and its column', () => {
    window.dispatchEvent(
      event('error', {
        message: "Uncaught TypeError: Cannot read properties of undefined (reading 'width')",
        filename: 'https://eklund.com.br/assets/main-AbC123.js?v=1',
        lineno: 1,
        colno: 2_345,
      }),
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(1, {
      kind: 'error',
      message: "Uncaught TypeError: Cannot read properties of undefined (reading 'width')",
      source: '/assets/main-AbC123.js',
      line: 1,
      column: 2_345,
    });
  });

  it('leaves out an error of another origin or of no file: an extension, a script of another site, "Script error."', () => {
    window.dispatchEvent(
      event('error', {
        message: 'Uncaught Error: x',
        filename: 'chrome-extension://abc/content.js',
        lineno: 1,
        colno: 1,
      }),
    );
    window.dispatchEvent(
      event('error', { message: 'Script error.', filename: '', lineno: 0, colno: 0 }),
    );
    expect(onError).toHaveBeenCalledTimes(0);
  });

  it('reports an unhandled rejection by the name and message of its error, a string as it is, anything else as nothing', () => {
    window.dispatchEvent(event('unhandledrejection', { reason: new RangeError('too far') }));
    window.dispatchEvent(event('unhandledrejection', { reason: 'aborted\nnow' }));
    window.dispatchEvent(event('unhandledrejection', { reason: { code: 7 } }));
    const rejection = (message) => ({ kind: 'rejection', message, source: '', line: 0, column: 0 });
    expect(onError).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenNthCalledWith(1, rejection('RangeError: too far'));
    expect(onError).toHaveBeenNthCalledWith(2, rejection('aborted now'));
    expect(onError).toHaveBeenNthCalledWith(3, rejection(''));
  });

  it('reports a Content-Security-Policy violation by its directive and what it blocked, an address of another site as other', () => {
    window.dispatchEvent(
      event('securitypolicyviolation', {
        effectiveDirective: 'script-src-elem',
        blockedURI: 'inline',
        sourceFile: 'https://eklund.com.br/',
        lineNumber: 40,
        columnNumber: 3,
      }),
    );
    window.dispatchEvent(
      event('securitypolicyviolation', {
        effectiveDirective: 'connect-src',
        blockedURI: 'https://tracker.example.com/collect?id=1',
        sourceFile: 'https://eklund.com.br/assets/main-AbC123.js',
        lineNumber: 1,
        columnNumber: 99,
      }),
    );
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenNthCalledWith(1, {
      kind: 'csp',
      message: 'script-src-elem inline',
      source: '/',
      line: 40,
      column: 3,
    });
    expect(onError).toHaveBeenNthCalledWith(2, {
      kind: 'csp',
      message: 'connect-src other',
      source: '/assets/main-AbC123.js',
      line: 1,
      column: 99,
    });
  });

  it('reports the deprecations and interventions the browser reports, including those from before it started', () => {
    const observer = FakeReportingObserver.last;
    observer.callback([
      {
        type: 'deprecation',
        body: {
          id: 'X',
          message: 'Synchronous XMLHttpRequest is deprecated.',
          sourceFile: 'https://eklund.com.br/js/main.js',
          lineNumber: 10,
          columnNumber: 4,
        },
      },
      { type: 'intervention', body: { message: 'Blocked a heavy ad.' } },
    ]);
    expect([observer.options, observer.observing]).toStrictEqual([
      { types: ['deprecation', 'intervention'], buffered: true },
      true,
    ]);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenNthCalledWith(1, {
      kind: 'deprecation',
      message: 'Synchronous XMLHttpRequest is deprecated.',
      source: '/js/main.js',
      line: 10,
      column: 4,
    });
    expect(onError).toHaveBeenNthCalledWith(2, {
      kind: 'intervention',
      message: 'Blocked a heavy ad.',
      source: '',
      line: 0,
      column: 0,
    });
  });

  it('stops listening and observing when it stops', () => {
    errors.stop();
    window.dispatchEvent(event('unhandledrejection', { reason: 'late' }));
    expect([onError.mock.calls.length, FakeReportingObserver.last.observing]).toStrictEqual([
      0,
      false,
    ]);
  });

  it('works without ReportingObserver, as in browsers that have none', () => {
    const plain = new EventTarget();
    const heard = vi.fn();
    new PageErrors({ window: plain, origin: ORIGIN, onError: heard }).install().stop();
    plain.dispatchEvent(event('unhandledrejection', { reason: 'x' }));
    expect(heard).toHaveBeenCalledTimes(0);
  });
});
