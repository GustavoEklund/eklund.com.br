import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { GithubSignIn } from '../../edge/src/github-sign-in.js';
import { EdgeWorker } from '../support/edge-worker.js';
import { FakeGithub } from '../support/fake-github.js';
import { ReadingSession } from '../support/reading-session.js';

const WORKER = EdgeWorker.WORKER;
const GITHUB = { site: 'https://github.test', api: 'https://api.github.test' };
const AUTH_REQUEST = {
  clientId: 'a-client',
  redirectUri: 'http://127.0.0.1:9999/callback',
  state: 'the-state',
  scope: [],
};
const PAGE_HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'content-type': 'text/html; charset=utf-8',
  'x-content-type-options': 'nosniff',
};

class AuthorizationError extends Error {
  constructor(description, redirectTo = undefined) {
    super(description);
    this.description = description;
    this.redirectTo = redirectTo;
  }
}
class CimdFetchError extends Error {}
const ERRORS = {
  AuthorizationError,
  CimdFetchError,
  authorizationErrorRedirect: (request, code, description) =>
    `${request.redirectUri}?error=${code}&error_description=${encodeURIComponent(description)}&state=${request.state}`,
};

describe('GithubSignIn, with the helpers of the OAuth provider replaced', () => {
  let calls;
  let githubCalls;
  let user;
  let failure;

  /** The provider's helpers, each recording its call and answering what the provider would. */
  const oauth = {
    parseAuthRequest: async () => {
      calls.push(['parseAuthRequest']);
      if (failure) throw failure;
      return AUTH_REQUEST;
    },
    describeConsent: async () => ({
      clientName: '<b>Evil</b> & "Co"',
      redirectHost: '127.0.0.1',
      redirectIsLoopback: true,
      scope: [],
    }),
    beginConsent: async () => ({
      handle: 'a-handle',
      headers: new Headers({ 'set-cookie': 'consent=1', 'x-frame-options': 'DENY' }),
    }),
    denyConsent: async (_request, handle) => {
      calls.push(['denyConsent', handle]);
      return {
        redirectTo: `${AUTH_REQUEST.redirectUri}?error=access_denied`,
        headers: new Headers({ 'set-cookie': 'consent=; Max-Age=0' }),
      };
    },
    approveConsent: async (_request, handle) => {
      calls.push(['approveConsent', handle]);
      return {
        request: AUTH_REQUEST,
        headers: new Headers({ 'set-cookie': 'consent=; Max-Age=0' }),
      };
    },
    beginUpstream: async (request, { data, headers }) => {
      calls.push(['beginUpstream', request, data, headers.get('set-cookie')]);
      return { state: 'the-upstream-state', headers: new Headers({ 'set-cookie': 'upstream=1' }) };
    },
    finishUpstream: async () => {
      calls.push(['finishUpstream']);
      return {
        request: AUTH_REQUEST,
        data: { verifier: 'the-verifier' },
        headers: new Headers({ 'set-cookie': 'upstream=; Max-Age=0' }),
      };
    },
    completeAuthorization: async (options) => {
      calls.push(['completeAuthorization', options]);
      return { redirectTo: `${AUTH_REQUEST.redirectUri}?code=a-code&state=the-state` };
    },
  };
  /** GitHub: a token for any code, and `user` for it, or refusals when `user` is null. */
  const fetch = async (url, init = {}) => {
    githubCalls.push([String(url), init.method ?? 'GET', init.body ? String(init.body) : null]);
    if (!user) return new Response('{"error":"bad_verification_code"}', { status: 200 });
    return String(url).endsWith('/login/oauth/access_token')
      ? Response.json({ access_token: 'gho_x' })
      : Response.json(user);
  };
  const signIn = (changes = {}) =>
    new GithubSignIn({
      oauth,
      errors: ERRORS,
      fetch,
      clientId: 'an-app',
      clientSecret: 'a-secret',
      allowedLogins: ['gustavoeklund'],
      github: GITHUB,
      ...changes,
    });
  const form = (fields) =>
    new Request(`${WORKER}/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
    });
  const headersOf = (response) => Object.fromEntries(response.headers);

  beforeEach(() => {
    [calls, githubCalls, user, failure] = [[], [], { id: 7, login: 'GustavoEklund' }, null];
  });

  it('shows which app asks, escaped, where its access goes and that it is this computer, with the consent cookie', async () => {
    const response = await signIn().handle(new Request(`${WORKER}/authorize?client_id=a-client`));
    expect([response.status, headersOf(response), await response.text()]).toStrictEqual([
      200,
      { ...PAGE_HEADERS, 'set-cookie': 'consent=1', 'x-frame-options': 'DENY' },
      `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Allow &#60;b&#62;Evil&#60;/b&#62; &#38; &#34;Co&#34;?</title>
<h1>Allow &#60;b&#62;Evil&#60;/b&#62; &#38; &#34;Co&#34; to read the measurements of eklund.com.br?</h1>
<p>This app registered itself, and its name is not verified. Its access will be sent to <strong>127.0.0.1</strong>.</p>
<p><strong>This sends access to an app on this computer.</strong> Continue only if you just started signing in from it.</p>
<p>The access only reads, and only the owner's GitHub account is accepted.</p>
<form method="post" action="/authorize">
<input type="hidden" name="handle" value="a-handle">
<button name="decision" value="approve">Sign in with GitHub</button>
<button name="decision" value="deny">Deny</button>
</form>
</html>
`,
    ]);
  });

  it('answers 503 while the OAuth App is not set up, before reading the request', async () => {
    const response = await signIn({ clientSecret: undefined }).handle(
      new Request(`${WORKER}/authorize`),
    );
    expect([response.status, calls]).toStrictEqual([503, []]);
  });

  it('sends a refusal back to the app, with the cookie cleared', async () => {
    const response = await signIn().handle(form({ handle: 'a-handle', decision: 'deny' }));
    expect([response.status, headersOf(response), calls]).toStrictEqual([
      302,
      {
        'cache-control': 'no-store',
        location: `${AUTH_REQUEST.redirectUri}?error=access_denied`,
        'set-cookie': 'consent=; Max-Age=0',
      },
      [['denyConsent', 'a-handle']],
    ]);
  });

  it('sends an approval to GitHub with the PKCE challenge of a verifier it keeps with the provider, and no sign-up', async () => {
    const response = await signIn().handle(form({ handle: 'a-handle', decision: 'approve' }));
    const [, , { verifier }] = calls[1];
    const location = new URL(response.headers.get('location'));
    expect([
      response.status,
      response.headers.get('set-cookie'),
      calls.map((call) => call.slice(0, 2)),
      calls[1][3],
      verifier.length,
      `${location.origin}${location.pathname}`,
      Object.fromEntries(location.searchParams),
    ]).toStrictEqual([
      302,
      'upstream=1',
      [
        ['approveConsent', 'a-handle'],
        ['beginUpstream', AUTH_REQUEST],
      ],
      'consent=; Max-Age=0',
      43,
      'https://github.test/login/oauth/authorize',
      {
        client_id: 'an-app',
        redirect_uri: `${WORKER}/callback`,
        state: 'the-upstream-state',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
        allow_signup: 'false',
      },
    ]);
  });

  it("issues the grant to an allowed login, read case-insensitively, with GitHub's id and the login as props", async () => {
    const response = await signIn().handle(
      new Request(`${WORKER}/callback?code=a-github-code&state=the-upstream-state`),
    );
    expect([response.status, headersOf(response), calls, githubCalls]).toStrictEqual([
      302,
      {
        'cache-control': 'no-store',
        location: `${AUTH_REQUEST.redirectUri}?code=a-code&state=the-state`,
        'set-cookie': 'upstream=; Max-Age=0',
      },
      [
        ['finishUpstream'],
        [
          'completeAuthorization',
          {
            request: AUTH_REQUEST,
            userId: 'github-7',
            metadata: { login: 'GustavoEklund' },
            scope: [],
            props: { login: 'GustavoEklund' },
          },
        ],
      ],
      [
        [
          'https://github.test/login/oauth/access_token',
          'POST',
          new URLSearchParams({
            client_id: 'an-app',
            client_secret: 'a-secret',
            code: 'a-github-code',
            redirect_uri: `${WORKER}/callback`,
            code_verifier: 'the-verifier',
          }).toString(),
        ],
        ['https://api.github.test/user', 'GET', null],
      ],
    ]);
  });

  it('sends access_denied back to the app when GitHub signed no one in, refused, or signed in someone else', async () => {
    const callback = (query) => signIn().handle(new Request(`${WORKER}/callback?${query}`));
    const denied = [await callback('error=access_denied&state=s'), await callback('state=s')];
    user = { id: 8, login: 'someone-else' };
    denied.push(await callback('code=c&state=s'));
    user = null;
    denied.push(await callback('code=c&state=s'));
    expect([
      denied.map((response) => [response.status, response.headers.get('location')]),
      calls.filter(([name]) => name === 'completeAuthorization'),
    ]).toStrictEqual([
      [
        'GitHub did not sign anyone in.',
        'GitHub did not sign anyone in.',
        'This GitHub account may not read these measurements.',
        'GitHub refused the sign-in.',
      ].map((description) => [
        302,
        `${AUTH_REQUEST.redirectUri}?error=access_denied&error_description=${encodeURIComponent(description)}&state=the-state`,
      ]),
      [],
    ]);
  });

  it('redirects an error the provider can send back, shows the others, and lets anything else surface', async () => {
    const answers = [];
    for (const error of [
      new AuthorizationError('bad request', `${AUTH_REQUEST.redirectUri}?error=invalid_request`),
      new AuthorizationError('<the page expired>'),
      new CimdFetchError('no document'),
    ]) {
      failure = error;
      const response = await signIn().handle(new Request(`${WORKER}/authorize`));
      answers.push([
        response.status,
        response.headers.get('location'),
        (await response.text()).split('\n')[5],
      ]);
    }
    failure = new TypeError('a bug');
    await expect(signIn().handle(new Request(`${WORKER}/authorize`))).rejects.toThrow('a bug');
    expect(answers).toStrictEqual([
      [302, `${AUTH_REQUEST.redirectUri}?error=invalid_request`, undefined],
      [400, null, '<p>&#60;the page expired&#62;</p><p>Start again from the app.</p>'],
      [400, null, '<p>This app could not be verified.</p><p>Start again from the app.</p>'],
    ]);
  });

  it('answers 405 to another method on /authorize, and 404 anywhere else', async () => {
    const answers = await Promise.all([
      signIn().handle(new Request(`${WORKER}/authorize`, { method: 'PUT' })),
      signIn().handle(new Request(`${WORKER}/callback`, { method: 'POST' })),
      signIn().handle(new Request(`${WORKER}/somewhere`)),
    ]);
    expect(
      answers.map((response) => [response.status, response.headers.get('allow')]),
    ).toStrictEqual([
      [405, 'GET, POST'],
      [404, null],
      [404, null],
    ]);
  });
});

describe('signing in through the whole Worker in workerd, with GitHub on a local port', () => {
  const github = new FakeGithub();
  let worker;
  let session;

  beforeAll(async () => {
    await github.start();
    worker = new EdgeWorker(github.vars);
    session = new ReadingSession(worker);
    await worker.start();
  }, EdgeWorker.START_TIMEOUT_MS);
  afterAll(async () => {
    await worker.stop();
    await github.stop();
  });
  beforeEach(async () => {
    await worker.reset();
    github.requests = [];
    github.user = { id: 49698654, login: 'GustavoEklund' };
  });

  it("goes from the consent page through GitHub back to the app, and the app's code buys an hour's token", async () => {
    const { consent, page, github: toGithub, back, token } = await session.signIn();
    const sent = new URL(toGithub.headers.get('location'));
    const returned = new URL(back.headers.get('location'));
    expect([
      consent.status,
      /<h1>(.*)<\/h1>/.exec(page)[1],
      toGithub.status,
      `${sent.origin}${sent.pathname}`,
      [...sent.searchParams.keys()],
      back.status,
      `${returned.origin}${returned.pathname}`,
      [returned.searchParams.get('state'), returned.searchParams.get('iss')],
      [token.token_type, token.expires_in, token.resource, token.scope],
      github.requests.map(([method, path, form, authorization]) => [
        method,
        path,
        Object.keys(form),
        authorization,
      ]),
    ]).toStrictEqual([
      200,
      'Allow Claude Code to read the measurements of eklund.com.br?',
      302,
      `${github.site}/login/oauth/authorize`,
      [
        'client_id',
        'redirect_uri',
        'state',
        'code_challenge',
        'code_challenge_method',
        'allow_signup',
      ],
      302,
      ReadingSession.REDIRECT,
      ['the-state-of-the-client', WORKER],
      ['bearer', 3600, ReadingSession.RESOURCE, ''],
      [
        [
          'POST',
          '/login/oauth/access_token',
          ['client_id', 'client_secret', 'code', 'redirect_uri', 'code_verifier'],
          null,
        ],
        ['GET', '/user', [], `Bearer ${FakeGithub.TOKEN}`],
      ],
    ]);
  });

  it('gives no code to an app whose owner is another GitHub account, or when GitHub refuses', async () => {
    github.user = { id: 1, login: 'octocat' };
    const stranger = await session.signIn();
    github.user = null;
    const refused = await session.signIn();
    expect(
      [stranger, refused].map(({ back, token }) => {
        const location = new URL(back.headers.get('location'));
        return [
          location.searchParams.get('error'),
          location.searchParams.get('error_description'),
          token,
        ];
      }),
    ).toStrictEqual([
      ['access_denied', 'This GitHub account may not read these measurements.', null],
      ['access_denied', 'GitHub refused the sign-in.', null],
    ]);
  });
});
