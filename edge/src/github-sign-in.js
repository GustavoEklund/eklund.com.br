/** What the pages of the sign-in may load: nothing, and they may not be framed. */
const PAGE_POLICY = "default-src 'none'; base-uri 'none'; frame-ancestors 'none'";

/**
 * Signs the owner in through GitHub before the OAuth provider issues a token to an MCP client. GET /authorize shows which app
 * asks and where its access would go; POST /authorize sends an approval on to GitHub, with PKCE, or a refusal back to the app;
 * GET /callback reads who signed in and issues the grant only to a login that ALLOWED_GITHUB_LOGINS names. The OAuth provider
 * keeps the request between the steps and binds each step to the browser that started it (docs/upstream-sign-in.md of
 * @cloudflare/workers-oauth-provider). Nothing of GitHub is kept: its token is used once, to read the login.
 */
export class GithubSignIn {
  static GITHUB = { site: 'https://github.com', api: 'https://api.github.com' };
  static USER_AGENT = 'eklund-reading (+https://github.com/GustavoEklund/eklund.com.br)';

  #oauth;
  #errors;
  #fetch;
  #clientId;
  #clientSecret;
  #allowedLogins;
  #github;

  /**
   * `oauth` is the provider's helpers (env.OAUTH_PROVIDER), `errors` its AuthorizationError, CimdFetchError and
   * authorizationErrorRedirect, and `allowedLogins` are lower case.
   */
  constructor({
    oauth,
    errors,
    fetch,
    clientId,
    clientSecret,
    allowedLogins,
    github = GithubSignIn.GITHUB,
  }) {
    this.#oauth = oauth;
    this.#errors = errors;
    this.#fetch = fetch;
    this.#clientId = clientId;
    this.#clientSecret = clientSecret;
    this.#allowedLogins = allowedLogins;
    this.#github = github;
  }

  async handle(request) {
    const url = new URL(request.url);
    const { AuthorizationError, CimdFetchError } = this.#errors;
    try {
      if (url.pathname === '/authorize') {
        if (!this.#clientId || !this.#clientSecret)
          return GithubSignIn.#page(
            503,
            'Not set up',
            '<p>Signing in through GitHub is not set up yet.</p>',
          );
        if (request.method === 'GET') return await this.#ask(request);
        if (request.method === 'POST') return await this.#decide(request, url.origin);
        return GithubSignIn.#page(405, 'Not allowed', '<p>Only GET and POST.</p>', {
          allow: 'GET, POST',
        });
      }
      if (url.pathname === '/callback' && request.method === 'GET')
        return await this.#finish(request, url);
      return GithubSignIn.#page(404, 'Not found', '<p>Nothing is here.</p>');
    } catch (error) {
      if (error instanceof AuthorizationError && error.redirectTo)
        return GithubSignIn.#redirect(new Headers(), error.redirectTo);
      if (error instanceof AuthorizationError || error instanceof CimdFetchError)
        return GithubSignIn.#page(
          400,
          'Could not sign in',
          `<p>${GithubSignIn.#escape(
            error instanceof AuthorizationError
              ? error.description
              : 'This app could not be verified.',
          )}</p><p>Start again from the app.</p>`,
        );
      throw error;
    }
  }

  async #ask(request) {
    const authRequest = await this.#oauth.parseAuthRequest(request);
    const details = await this.#oauth.describeConsent(authRequest);
    const consent = await this.#oauth.beginConsent(authRequest);
    const escape = GithubSignIn.#escape;
    const name = escape(details.clientName || 'An app');
    return GithubSignIn.#page(
      200,
      `Allow ${name}?`,
      `<h1>Allow ${name} to read the measurements of eklund.com.br?</h1>
<p>${details.clientDomain ? `Published by <strong>${escape(details.clientDomain)}</strong>.` : 'This app registered itself, and its name is not verified.'} Its access will be sent to <strong>${escape(details.redirectHost)}</strong>.</p>
${details.redirectIsLoopback ? '<p><strong>This sends access to an app on this computer.</strong> Continue only if you just started signing in from it.</p>' : ''}
<p>The access only reads, and only the owner's GitHub account is accepted.</p>
<form method="post" action="/authorize">
<input type="hidden" name="handle" value="${escape(consent.handle)}">
<button name="decision" value="approve">Sign in with GitHub</button>
<button name="decision" value="deny">Deny</button>
</form>`,
      consent.headers,
    );
  }

  async #decide(request, origin) {
    const form = await request.formData();
    const handle = String(form.get('handle') ?? '');
    if (form.get('decision') !== 'approve') {
      const denied = await this.#oauth.denyConsent(request, handle);
      return GithubSignIn.#redirect(new Headers(denied.headers), denied.redirectTo);
    }
    const approved = await this.#oauth.approveConsent(request, handle);
    const verifier = GithubSignIn.#random();
    const upstream = await this.#oauth.beginUpstream(approved.request, {
      data: { verifier },
      headers: approved.headers,
    });
    const location = new URL('/login/oauth/authorize', this.#github.site);
    location.search = new URLSearchParams({
      client_id: this.#clientId,
      redirect_uri: `${origin}/callback`,
      state: upstream.state,
      code_challenge: await GithubSignIn.#challenge(verifier),
      code_challenge_method: 'S256',
      allow_signup: 'false',
    }).toString();
    return GithubSignIn.#redirect(new Headers(upstream.headers), location.href);
  }

  async #finish(request, url) {
    const { request: original, data, headers } = await this.#oauth.finishUpstream(request);
    const refuse = (description) =>
      GithubSignIn.#redirect(
        new Headers(headers),
        this.#errors.authorizationErrorRedirect(original, 'access_denied', description),
      );
    const code = url.searchParams.get('code');
    if (url.searchParams.has('error') || !code) return refuse('GitHub did not sign anyone in.');
    const user = await this.#user(code, data.verifier, `${url.origin}/callback`);
    if (!user) return refuse('GitHub refused the sign-in.');
    if (!this.#allowedLogins.includes(user.login.toLowerCase()))
      return refuse('This GitHub account may not read these measurements.');
    const { redirectTo } = await this.#oauth.completeAuthorization({
      request: original,
      userId: `github-${user.id}`,
      metadata: { login: user.login },
      scope: original.scope,
      props: { login: user.login },
    });
    return GithubSignIn.#redirect(new Headers(headers), redirectTo);
  }

  /** Trades GitHub's code for a token, and the token for the account: `{ id, login }`, or null when GitHub refuses either. */
  async #user(code, verifier, redirectUri) {
    const exchange = await this.#fetch(new URL('/login/oauth/access_token', this.#github.site), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': GithubSignIn.USER_AGENT,
      },
      body: new URLSearchParams({
        client_id: this.#clientId,
        client_secret: this.#clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    });
    const token = exchange.ok ? (await exchange.json()).access_token : null;
    if (typeof token !== 'string' || token === '') return null;
    const account = await this.#fetch(new URL('/user', this.#github.api), {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': GithubSignIn.USER_AGENT,
        'x-github-api-version': '2022-11-28',
      },
    });
    if (!account.ok) return null;
    const { id, login } = await account.json();
    return Number.isInteger(id) && typeof login === 'string' ? { id, login } : null;
  }

  /** 32 random bytes, base64url: a PKCE verifier. */
  static #random() {
    return GithubSignIn.#base64url(crypto.getRandomValues(new Uint8Array(32)));
  }

  static async #challenge(verifier) {
    return GithubSignIn.#base64url(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
    );
  }

  static #base64url(bytes) {
    return btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
  }

  static #redirect(headers, location) {
    headers.set('location', location);
    headers.set('cache-control', 'no-store');
    return new Response(null, { status: 302, headers });
  }

  static #page(status, title, body, headers = {}) {
    const merged = new Headers(headers);
    merged.set('content-type', 'text/html; charset=utf-8');
    merged.set('content-security-policy', PAGE_POLICY);
    merged.set('cache-control', 'no-store');
    merged.set('x-content-type-options', 'nosniff');
    return new Response(
      `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${body}
</html>
`,
      { status, headers: merged },
    );
  }

  static #escape(value) {
    return String(value).replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
  }
}
