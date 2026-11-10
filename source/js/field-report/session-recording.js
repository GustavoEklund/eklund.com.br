import { record } from '../vendor/record.js';
import { ReportEndpoint } from '../shared/report-endpoint.js';
import { ClickPlaces } from './click-places.js';
import { PageAddress } from './page-address.js';
import { RecordingBatch } from './recording-batch.js';
import { SiteVersion } from './site-version.js';

/** How often what was recorded goes out while the page stays open. */
const SEND_EVERY_MS = 10_000;
/** A batch this large goes out at once instead of waiting: the first one, with the whole page, always does. */
const SEND_AT_CHARACTERS = 262_144;
/** A recording stops after half an hour, and so does a page left open. */
const LONGEST_MS = 1_800_000;
/**
 * What a request that outlives the page may carry: the browser allows 64 KiB for all of them together, and the report of the
 * anonymous measurement, which goes at the same moment, takes up to 16 KiB of it.
 */
const KEEPALIVE_BYTES = 40_000;
/**
 * What is never recorded, only its place: the custom cursor, which moves on every frame, the command palette, whose results
 * follow what is typed, and the code of the globe's shaders, which is long and the same for everyone.
 */
const BLOCKED = '.cursor-dot, .cursor-ring, #command-palette, #shader-code';
/** Pointer moves at most ten times a second, scrolling at most seven, an input only once it settles. */
const SAMPLING = { mousemove: 100, scroll: 150, media: 800, input: 'last' };

/**
 * The session recording and the heat map of one page load (0010, 0011), only while the visitor consents. rrweb records the
 * page and its changes with every field masked, nothing typed is kept, not even its length, and the canvases (the globe, the
 * chevrons) are not drawn; ClickPlaces says where each click landed. Each recording has its own random code, which the
 * browser keeps for 30 days through `codes` so that it can have the recording deleted, and which links it to nothing else.
 *
 * What was recorded goes to the collector as gzip every ten seconds, or at once when it grows large, and once more as plain
 * text, with keepalive, when the page is hidden. `stop()` ends it for good: nothing that waits is sent, and the promise it
 * returns settles when the requests already on their way have, so that a deletion that follows reaches every chunk.
 *
 * App loads this module, and with it rrweb, through a dynamic import, and only once the visitor consents to recording.
 */
export class SessionRecording {
  static RECORD = record;
  static BLOCKED = BLOCKED;
  static SEND_EVERY_MS = SEND_EVERY_MS;
  static LONGEST_MS = LONGEST_MS;
  static KEEPALIVE_BYTES = KEEPALIVE_BYTES;

  #window;
  #codes;
  #language;
  #regions;
  #endpoint;
  #record;
  #fetch;
  #randomId;
  #compress;
  #now;
  #batch = null;
  #stopRecording = null;
  #timer = 0;
  #deadline = 0;
  #active = false;
  #sending = new Set();
  #listeners;

  /**
   * @param {object} options
   * @param {Window} options.window
   * @param {{ add: (code: string) => void }} options.codes keeps the code of each recording for 30 days
   * @param {() => string} options.language the language of the page, read when the recording starts
   * @param {[string, string][]} options.regions [name, selector] of the parts of the page a click lands in
   * @param {string|null} [options.endpoint] where chunks go; by default the one for this page's address
   * @param {Function} [options.record] rrweb's record
   * @param {Function} [options.fetch]
   * @param {() => string} [options.randomId] a random UUID
   * @param {((text: string) => Promise<Uint8Array>)|null} [options.compress] gzip, or null where the browser has none
   * @param {() => number} [options.now] the page's clock, in milliseconds since it started
   */
  constructor({
    window,
    codes,
    language,
    regions,
    endpoint = ReportEndpoint.for(window.location, ReportEndpoint.RECORDING_PATH),
    record = SessionRecording.RECORD,
    fetch = (address, init) => window.fetch(address, init),
    randomId = () => window.crypto.randomUUID(),
    compress = typeof window.CompressionStream === 'function'
      ? (text) => SessionRecording.#gzip(window, text)
      : null,
    now = () => window.performance.now(),
  }) {
    this.#window = window;
    this.#codes = codes;
    this.#language = language;
    this.#regions = regions;
    this.#endpoint = endpoint;
    this.#record = record;
    this.#fetch = fetch;
    this.#randomId = randomId;
    this.#compress = compress;
    this.#now = now;
    this.#listeners = [
      ['click', (event) => this.#click(event), { capture: true, passive: true }],
      ['visibilitychange', () => this.#visibilityChange()],
      ['pagehide', () => this.#send(true)],
    ];
  }

  /** The options rrweb records with: every field masked to nothing, the blocked parts and the canvases left out. */
  static options(emit) {
    return {
      emit,
      maskAllInputs: true,
      maskInputFn: () => '',
      blockSelector: BLOCKED,
      recordCanvas: false,
      collectFonts: false,
      inlineImages: false,
      recordCrossOriginIframes: false,
      slimDOMOptions: 'all',
      sampling: SAMPLING,
      errorHandler: () => true,
    };
  }

  get recording() {
    return this.#active;
  }

  /** Starts a recording with a new code, on a page that records and sends, in a browser that compresses. */
  start() {
    if (this.#active) return this;
    const page = PageAddress.of(this.#window.location.pathname);
    if (!page || !this.#endpoint || !this.#compress) return this;
    const code = this.#randomId();
    this.#codes.add(code);
    const startedAt = this.#now();
    this.#batch = new RecordingBatch({
      code,
      version: SiteVersion.NUMBER,
      page,
      language: this.#language(),
      startedAt,
    });
    this.#active = true;
    this.#deadline = startedAt + LONGEST_MS;
    for (const [type, listener, options] of this.#listeners)
      this.#window.addEventListener(type, listener, options);
    this.#timer = this.#window.setInterval(() => this.#tick(), SEND_EVERY_MS);
    this.#stopRecording = this.#record(SessionRecording.options((event) => this.#take(event)));
    return this;
  }

  /**
   * Stops for good and drops what was not sent. Resolves once the chunks already on their way have arrived or failed.
   */
  stop() {
    this.#end();
    this.#batch = null;
    return Promise.allSettled(this.#sending).then(() => undefined);
  }

  #end() {
    if (!this.#active) return;
    this.#active = false;
    this.#stopRecording?.();
    this.#stopRecording = null;
    this.#window.clearInterval(this.#timer);
    for (const [type, listener, options] of this.#listeners)
      this.#window.removeEventListener(type, listener, options);
  }

  #take(event) {
    if (!this.#active) return;
    if (!this.#batch.addEvent(event)) {
      this.stop();
      return;
    }
    if (this.#batch.size >= SEND_AT_CHARACTERS) this.#send(false);
  }

  /** A click of the pointer: the keyboard also clicks, but has no place on the page. */
  #click(event) {
    if (!this.#active || !event.isTrusted || event.detail === 0) return;
    this.#batch.addClick(
      ClickPlaces.of(event, this.#regions, {
        width: this.#window.innerWidth,
        height: this.#window.innerHeight,
      }),
      this.#now(),
    );
  }

  #tick() {
    if (this.#now() >= this.#deadline) {
      this.#send(false);
      this.#end();
      return;
    }
    this.#send(false);
  }

  #visibilityChange() {
    if (this.#window.document.visibilityState === 'hidden') this.#send(true);
  }

  /**
   * Sends what waits. As the page hides, a chunk small enough goes as plain text with keepalive at once, because there may be
   * no time to compress it; otherwise it goes as gzip, with keepalive when that is small enough.
   */
  #send(hiding) {
    const batch = this.#batch;
    const text = batch?.next();
    if (batch?.exhausted) this.#end();
    if (!text) return;
    if (hiding && new TextEncoder().encode(text).byteLength <= KEEPALIVE_BYTES) {
      this.#post(text, true);
      return;
    }
    const sending = this.#compress(text).then((body) =>
      this.#post(body, body.byteLength <= KEEPALIVE_BYTES),
    );
    this.#track(sending.catch(() => {}));
  }

  /** No content type, so no preflight; no credentials and no referrer go with it. */
  #post(body, keepalive) {
    if (!this.#active && this.#batch === null) return Promise.resolve();
    const sending = this.#fetch(this.#endpoint, {
      method: 'POST',
      body,
      keepalive,
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      priority: 'low',
    }).catch(() => {
      /* offline, blocked or refused: the chunk is lost, and the page goes on */
    });
    this.#track(sending);
    return sending;
  }

  #track(promise) {
    this.#sending.add(promise);
    promise.finally(() => this.#sending.delete(promise));
  }

  static async #gzip(window, text) {
    const stream = new window.Blob([text])
      .stream()
      .pipeThrough(new window.CompressionStream('gzip'));
    return new Uint8Array(await new window.Response(stream).arrayBuffer());
  }
}
