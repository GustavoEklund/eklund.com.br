/** Chunks of a session recording for the tests of the collector: a complete one, and copies of it with one thing changed. */
export class SessionChunks {
  static CODE = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
  static OTHER = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  /** 29 October 2026, 02:30 UTC, the clock of the events. */
  static STARTED = 1_793_241_000_000;

  /** The first chunk of a recording of the home page: rrweb's meta, full snapshot and a click, and the click of the heat map. */
  static complete() {
    return {
      v: 1,
      code: SessionChunks.CODE,
      seq: 0,
      version: '1.2.0',
      page: '/',
      language: 'pt-BR',
      events: [
        {
          type: 4,
          data: { href: 'https://eklund.com.br/', width: 1280, height: 800 },
          timestamp: SessionChunks.STARTED,
        },
        {
          type: 2,
          data: { node: { type: 0, childNodes: [], id: 1 }, initialOffset: { left: 0, top: 0 } },
          timestamp: SessionChunks.STARTED + 10,
        },
        {
          type: 3,
          data: { source: 2, type: 2, id: 42, x: 640, y: 300 },
          timestamp: SessionChunks.STARTED + 4_000,
        },
      ],
      clicks: [{ region: 'status', viewport: '1280-1535', x: 0.25, y: 0.5, at: 4_000 }],
    };
  }

  /** The complete chunk after `change` edits it. */
  static with(change) {
    const chunk = SessionChunks.complete();
    change(chunk);
    return chunk;
  }

  /** The gzip of a chunk, or of any text, as the page sends it. */
  static async gzip(chunk) {
    const text = typeof chunk === 'string' ? chunk : JSON.stringify(chunk);
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** The text inside gzip bytes. */
  static async inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
}
