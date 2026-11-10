import { onCLS, onFCP, onINP, onLCP, onTTFB } from '../vendor/web-vitals.attribution.js';
import { DeviceRanges } from './device-ranges.js';
import { LoadReport } from './load-report.js';
import { PageActivity } from './page-activity.js';
import { PageErrors } from './page-errors.js';
import { ReportEndpoint } from './report-endpoint.js';
import { ReportText } from './report-text.js';
import { SiteVersion } from './site-version.js';
import { VitalSummary } from './vital-summary.js';

/** The pages that run the site's scripts; the legal pages run none. */
const PAGES = ['/', '/en/'];
/** A release folder in front of a page: /1.1.0/en/ is /en/ of release 1.1.0. */
const RELEASE_FOLDER = /^\/\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[0-9a-z.]{1,20})?(?=\/)/;
const NAVIGATION_TYPES = {
  navigate: 'navigate',
  reload: 'reload',
  back_forward: 'back-forward',
  prerender: 'prerender',
};

/**
 * The anonymous measurement of a page (0009, 0010): the Core Web Vitals with their attribution, engagement events, errors,
 * the device in ranges and how long the page was visible, sent to the collector with `fetch` whenever the page is hidden.
 * One page load is one report that grows (LoadReport); a page restored from the back/forward cache is a new load. Nothing is
 * stored on the device: the code of a load lives in memory and goes with it. `stop()` ends it for good, as when the
 * visitor refuses the measurement: nothing is sent after that.
 *
 * App loads this module, and with it web-vitals, through a dynamic import once the page is idle, and only while
 * PrivacyChoice allows the measurement.
 */
export class FieldReport {
  static VITALS = { onCLS, onFCP, onINP, onLCP, onTTFB };

  #window;
  #endpoint;
  #language;
  #vitals;
  #fetch;
  #randomId;
  #now;
  #errors;
  #activity;
  #page = null;
  #load = null;
  #active = false;
  #listeners;

  /**
   * @param {object} options
   * @param {Window} options.window
   * @param {() => string} options.language the language of the page, read when a load starts
   * @param {string[]} options.sections the ids of the sections whose arrival is an event
   * @param {[string, string][]} options.links [detail, address] of the links that leave the site
   * @param {[string, string][]} options.regions [detail, selector] of the parts whose first touch is an event
   * @param {string|null} [options.endpoint] where reports go; by default the one for this page's address
   * @param {object} [options.vitals] web-vitals' onCLS, onFCP, onINP, onLCP and onTTFB
   * @param {Function} [options.fetch]
   * @param {() => string} [options.randomId] a random UUID
   * @param {() => number} [options.now] the page's clock, in milliseconds since it started
   */
  constructor({
    window,
    language,
    sections,
    links,
    regions,
    endpoint = ReportEndpoint.for(window.location),
    vitals = FieldReport.VITALS,
    fetch = (address, init) => window.fetch(address, init),
    randomId = () => window.crypto.randomUUID(),
    now = () => window.performance.now(),
  }) {
    this.#window = window;
    this.#endpoint = endpoint;
    this.#language = language;
    this.#vitals = vitals;
    this.#fetch = fetch;
    this.#randomId = randomId;
    this.#now = now;
    this.#errors = new PageErrors({
      window,
      origin: window.location.origin,
      onError: (error) => this.#load?.addError(error, this.#now()),
    });
    this.#activity = new PageActivity({
      document: window.document,
      sections,
      links,
      regions,
      now,
      onEvent: (name, detail) => this.record(name, detail),
      IntersectionObserver: window.IntersectionObserver,
    });
    this.#listeners = [
      ['visibilitychange', () => this.#visibilityChange()],
      ['pagehide', () => this.#hide()],
      ['pageshow', (event) => this.#pageShow(event)],
    ];
  }

  /** The page a report names, or null for an address that is not one of the pages that measure. */
  static pageOf(pathname) {
    const page = pathname.replace(RELEASE_FOLDER, '').replace(/index\.html$/, '');
    return PAGES.includes(page) ? page : null;
  }

  /** How the page was reached, from its navigation entry and the document. */
  static navigationOf(document, entry) {
    if (document.wasDiscarded) return 'restore';
    if (document.prerendering || entry?.activationStart > 0) return 'prerender';
    return NAVIGATION_TYPES[entry?.type] ?? 'navigate';
  }

  start() {
    if (this.#active) return this;
    this.#page = FieldReport.pageOf(this.#window.location.pathname);
    if (!this.#page) return this;
    this.#active = true;
    const { document, performance } = this.#window;
    this.#begin({
      navigation: FieldReport.navigationOf(document, performance.getEntriesByType('navigation')[0]),
      referrer: ReportText.host(document.referrer),
      startedAt: 0,
    });
    this.#errors.install();
    this.#activity.install();
    for (const register of Object.values(this.#vitals))
      register((metric) => {
        if (this.#active)
          this.#load?.setVital(VitalSummary.of(metric, this.#window.location.origin));
      });
    for (const [type, listener] of this.#listeners) this.#window.addEventListener(type, listener);
    return this;
  }

  /** Adds an engagement event to the current load: `name` and `detail` from the fixed lists, `value` a duration. */
  record(name, detail = '', value = undefined) {
    if (this.#active) this.#load?.addEvent({ name, detail, value }, this.#now());
  }

  /** Stops measuring and drops what was not sent. web-vitals keeps its observers, which report to nothing. */
  stop() {
    this.#active = false;
    this.#load = null;
    for (const [type, listener] of this.#listeners)
      this.#window.removeEventListener(type, listener);
    this.#errors.stop();
    this.#activity.stop();
  }

  #begin({ navigation, referrer, startedAt }) {
    this.#load = new LoadReport({
      view: this.#randomId(),
      version: SiteVersion.NUMBER,
      page: this.#page,
      language: this.#language(),
      referrer,
      navigation,
      device: DeviceRanges.read(this.#window),
      startedAt,
      visible: this.#window.document.visibilityState === 'visible',
    });
  }

  /** Runs after web-vitals' own listeners, which report the final values of the metrics as the page hides. */
  #visibilityChange() {
    if (this.#window.document.visibilityState === 'hidden') this.#hide();
    else this.#load?.show(this.#now());
  }

  #hide() {
    if (!this.#load) return;
    this.#load.hide(this.#now());
    this.#send(this.#load.next(this.#now()));
  }

  #pageShow(event) {
    if (!event.persisted) return;
    this.#begin({ navigation: 'back-forward-cache', referrer: '', startedAt: event.timeStamp });
  }

  /** text/plain needs no preflight; keepalive lets the request outlive the page; nothing else goes with it. */
  #send(body) {
    if (!body || !this.#endpoint) return;
    this.#fetch(this.#endpoint, {
      method: 'POST',
      body,
      keepalive: true,
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      priority: 'low',
    }).catch(() => {
      /* offline, blocked or refused: the report is lost, and the page goes on */
    });
  }
}
