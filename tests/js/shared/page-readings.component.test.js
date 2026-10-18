import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PageReadings } from '@site/js/shared/page-readings.js';
import { WindowListeners } from '../../support/window-listeners.js';

const entries = (list) => ({ getEntries: () => list });
const shift = (startTime, value, hadRecentInput = false) => ({ startTime, value, hadRecentInput });

describe('PageReadings', () => {
  let observed, listeners, navigationEntries, resourceEntries, marks, unsupported;
  const deliver = (type, list) =>
    observed
      .filter((entry) => entry.type === type)
      .forEach((entry) => entry.callback(entries(list)));
  const create = () => new PageReadings();

  beforeEach(() => {
    observed = [];
    unsupported = new Set();
    navigationEntries = [];
    resourceEntries = [];
    marks = {};
    listeners = new WindowListeners().track();
    vi.stubGlobal(
      'PerformanceObserver',
      class {
        constructor(callback) {
          this.callback = callback;
        }
        observe(options) {
          if (unsupported.has(options.type)) throw new TypeError('unsupported entry type');
          observed.push({ ...options, callback: this.callback });
        }
      },
    );
    vi.spyOn(performance, 'getEntriesByType').mockImplementation((type) =>
      type === 'navigation' ? navigationEntries : resourceEntries,
    );
    vi.spyOn(performance, 'getEntriesByName').mockImplementation((name) =>
      marks[name] ? [{ startTime: marks[name] }] : [],
    );
  });

  afterEach(() => {
    listeners.release();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('starts with everything at zero and one request counted for the page itself', () => {
    const readings = create();
    expect([
      readings.firstContentfulPaint,
      readings.largestContentfulPaint,
      readings.cumulativeLayoutShift,
      readings.longTaskCount,
      readings.transferredBytes,
      readings.requestCount,
    ]).toStrictEqual([0, 0, 0, 0, 0, 1]);
  });

  it('observes paint, LCP, layout shifts, long tasks and resources, each with the buffered entries', () => {
    create();
    expect(observed.map(({ type, buffered }) => [type, buffered])).toStrictEqual([
      ['paint', true],
      ['largest-contentful-paint', true],
      ['layout-shift', true],
      ['longtask', true],
      ['resource', true],
    ]);
  });

  it('carries on when the browser does not support an entry type', () => {
    unsupported.add('longtask').add('layout-shift');
    expect(() => create()).not.toThrow();
    expect(observed.map(({ type }) => type)).toStrictEqual([
      'paint',
      'largest-contentful-paint',
      'resource',
    ]);
  });

  describe('paint', () => {
    it('takes the first-contentful-paint time and tells the subscribers once', () => {
      const readings = create();
      const listener = vi.fn();
      readings.subscribe(listener);
      deliver('paint', [
        { name: 'first-paint', startTime: 90 },
        { name: 'first-contentful-paint', startTime: 123.5 },
      ]);
      expect(readings.firstContentfulPaint).toBe(123.5);
      expect(listener.mock.calls).toStrictEqual([['paint', undefined]]);
    });

    it('stays silent when only first-paint arrived', () => {
      const readings = create();
      const listener = vi.fn();
      readings.subscribe(listener);
      deliver('paint', [{ name: 'first-paint', startTime: 90 }]);
      expect([readings.firstContentfulPaint, listener.mock.calls.length]).toStrictEqual([0, 0]);
    });
  });

  describe('largest contentful paint', () => {
    it('keeps the last entry, as the browser refines it', () => {
      const readings = create();
      const listener = vi.fn();
      readings.subscribe(listener);
      deliver('largest-contentful-paint', [{ startTime: 300 }, { startTime: 450.25 }]);
      expect(readings.largestContentfulPaint).toBe(450.25);
      expect(listener.mock.calls).toStrictEqual([['lcp', undefined]]);
    });
  });

  describe('layout shift', () => {
    it('adds shifts that come within one second of each other into one window', () => {
      const readings = create();
      deliver('layout-shift', [shift(100, 0.1), shift(600, 0.05), shift(1500, 0.02)]);
      expect(readings.cumulativeLayoutShift).toBeCloseTo(0.17, 12);
    });

    it('starts a new window after a gap of more than one second and reports the worst window', () => {
      const readings = create();
      deliver('layout-shift', [
        shift(100, 0.1),
        shift(600, 0.05),
        shift(2000, 0.2),
        shift(2500, 0.01),
      ]);
      expect(readings.cumulativeLayoutShift).toBeCloseTo(0.21, 12);
    });

    it('keeps the earlier window when it is the worst', () => {
      const readings = create();
      deliver('layout-shift', [shift(100, 0.3), shift(2000, 0.05)]);
      expect(readings.cumulativeLayoutShift).toBe(0.3);
    });

    it('treats a gap of exactly one second as the same window', () => {
      const readings = create();
      deliver('layout-shift', [shift(100, 0.1), shift(1100, 0.1)]);
      expect(readings.cumulativeLayoutShift).toBeCloseTo(0.2, 12);
    });

    it('closes a window that spans more than five seconds even without a gap', () => {
      const readings = create();
      deliver('layout-shift', [
        shift(0, 0.1),
        shift(900, 0.1),
        shift(1800, 0.1),
        shift(2700, 0.1),
        shift(3600, 0.1),
        shift(4500, 0.1),
        shift(5400, 0.1),
      ]);
      expect(readings.cumulativeLayoutShift).toBeCloseTo(0.6, 12);
    });

    it('keeps a window of exactly five seconds together', () => {
      const readings = create();
      deliver('layout-shift', [
        shift(0, 0.1),
        shift(900, 0.1),
        shift(1800, 0.1),
        shift(2700, 0.1),
        shift(3600, 0.1),
        shift(4500, 0.1),
        shift(5000, 0.1),
      ]);
      expect(readings.cumulativeLayoutShift).toBeCloseTo(0.7, 12);
    });

    it('ignores shifts that followed a recent input and does not announce them', () => {
      const readings = create();
      const listener = vi.fn();
      readings.subscribe(listener);
      deliver('layout-shift', [shift(100, 0.5, true), shift(200, 0.1)]);
      expect(readings.cumulativeLayoutShift).toBe(0.1);
      expect(listener.mock.calls).toStrictEqual([['layout-shift', shift(200, 0.1)]]);
    });

    it('announces every counted shift with its entry, in order', () => {
      const readings = create();
      const listener = vi.fn();
      readings.subscribe(listener);
      deliver('layout-shift', [shift(100, 0.01), shift(200, 0.02)]);
      expect(listener.mock.calls).toStrictEqual([
        ['layout-shift', shift(100, 0.01)],
        ['layout-shift', shift(200, 0.02)],
      ]);
    });
  });

  describe('long tasks', () => {
    it('counts each one and announces it with its entry', () => {
      const readings = create();
      const listener = vi.fn();
      readings.subscribe(listener);
      deliver('longtask', [{ duration: 60 }, { duration: 120 }]);
      expect(readings.longTaskCount).toBe(2);
      expect(listener.mock.calls).toStrictEqual([
        ['long-task', { duration: 60 }],
        ['long-task', { duration: 120 }],
      ]);
    });
  });

  describe('network', () => {
    it('adds the page and every resource to the transferred bytes, and counts the requests', () => {
      navigationEntries = [{ transferSize: 5000 }];
      resourceEntries = [{ transferSize: 1200 }, { transferSize: 800 }, { transferSize: 0 }];
      const readings = create();
      expect([readings.transferredBytes, readings.requestCount]).toStrictEqual([7000, 4]);
    });

    it('treats missing sizes as zero', () => {
      resourceEntries = [{}, { transferSize: 100 }];
      const readings = create();
      expect([readings.transferredBytes, readings.requestCount]).toStrictEqual([100, 3]);
    });

    it('refreshes and announces on every batch of resources', () => {
      const readings = create();
      const listener = vi.fn();
      readings.subscribe(listener);
      resourceEntries = [{ transferSize: 10 }];
      deliver('resource', [{}]);
      expect([readings.transferredBytes, readings.requestCount, listener.mock.calls]).toStrictEqual(
        [10, 2, [['network', undefined]]],
      );
    });

    it('refreshes again on load, 1.5 s later and 4 s later', () => {
      vi.useFakeTimers();
      const readings = create();
      const listener = vi.fn();
      readings.subscribe(listener);
      window.dispatchEvent(new Event('load'));
      expect(listener).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1499);
      expect(listener).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(listener).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(2499);
      expect(listener).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(1);
      expect(listener).toHaveBeenCalledTimes(3);
    });
  });

  describe('subscribe', () => {
    it('returns a function that stops the notifications', () => {
      const readings = create();
      const listener = vi.fn();
      const unsubscribe = readings.subscribe(listener);
      deliver('longtask', [{}]);
      expect(unsubscribe()).toBe(true);
      deliver('longtask', [{}]);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('notifies each subscriber in the order they joined', () => {
      const readings = create();
      const order = [];
      readings.subscribe(() => order.push('first'));
      readings.subscribe(() => order.push('second'));
      deliver('longtask', [{}]);
      expect(order).toStrictEqual(['first', 'second']);
    });
  });

  describe('font resources', () => {
    it('keeps the WOFF2 files this origin served, wherever they live (fonts/ as written, assets/ in the build), with or without a query string', () => {
      const entry = (name) => ({ name });
      resourceEntries = [
        entry(`${location.origin}/fonts/a-latin.woff2`),
        entry(`${location.origin}/fonts/b.woff2?v=2`),
        entry(`${location.origin}/fonts/OFL.txt`),
        entry(`${location.origin}/assets/c.woff2`),
        entry(`${location.origin}/fonts/sub/d.woff2`),
        entry('https://cdn.example/fonts/e.woff2'),
        entry(`${location.origin}/js/fonts/f.woff2.js`),
      ];
      expect(
        create().fontResources.map(({ name }) => name.replace(location.origin, '')),
      ).toStrictEqual([
        '/fonts/a-latin.woff2',
        '/fonts/b.woff2?v=2',
        '/assets/c.woff2',
        '/fonts/sub/d.woff2',
      ]);
    });
  });

  describe('own resources', () => {
    it('keeps the stylesheets and scripts this origin served, as written or as built, with or without a query string', () => {
      const own = (path) => ({ name: `${location.origin}${path}`, decodedBodySize: 100 });
      resourceEntries = [
        own('/css/a.css'),
        own('/js/shared/b.js'),
        own('/assets/main-Ab3dE5fG.js'),
        own('/assets/main-Ab3dE5fG.css?v=2'),
        own('/assets/logo.svg'),
        own('/assets/c.woff2'),
        own('/data.json'),
        { name: 'https://fonts.example/css/x.css', decodedBodySize: 5 },
        own('/js.html'),
      ];
      const readings = create();
      expect(
        readings.ownResources.map((entry) => entry.name.replace(location.origin, '')),
      ).toStrictEqual([
        '/css/a.css',
        '/js/shared/b.js',
        '/assets/main-Ab3dE5fG.js',
        '/assets/main-Ab3dE5fG.css?v=2',
      ]);
    });

    it('adds the document and the own resources to the uncompressed size', () => {
      navigationEntries = [{ decodedBodySize: 1000 }];
      resourceEntries = [
        { name: `${location.origin}/js/a.js`, decodedBodySize: 200 },
        { name: `${location.origin}/css/a.css` },
        { name: 'https://other.example/js/a.js', decodedBodySize: 9999 },
      ];
      expect(create().ownUncompressedBytes).toBe(1200);
    });

    it('is zero without a navigation entry or resources', () =>
      expect(create().ownUncompressedBytes).toBe(0));
  });

  describe('markTime', () => {
    it('returns the start time of a mark, or 0 when it does not exist', () => {
      marks.ready = 321.5;
      const readings = create();
      expect([readings.markTime('ready'), readings.markTime('missing')]).toStrictEqual([321.5, 0]);
      expect(performance.getEntriesByName).toHaveBeenNthCalledWith(1, 'ready', 'mark');
    });
  });

  it('exposes the navigation entry and the resources', () => {
    navigationEntries = [{ name: 'nav' }];
    resourceEntries = [{ name: 'r1' }];
    const readings = create();
    expect([readings.navigation, readings.resources]).toStrictEqual([
      { name: 'nav' },
      [{ name: 'r1' }],
    ]);
  });
});
