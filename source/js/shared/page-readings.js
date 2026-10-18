/**
 * Collects the page's own performance signals from the Performance API and
 * notifies subscribers as they arrive. Nothing here is ever hard-coded.
 */
export class PageReadings {
  firstContentfulPaint = 0;
  largestContentfulPaint = 0;
  cumulativeLayoutShift = 0;
  longTaskCount = 0;
  #shiftWindow = { value: 0, startedAt: 0, lastAt: 0 };
  transferredBytes = 0;
  requestCount = 1;
  #listeners = new Set();

  constructor() {
    this.#observe('paint', (entries) => {
      const paint = entries.find((entry) => entry.name === 'first-contentful-paint');
      if (paint) {
        this.firstContentfulPaint = paint.startTime;
        this.#emit('paint');
      }
    });
    this.#observe('largest-contentful-paint', (entries) => {
      this.largestContentfulPaint = entries.at(-1).startTime;
      this.#emit('lcp');
    });
    this.#observe('layout-shift', (entries) => {
      for (const entry of entries) {
        if (entry.hadRecentInput) continue;
        this.#addToShiftWindow(entry);
        this.#emit('layout-shift', entry);
      }
    });
    this.#observe('longtask', (entries) => {
      for (const entry of entries) {
        this.longTaskCount++;
        this.#emit('long-task', entry);
      }
    });
    this.#observe('resource', () => this.refreshNetwork());
    addEventListener('load', () => {
      this.refreshNetwork();
      setTimeout(() => this.refreshNetwork(), 1500);
      setTimeout(() => this.refreshNetwork(), 4000);
    });
    this.refreshNetwork();
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  get navigation() {
    return performance.getEntriesByType('navigation')[0];
  }

  get resources() {
    return performance.getEntriesByType('resource');
  }

  /** The stylesheets and scripts this origin served: one file each in the build, one per module and per sheet when run from source/. */
  get ownResources() {
    return this.resources.filter(
      (entry) => entry.name.startsWith(location.origin) && /\.(css|js)(\?|$)/.test(entry.name),
    );
  }

  /** The WOFF2 files this origin served. */
  get fontResources() {
    return this.resources.filter(
      (entry) => entry.name.startsWith(location.origin) && /\.woff2(\?|$)/.test(entry.name),
    );
  }

  get ownUncompressedBytes() {
    const html = this.navigation?.decodedBodySize || 0;
    return html + this.ownResources.reduce((sum, entry) => sum + (entry.decodedBodySize || 0), 0);
  }

  markTime(name) {
    return performance.getEntriesByName(name, 'mark')[0]?.startTime || 0;
  }

  refreshNetwork() {
    const navigationBytes = this.navigation?.transferSize || 0;
    const resources = this.resources;
    this.transferredBytes =
      navigationBytes + resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0);
    this.requestCount = resources.length + 1;
    this.#emit('network');
  }

  /** Session windows as in the CLS definition: a new window after a 1 s gap or once a window spans 5 s. */
  #addToShiftWindow(entry) {
    const window = this.#shiftWindow;
    const startsNewWindow =
      !window.value ||
      entry.startTime - window.lastAt > 1000 ||
      entry.startTime - window.startedAt > 5000;
    if (startsNewWindow) {
      window.value = 0;
      window.startedAt = entry.startTime;
    }
    window.value += entry.value;
    window.lastAt = entry.startTime;
    this.cumulativeLayoutShift = Math.max(this.cumulativeLayoutShift, window.value);
  }

  #observe(type, handle) {
    try {
      new PerformanceObserver((list) => handle(list.getEntries())).observe({
        type,
        buffered: true,
      });
    } catch {
      /* entry type unsupported in this browser */
    }
  }

  #emit(type, detail) {
    for (const listener of this.#listeners) listener(type, detail);
  }
}
