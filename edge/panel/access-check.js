const ALGORITHM = { name: 'RSASSA-PKCS1-v1_5' };
/** How far ahead of the panel's clock Access's clock may run when it issues a token, in seconds. */
const LEEWAY_SECONDS = 60;

class Refusal extends Error {}

/**
 * The panel's own check of who is asking, behind Cloudflare Access and apart from it (docs/decisions/0015): the token that
 * Access puts in Cf-Access-Jwt-Assertion must be signed with RS256 by a key of the team, issued by the team, meant for the
 * panel's application (its AUD tag), not expired, and name an email in the allow-list. Anything missing, a team or an AUD
 * that is not set, or an empty list refuses every request, so the panel answers 403 until Access and its settings are in place.
 */
export class AccessCheck {
  static HEADER = 'cf-access-jwt-assertion';

  #issuer;
  #audience;
  #allowedEmails;
  #keys;
  #clock;

  /**
   * `teamDomain` is the team's host, such as eklund-lab.cloudflareaccess.com; `allowedEmails` are lower case; `keys` finds a
   * CryptoKey by its id (AccessKeys).
   */
  constructor({ teamDomain, audience, allowedEmails, keys, clock = Date }) {
    this.#issuer = teamDomain ? `https://${teamDomain}` : '';
    this.#audience = audience ?? '';
    this.#allowedEmails = allowedEmails;
    this.#keys = keys;
    this.#clock = clock;
  }

  /** The certificates of a team: where AccessKeys reads them. */
  static certificates(teamDomain) {
    return `https://${teamDomain}/cdn-cgi/access/certs`;
  }

  /** `{ ok: true, email }`, or `{ ok: false, reason }`, which the panel keeps to itself. */
  async verify(request) {
    try {
      return { ok: true, email: await this.#email(request.headers.get(AccessCheck.HEADER)) };
    } catch (error) {
      // Fail closed: whatever else went wrong, such as a signature WebCrypto cannot read, refuses too.
      return { ok: false, reason: error instanceof Refusal ? error.message : 'could not verify' };
    }
  }

  async #email(token) {
    if (!this.#issuer || !this.#audience || this.#allowedEmails.length === 0)
      throw new Refusal('the panel is not set up');
    if (!token) throw new Refusal('no token');
    const parts = token.split('.');
    if (parts.length !== 3) throw new Refusal('not a token');
    const [head, body, signature] = parts;
    const header = AccessCheck.#json(head);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string')
      throw new Refusal('not signed with RS256');
    const key = await this.#keys.find(header.kid);
    if (!key) throw new Refusal('no key of the team has that id');
    const signed = await crypto.subtle.verify(
      ALGORITHM,
      key,
      AccessCheck.#bytes(signature),
      new TextEncoder().encode(`${head}.${body}`),
    );
    if (!signed) throw new Refusal('the signature does not match');
    const claims = AccessCheck.#json(body);
    const now = this.#clock.now() / 1_000;
    if (claims.iss !== this.#issuer) throw new Refusal('another issuer');
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(this.#audience)) throw new Refusal('another application');
    if (typeof claims.exp !== 'number' || claims.exp <= now) throw new Refusal('expired');
    if (typeof claims.nbf === 'number' && claims.nbf - LEEWAY_SECONDS > now)
      throw new Refusal('not valid yet');
    const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
    if (!this.#allowedEmails.includes(email)) throw new Refusal('this email may not read');
    return email;
  }

  static #json(part) {
    try {
      const value = JSON.parse(new TextDecoder().decode(AccessCheck.#bytes(part)));
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch {
      // read below as not a token
    }
    throw new Refusal('not a token');
  }

  /** The bytes of a base64url part. */
  static #bytes(part) {
    if (!/^[A-Za-z0-9_-]*$/.test(part)) throw new Refusal('not a token');
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), (character) =>
      character.charCodeAt(0),
    );
  }
}
