import { createServer } from 'node:http';
import { webcrypto } from 'node:crypto';

const ALGORITHM = {
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};

/**
 * Cloudflare Access for the tests of the panel: a key pair made here, the team's certificates on a local port, and tokens
 * signed as Access signs them, with any claim changed. A second pair, which the certificates do not list, signs forgeries.
 */
export class FakeAccess {
  static TEAM = 'eklund-tests.cloudflareaccess.com';
  static ISSUER = `https://${FakeAccess.TEAM}`;
  static AUDIENCE = 'a3f1c0d2e4b5a6978877665544332211a3f1c0d2e4b5a6978877665544332211';
  static EMAIL = 'owner@example.com';
  static KID = 'the-key-of-the-tests';

  requests = 0;

  #pair;
  #stranger;
  #server = createServer(async (request, response) => {
    this.requests += 1;
    response.setHeader('content-type', 'application/json');
    if (request.url !== '/cdn-cgi/access/certs') {
      response.writeHead(404).end('{}');
      return;
    }
    const { n, e } = await webcrypto.subtle.exportKey('jwk', this.#pair.publicKey);
    response.end(
      JSON.stringify({
        keys: [{ kid: FakeAccess.KID, kty: 'RSA', alg: 'RS256', use: 'sig', n, e }],
        public_cert: { kid: FakeAccess.KID, cert: '' },
        public_certs: [],
      }),
    );
  });

  get certificates() {
    return `http://127.0.0.1:${this.#server.address().port}/cdn-cgi/access/certs`;
  }

  /** The variables that point the panel at this team, with the tests' AUD and allow-list. */
  get vars() {
    return {
      ACCESS_TEAM_DOMAIN: FakeAccess.TEAM,
      ACCESS_CERTIFICATES: this.certificates,
      ACCESS_AUD: FakeAccess.AUDIENCE,
      ALLOWED_EMAILS: `someone@example.com ${FakeAccess.EMAIL.toUpperCase()}`,
    };
  }

  async start() {
    this.#pair = await webcrypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
    this.#stranger = await webcrypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
    await new Promise((done) => this.#server.listen(0, '127.0.0.1', done));
  }

  stop() {
    return new Promise((done) => this.#server.close(done));
  }

  /** The public half of the pair, as WebCrypto imports it, for the unit tests. */
  get publicKey() {
    return this.#pair.publicKey;
  }

  /** The claims of a valid token for the owner, issued a minute before `now` and expiring a day after. */
  static claims(now = Date.now()) {
    const seconds = Math.floor(now / 1_000);
    return {
      aud: [FakeAccess.AUDIENCE],
      email: FakeAccess.EMAIL,
      exp: seconds + 86_400,
      iat: seconds - 60,
      nbf: seconds - 60,
      iss: FakeAccess.ISSUER,
      type: 'app',
      identity_nonce: 'a-nonce',
      sub: '7335d417-61da-459d-899c-0a01c76a2a54',
      country: 'BR',
    };
  }

  /**
   * A token with `claims`, signed by the team's key unless `forged`, with `header` merged into its header.
   */
  async token(claims = FakeAccess.claims(), { forged = false, header = {} } = {}) {
    const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const signed = `${part({ alg: 'RS256', kid: FakeAccess.KID, typ: 'JWT', ...header })}.${part(claims)}`;
    const signature = await webcrypto.subtle.sign(
      ALGORITHM.name,
      (forged ? this.#stranger : this.#pair).privateKey,
      new TextEncoder().encode(signed),
    );
    return `${signed}.${Buffer.from(signature).toString('base64url')}`;
  }
}
