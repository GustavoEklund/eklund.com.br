/**
 * Gzip through the streams of the runtime, which run in native code and cost the Worker little of its CPU time. Reading stops
 * as soon as the text grows past its limit, so a small body that inflates into a huge one is refused before it is held.
 */
export class Gzip {
  /** Whether `bytes` start with the two bytes that open every gzip member. */
  static is(bytes) {
    return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  }

  /**
   * The UTF-8 text inside gzip `bytes`: `{ ok: true, text }`, or `{ ok: false, reason }` when the bytes are not gzip, the
   * text is not UTF-8, or it is longer than `limit` bytes.
   */
  static async inflate(bytes, limit) {
    const reader = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'))
      .getReader();
    const parts = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel();
          return { ok: false, reason: 'too long' };
        }
        parts.push(value);
      }
    } catch {
      return { ok: false, reason: 'not gzip' };
    }
    return Gzip.text(Gzip.#joined(parts, size));
  }

  /** The gzip of a text. */
  static async deflate(text) {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** `bytes` read as UTF-8: `{ ok: true, text }`, or `{ ok: false, reason }` when they are not. */
  static text(bytes) {
    try {
      return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
    } catch {
      return { ok: false, reason: 'not UTF-8' };
    }
  }

  static #joined(parts, size) {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    return bytes;
  }
}
