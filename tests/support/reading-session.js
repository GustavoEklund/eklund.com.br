import { createHash, randomBytes } from 'node:crypto';
import { EdgeWorker } from './edge-worker.js';

/**
 * What an MCP client such as Claude Code does to read the measurements: it registers itself, sends the owner through the
 * consent page and GitHub, and trades the code for a token. Each step is kept, so a test can look at any of them.
 */
export class ReadingSession {
  static REDIRECT = 'http://127.0.0.1:9999/callback';
  static RESOURCE = `${EdgeWorker.WORKER}/`;

  #worker;

  constructor(worker) {
    this.#worker = worker;
  }

  /** A dynamic registration, as an MCP client sends it. */
  async register(name = 'Claude Code') {
    const response = await this.#fetch('/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: [ReadingSession.REDIRECT],
        token_endpoint_auth_method: 'none',
        client_name: name,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      }),
    });
    return (await response.json()).client_id;
  }

  /**
   * Every step up to the token: `consent` (the page), `github` (where approving sends the browser), `back` (where the
   * callback sends it) and `token` (the answer of the token endpoint, null when no code came back).
   */
  async signIn(name) {
    const clientId = await this.register(name);
    const verifier = randomBytes(32).toString('base64url');
    const consent = await this.#fetch(
      `/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: ReadingSession.REDIRECT,
        state: 'the-state-of-the-client',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
        resource: ReadingSession.RESOURCE,
      })}`,
    );
    const page = await consent.clone().text();
    const cookies = ReadingSession.#cookies(consent);
    const github = await this.#fetch('/authorize', {
      method: 'POST',
      headers: { cookie: cookies, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        handle: /name="handle" value="([^"]+)"/.exec(page)[1],
        decision: 'approve',
      }),
    });
    const state = new URL(github.headers.get('location')).searchParams.get('state');
    const back = await this.#fetch(
      `/callback?${new URLSearchParams({ code: 'a-github-code', state })}`,
      {
        headers: { cookie: `${cookies}; ${ReadingSession.#cookies(github)}` },
      },
    );
    const code = new URL(back.headers.get('location')).searchParams.get('code');
    const token = code
      ? await (
          await this.#fetch('/token', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              code,
              redirect_uri: ReadingSession.REDIRECT,
              client_id: clientId,
              code_verifier: verifier,
              resource: ReadingSession.RESOURCE,
            }),
          })
        ).json()
      : null;
    return { clientId, consent, page, github, back, token };
  }

  /** A JSON-RPC request to /mcp, as a 2025-11-25 client sends it, and the message it answers. */
  async call(token, id, method, params) {
    const response = await this.#fetch('/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': '2025-11-25',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }),
    });
    return ReadingSession.message(response);
  }

  /** The JSON-RPC message of a response, sent as JSON or as the one event of a stream. */
  static async message(response) {
    const text = await response.text();
    const data = response.headers.get('content-type')?.startsWith('text/event-stream')
      ? text
          .split('\n')
          .filter((line) => line.startsWith('data: '))
          .map((line) => line.slice('data: '.length))
          .join('')
      : text;
    return JSON.parse(data);
  }

  #fetch(path, init = {}) {
    return this.#worker.fetch(path, { redirect: 'manual', ...init });
  }

  /** The cookies a response sets, as a browser would send them back. */
  static #cookies(response) {
    return response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
  }
}
