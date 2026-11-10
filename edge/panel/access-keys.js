const ALGORITHM = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };

/**
 * The public keys that sign the tokens of Cloudflare Access, from the team's /cdn-cgi/access/certs, imported for WebCrypto
 * and kept in the isolate's memory for an hour. Access rotates its keys every six weeks and publishes the next one before
 * it signs with it, so a key id that is not in the set fetches the set again, at most once a minute. A set that cannot be
 * fetched finds no key, and the token is refused.
 */
export class AccessKeys {
  static TTL_MS = 3_600_000;
  static RETRY_MS = 60_000;
  /** The keys of every team this isolate has read, by the address of the set. */
  static #shared = new Map();

  #url;
  #fetch;
  #clock;
  #cache;

  /** `cache` is a Map that outlives the request; by default, one shared by the isolate. */
  constructor({ url, fetch, clock = Date, cache = AccessKeys.#shared }) {
    this.#url = url;
    this.#fetch = fetch;
    this.#clock = clock;
    this.#cache = cache;
  }

  /** The key with this id, or null when the set has none or cannot be read. */
  async find(kid) {
    const now = this.#clock.now();
    const kept = this.#cache.get(this.#url);
    const age = kept ? now - kept.fetchedAt : Infinity;
    if (kept && age < AccessKeys.TTL_MS && kept.keys.has(kid)) return kept.keys.get(kid);
    if (kept && age < AccessKeys.RETRY_MS) return null;
    const keys = await this.#load();
    if (!keys) return null;
    this.#cache.set(this.#url, { fetchedAt: now, keys });
    return keys.get(kid) ?? null;
  }

  async #load() {
    try {
      const response = await this.#fetch(this.#url, { headers: { accept: 'application/json' } });
      if (!response.ok) return null;
      const { keys } = await response.json();
      if (!Array.isArray(keys)) return null;
      const usable = keys.filter(
        (key) =>
          key?.kty === 'RSA' &&
          typeof key.kid === 'string' &&
          typeof key.n === 'string' &&
          typeof key.e === 'string' &&
          (key.alg === undefined || key.alg === 'RS256') &&
          (key.use === undefined || key.use === 'sig'),
      );
      return new Map(
        await Promise.all(
          usable.map(async ({ kid, n, e }) => [
            kid,
            await crypto.subtle.importKey(
              'jwk',
              { kty: 'RSA', n, e, alg: 'RS256', ext: true },
              ALGORITHM,
              false,
              ['verify'],
            ),
          ]),
        ),
      );
    } catch {
      return null;
    }
  }
}
