import { createServer } from 'node:http';

/**
 * GitHub's two endpoints that the sign-in calls, on a local port: the exchange of a code for a token, and the account of the
 * token. It answers with `user`, or refuses when `user` is null, and records each request with its form body.
 */
export class FakeGithub {
  static TOKEN = 'gho_a-token-of-the-tests';

  user = { id: 49698654, login: 'GustavoEklund' };
  requests = [];

  #server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      this.requests.push([
        request.method,
        request.url,
        Object.fromEntries(new URLSearchParams(body)),
        request.headers.authorization ?? null,
      ]);
      response.setHeader('content-type', 'application/json');
      if (request.url === '/login/oauth/access_token')
        response.end(
          JSON.stringify(
            this.user ? { access_token: FakeGithub.TOKEN } : { error: 'bad_verification_code' },
          ),
        );
      else if (request.url === '/user' && this.user) response.end(JSON.stringify(this.user));
      else response.writeHead(401).end('{"message":"Bad credentials"}');
    });
  });

  get site() {
    return `http://127.0.0.1:${this.#server.address().port}`;
  }

  /** The variables that point the Worker's sign-in at this server, with an OAuth App's id and secret. */
  get vars() {
    return {
      GITHUB_SITE: this.site,
      GITHUB_API: this.site,
      GITHUB_CLIENT_ID: 'Ov23li-the-tests',
      GITHUB_CLIENT_SECRET: 'a-secret-of-the-tests',
    };
  }

  start() {
    return new Promise((done) => this.#server.listen(0, '127.0.0.1', done));
  }

  stop() {
    return new Promise((done) => this.#server.close(done));
  }
}
