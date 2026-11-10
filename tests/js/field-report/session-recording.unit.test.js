import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionRecording } from '@site/js/field-report/session-recording.js';
import { SiteVersion } from '@site/js/field-report/site-version.js';
import { record } from '@site/js/vendor/record.js';

const ENDPOINT = 'https://eklund.eklund.workers.dev/v1/session';
const CODE = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
const T = 1_793_241_000_000;
const META = {
  type: 4,
  data: { href: 'https://eklund.com.br/en/', width: 1280, height: 800 },
  timestamp: T,
};
const MOVE = {
  type: 3,
  data: { source: 1, positions: [{ x: 1, y: 2, id: 9, timeOffset: 0 }] },
  timestamp: T + 50,
};
const SENT = {
  method: 'POST',
  mode: 'cors',
  credentials: 'omit',
  referrerPolicy: 'no-referrer',
  priority: 'low',
};
const REGIONS = [['status', '#status']];

/** The parts of a window the recording reads, with listeners that a test can call with any event, trusted or not. */
class FakeWindow {
  listeners = new Map();
  timers = new Map();
  #nextTimer = 1;

  constructor(address) {
    this.location = new URL(address);
    this.document = { visibilityState: 'visible' };
    this.innerWidth = 1280;
    this.innerHeight = 800;
  }

  addEventListener(type, listener, options) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), [listener, options]]);
  }

  removeEventListener(type, listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter(([added]) => added !== listener),
    );
  }

  fire(type, event = {}) {
    for (const [listener] of this.listeners.get(type) ?? []) listener(event);
  }

  setInterval(callback, delay) {
    const id = this.#nextTimer++;
    this.timers.set(id, [callback, delay]);
    return id;
  }

  clearInterval(id) {
    this.timers.delete(id);
  }

  tick() {
    for (const [callback] of this.timers.values()) callback();
  }
}

describe('SessionRecording', () => {
  let window, codes, fetch, recorder, time, compressed;
  /** rrweb's record, standing in: keeps the options it was given and the function that stops it. */
  const fakeRecord = () => {
    const stop = vi.fn();
    const start = vi.fn((options) => {
      recorder.options = options;
      return stop;
    });
    return { start, stop, options: null };
  };
  const recording = (options = {}) =>
    new SessionRecording({
      window,
      codes,
      language: () => 'en-US',
      regions: REGIONS,
      endpoint: ENDPOINT,
      record: recorder.start,
      fetch,
      randomId: () => CODE,
      compress: (text) => {
        compressed.push(text);
        return Promise.resolve(new TextEncoder().encode(`gzip:${text}`));
      },
      now: () => time,
      ...options,
    });
  const emit = (event) => recorder.options.emit(event);
  /** Each request: [address, init] with the body as the text it carries, and whether it went compressed. */
  const requests = () =>
    fetch.mock.calls.map(([address, init]) => {
      const text = typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body);
      const gzip = text.startsWith('gzip:');
      return [address, { ...init, body: JSON.parse(gzip ? text.slice(5) : text) }, gzip];
    });
  const chunk = (seq, events, clicks = []) => ({
    v: 1,
    code: CODE,
    seq,
    version: SiteVersion.NUMBER,
    page: '/en/',
    language: 'en-US',
    events,
    clicks,
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    window = new FakeWindow('https://eklund.com.br/1.1.0/en/');
    codes = { add: vi.fn() };
    fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    recorder = fakeRecord();
    time = 1_000;
    compressed = [];
  });

  it("records with rrweb's own masking and blocking, keeps the recording's code, and sends nothing at first", () => {
    const started = recording().start();
    const { emit: _emit, maskInputFn, errorHandler, ...options } = recorder.options;
    expect(codes.add).toHaveBeenCalledTimes(1);
    expect(codes.add).toHaveBeenNthCalledWith(1, CODE);
    expect([
      started.recording,
      options,
      maskInputFn('someone@example.com', null),
      errorHandler(new Error('x')),
      fetch.mock.calls.length,
      [...window.timers.values()].map(([, delay]) => delay),
    ]).toStrictEqual([
      true,
      {
        maskAllInputs: true,
        blockSelector: '.cursor-dot, .cursor-ring, #command-palette, #shader-code',
        recordCanvas: false,
        collectFonts: false,
        inlineImages: false,
        recordCrossOriginIframes: false,
        slimDOMOptions: 'all',
        sampling: { mousemove: 100, scroll: 150, media: 800, input: 'last' },
      },
      '',
      true,
      0,
      [10_000],
    ]);
  });

  it('records nothing on a page that does not record, where the page sends nothing, or in a browser without gzip', () => {
    const outcomes = [
      recording({ window: new FakeWindow('https://eklund.com.br/privacidade/') }).start(),
      recording({ endpoint: null }).start(),
      recording({ compress: null }).start(),
    ];
    expect([
      outcomes.map((outcome) => outcome.recording),
      recorder.start.mock.calls.length,
      codes.add.mock.calls.length,
    ]).toStrictEqual([[false, false, false], 0, 0]);
  });

  it('sends what was recorded every ten seconds as gzip, with keepalive while it is small, without credentials', async () => {
    recording().start();
    emit(META);
    emit(MOVE);
    window.tick();
    await settle();
    window.tick();
    await settle();
    expect(requests()).toStrictEqual([
      [ENDPOINT, { ...SENT, keepalive: true, body: chunk(0, [META, MOVE]) }, true],
    ]);
  });

  it('sends a large batch at once, the whole page included, and without keepalive past 40,000 bytes', async () => {
    recording().start();
    const snapshot = { type: 2, data: { node: { text: 'x'.repeat(270_000) } }, timestamp: T };
    emit(snapshot);
    await settle();
    expect(requests()).toStrictEqual([
      [ENDPOINT, { ...SENT, keepalive: false, body: chunk(0, [snapshot]) }, true],
    ]);
  });

  it('sends what waits as plain text with keepalive the moment the page hides, without waiting to compress it', () => {
    recording().start();
    emit(META);
    window.document.visibilityState = 'hidden';
    window.fire('visibilitychange');
    emit(MOVE);
    window.fire('pagehide');
    expect([requests(), compressed]).toStrictEqual([
      [
        [ENDPOINT, { ...SENT, keepalive: true, body: chunk(0, [META]) }, false],
        [ENDPOINT, { ...SENT, keepalive: true, body: chunk(1, [MOVE]) }, false],
      ],
      [],
    ]);
  });

  it('compresses what waits as the page hides when its text passes 40,000 bytes of UTF-8, accents counted twice', async () => {
    recording().start();
    const accented = { type: 3, data: { text: 'ção'.repeat(9_000) }, timestamp: T };
    emit(accented);
    window.document.visibilityState = 'hidden';
    window.fire('visibilitychange');
    await settle();
    expect([requests(), compressed.length]).toStrictEqual([
      [[ENDPOINT, { ...SENT, keepalive: false, body: chunk(0, [accented]) }, true]],
      1,
    ]);
  });

  it('sends nothing when the page shows again with nothing new', () => {
    recording().start();
    window.fire('visibilitychange');
    window.document.visibilityState = 'hidden';
    window.fire('visibilitychange');
    expect(fetch).toHaveBeenCalledTimes(0);
  });

  it('places the clicks of the pointer for the heat map, and leaves out those of the keyboard and of scripts', () => {
    document.body.innerHTML = '<section id="status"><button id="send">send</button></section>';
    document.getElementById('status').getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1000,
      height: 400,
    });
    const target = document.getElementById('send');
    recording().start();
    time = 4_500;
    window.fire('click', { isTrusted: true, detail: 1, target, clientX: 250, clientY: 100 });
    window.fire('click', { isTrusted: true, detail: 0, target, clientX: 0, clientY: 0 });
    window.fire('click', { isTrusted: false, detail: 1, target, clientX: 500, clientY: 200 });
    window.document.visibilityState = 'hidden';
    window.fire('visibilitychange');
    document.body.innerHTML = '';
    expect(requests().map(([, { body }]) => body.clicks)).toStrictEqual([
      [{ region: 'status', viewport: '1280-1535', x: 0.25, y: 0.25, at: 3_500 }],
    ]);
  });

  it('stops for good: rrweb stops, nothing waiting goes, and it settles once the chunks on their way have', async () => {
    let arrive;
    fetch.mockImplementationOnce(() => new Promise((resolve) => (arrive = resolve)));
    const session = recording().start();
    emit(META);
    window.tick();
    await settle();
    emit(MOVE);
    let settled = false;
    const stopped = session.stop().then(() => (settled = true));
    await settle();
    const before = settled;
    arrive(new Response(null, { status: 204 }));
    await stopped;
    window.tick();
    window.fire('pagehide');
    window.fire('click', {
      isTrusted: true,
      detail: 1,
      target: document.body,
      clientX: 0,
      clientY: 0,
    });
    expect([
      recorder.stop.mock.calls.length,
      session.recording,
      before,
      settled,
      requests().map(([, { body }]) => body.seq),
      window.timers.size,
      [...window.listeners.values()].flat().length,
    ]).toStrictEqual([1, false, false, true, [0], 0, 0]);
  });

  it('sends nothing that was being compressed when it stops', async () => {
    let compress;
    const session = recording({
      compress: () => new Promise((resolve) => (compress = resolve)),
    }).start();
    emit(META);
    window.tick();
    const stopped = session.stop();
    compress(new TextEncoder().encode('{}'));
    await stopped;
    expect(fetch).toHaveBeenCalledTimes(0);
  });

  it('stops after half an hour, sending what it recorded until then', async () => {
    recording().start();
    emit(META);
    time = 1_000 + 1_800_000;
    window.tick();
    await settle();
    emit(MOVE);
    expect([
      requests().map(([, { body }]) => body.events),
      recorder.stop.mock.calls.length,
    ]).toStrictEqual([[[META]], 1]);
  });

  it('stops when rrweb gives an event too large for any chunk', () => {
    const session = recording().start();
    emit({ type: 2, data: { text: 'x'.repeat(700_000) }, timestamp: T });
    expect([session.recording, recorder.stop.mock.calls.length]).toStrictEqual([false, 1]);
  });

  it("uses rrweb's record, compresses with the browser's gzip and sends nothing from a host that is not the site", async () => {
    const browser = Object.assign(new FakeWindow('https://example.net/'), {
      Blob,
      Response,
      CompressionStream,
      crypto,
      performance,
      fetch,
    });
    const session = new SessionRecording({
      window: browser,
      codes,
      language: () => 'pt-BR',
      regions: [],
    });
    expect([SessionRecording.RECORD === record, session.start().recording]).toStrictEqual([
      true,
      false,
    ]);
  });
});
