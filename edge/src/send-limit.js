/**
 * How many reports one client may send in a minute, in each Cloudflare location, through the rate limiting binding. The
 * client is told apart by a hash of its address, which lives only in the binding's counters at the edge for that minute and
 * is never stored. Without the binding, or without an address, nothing is limited.
 */
export class SendLimit {
  /** What a refused client is told to wait: the binding's period. */
  static RETRY_AFTER_SECONDS = 60;

  #limiter;

  constructor(limiter) {
    this.#limiter = limiter;
  }

  async allows(request) {
    const address = request.headers.get('cf-connecting-ip');
    if (!this.#limiter || !address) return true;
    const { success } = await this.#limiter.limit({ key: await SendLimit.key(address) });
    return success;
  }

  /** The key of an address: the first 32 hexadecimal digits of its SHA-256. */
  static async key(address) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address));
    return Array.from(new Uint8Array(digest).slice(0, 16), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
  }
}
