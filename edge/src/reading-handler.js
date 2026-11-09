import { createMcpHandler } from '@modelcontextprotocol/server';
import { ReadingApi } from './reading-api.js';
import { ReadingServer } from './reading-server.js';

/**
 * What answers a request that carries a valid token of the OAuth provider: the MCP server at /mcp and the JSON API under
 * /api/v1. The provider only issues tokens to the GitHub accounts that ALLOWED_GITHUB_LOGINS names, and this checks the login
 * in the token again, so removing an account from that list closes its tokens at once.
 */
export class ReadingHandler {
  #allowedLogins;
  #queries;

  /** `allowedLogins` are lower case. */
  constructor({ allowedLogins, queries }) {
    this.#allowedLogins = allowedLogins;
    this.#queries = queries;
  }

  /** `props` are what the sign-in stored in the token: the GitHub login. */
  handle(request, props) {
    const login = typeof props?.login === 'string' ? props.login.toLowerCase() : '';
    if (!this.#allowedLogins.includes(login))
      return ReadingHandler.#text(403, 'This account may not read these measurements.\n');
    const { pathname } = new URL(request.url);
    if (pathname === '/mcp')
      return createMcpHandler(() => new ReadingServer(this.#queries).create()).fetch(request);
    if (pathname === ReadingApi.PREFIX || pathname.startsWith(`${ReadingApi.PREFIX}/`))
      return new ReadingApi(this.#queries).handle(request);
    return ReadingHandler.#text(404, 'Not found\n');
  }

  static #text(status, body) {
    return new Response(body, {
      status,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
}
