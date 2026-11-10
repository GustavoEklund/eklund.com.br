import { RecordingStore } from '../src/recording-store.js';
import { SessionChunk } from '../src/session-chunk.js';
import { PanelFormat } from './panel-format.js';
import { PanelHtml } from './panel-html.js';
import { PanelLayout } from './panel-layout.js';

const HTML = PanelHtml.html;
const SEQ = /^\d{3}$/;

/**
 * One recording: the page that replays it with rrweb's replayer, and its chunks, read from R2 as gzip and sent on as they
 * are, for the replayer to inflate in the browser. A code or a chunk that does not exist is a 404.
 */
export class ReplayPage {
  #queries;
  #bucket;

  /** `bucket` only needs `get(key)`. */
  constructor({ queries, bucket }) {
    this.#queries = queries;
    this.#bucket = bucket;
  }

  /** Whether `code` is the shape of a recording's code. */
  static isCode(code) {
    return SessionChunk.CODE.test(code);
  }

  async render(code) {
    const recording = ReplayPage.isCode(code) ? await this.#queries.recording(code) : null;
    if (!recording)
      return {
        status: 404,
        title: 'No such recording',
        body: HTML`<p>No recording has that code. It may have passed its 30 days, or its browser asked to delete it.</p><p><a href="/recordings">All recordings</a></p>`,
      };
    const chunks = Array.from(
      { length: recording.last_seq + 1 },
      (_, seq) => `/recordings/${code}/${String(seq).padStart(3, '0')}`,
    );
    return {
      title: `Recording ${code.slice(0, 8)}`,
      scripts: ['/assets/replay-start.js'],
      styles: ['/assets/rrweb-replay.css'],
      policy: PanelLayout.REPLAY_POLICY,
      body: HTML`
        <dl class="facts">
          <div><dt>Page</dt><dd>${recording.page}</dd></div>
          <div><dt>Language</dt><dd>${recording.language}</dd></div>
          <div><dt>Release</dt><dd>${recording.version}</dd></div>
          <div><dt>Started</dt><dd>${PanelFormat.time(recording.started)}</dd></div>
          <div><dt>Length</dt><dd>${PanelFormat.duration(recording.duration_ms)}</dd></div>
          <div><dt>Size</dt><dd>${PanelFormat.bytes(recording.bytes)}, ${recording.chunks} ${recording.chunks === 1 ? 'chunk' : 'chunks'}</dd></div>
          <div><dt>Clicks</dt><dd>${recording.clicks}</dd></div>
        </dl>
        <div class="replay" data-chunks="${chunks.join(' ')}">
          <div class="controls">
            <button type="button" class="play" disabled>Play</button>
            <input class="seek" type="range" min="0" max="0" step="100" value="0" aria-label="Position in the recording" disabled>
            <output class="clock">0:00</output>
          </div>
          <p class="status" role="status">Loading the recording…</p>
          <div class="stage"></div>
        </div>
        <p><a href="/recordings">All recordings</a></p>`,
    };
  }

  /** A chunk of a recording, as the gzip R2 keeps. */
  async chunk(code, seq) {
    const recording =
      ReplayPage.isCode(code) && SEQ.test(seq) ? await this.#queries.recording(code) : null;
    const object = recording
      ? await this.#bucket.get(RecordingStore.key(recording.day, code, Number(seq)))
      : null;
    if (!object) return PanelLayout.text(404, 'Not found\n');
    return new Response(object.body, {
      headers: PanelLayout.headers('application/gzip'),
    });
  }
}
