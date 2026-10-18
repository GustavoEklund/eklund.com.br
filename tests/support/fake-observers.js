import { vi } from 'vitest';

/** An IntersectionObserver the test drives: it records what was observed and reports only when asked. */
export class FakeIntersectionObserver {
  static instances = [];

  callback;
  options;
  observed = [];

  static install() {
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  }

  /** Delivers one entry to every observer, as the browser does when visibility changes. */
  static report(visible, size = { width: 100, height: 100 }) {
    for (const observer of FakeIntersectionObserver.instances) {
      observer.callback([
        { isIntersecting: visible, boundingClientRect: visible ? size : { width: 0, height: 0 } },
      ]);
    }
  }

  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(element) {
    this.observed.push(element);
  }
  disconnect() {}
}

/** A ResizeObserver the test drives. */
export class FakeResizeObserver {
  static instances = [];

  callback;
  observed = [];

  static install() {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  }

  static fire() {
    for (const observer of FakeResizeObserver.instances) observer.callback([]);
  }

  constructor(callback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(element) {
    this.observed.push(element);
  }
  disconnect() {}
}
