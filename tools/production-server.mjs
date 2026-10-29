// Serves a folder the way the hosting serves the site: HTTP/2 over TLS with brotli, the security headers and the
// language of each page from tools/site-headers.mjs, and the cache rules of the .htaccess files. Lighthouse CI loads the
// build through it, so what it counts is what a visitor downloads; tools/measure-build.mjs measures with it too.
// usage: node tools/production-server.mjs [--root dist] [--port 8738]      (needs openssl)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createSecureServer } from 'node:http2';
import { tmpdir } from 'node:os';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';
import { SiteHeaders } from './site-headers.mjs';

const PROJECT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};
const COMPRESSIBLE = new Set([
  '.html',
  '.js',
  '.css',
  '.json',
  '.svg',
  '.ico',
  '.txt',
  '.xml',
  '.webmanifest',
]);

/** A certificate for 127.0.0.1 that lives as long as the process. */
export class Certificate {
  static create() {
    const folder = mkdtempSync(join(tmpdir(), 'production-server-'));
    try {
      execFileSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-days',
          '1',
          '-subj',
          '/CN=127.0.0.1',
          '-addext',
          'subjectAltName=IP:127.0.0.1',
          '-keyout',
          join(folder, 'key.pem'),
          '-out',
          join(folder, 'cert.pem'),
        ],
        { stdio: 'ignore' },
      );
      return {
        key: readFileSync(join(folder, 'key.pem')),
        cert: readFileSync(join(folder, 'cert.pem')),
      };
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }
}

/** One folder served over HTTP/2, with the headers production sends. Each compressed copy is made once. */
export class ProductionServer {
  #root;
  #cache = new Map();
  #sessions = new Set();
  #server;

  constructor(root) {
    this.#root = resolve(PROJECT, root);
  }

  /** Listens on `port` (0 picks a free one) and resolves with the origin. */
  async start(certificate, port = 0) {
    this.#server = createSecureServer({ ...certificate, allowHTTP1: false });
    this.#server.on('session', (session) => {
      this.#sessions.add(session);
      session.on('close', () => this.#sessions.delete(session));
    });
    this.#server.on('request', (request, response) => this.#answer(request, response));
    await new Promise((done) => this.#server.listen(port, '127.0.0.1', done));
    return `https://127.0.0.1:${this.#server.address().port}`;
  }

  stop() {
    for (const session of this.#sessions) session.destroy();
    return new Promise((done) => this.#server.close(done));
  }

  #answer(request, response) {
    const file = this.#fileFor(request.url);
    if (!file) {
      response.writeHead(404, {
        'content-type': 'text/plain; charset=utf-8',
        ...SiteHeaders.production(''),
      });
      response.end('Not found');
      return;
    }
    const extension = extname(file);
    const brotli =
      COMPRESSIBLE.has(extension) && /\bbr\b/.test(request.headers['accept-encoding'] ?? '');
    const { body, html } = this.#read(file, brotli);
    const pathname = `/${relative(this.#root, file).split(sep).join('/')}`;
    const cacheControl = SiteHeaders.cacheControl(pathname);
    response.writeHead(200, {
      'content-type': MIME[extension] ?? 'application/octet-stream',
      ...(cacheControl ? { 'cache-control': cacheControl } : {}),
      ...(brotli ? { 'content-encoding': 'br', vary: 'Accept-Encoding' } : {}),
      ...SiteHeaders.production(html),
      ...(extension === '.html'
        ? { 'Content-Language': SiteHeaders.documentLanguage(pathname) }
        : {}),
    });
    response.end(body);
  }

  /** The file a request names, a folder meaning its index.html, or null when it is missing or outside the root. */
  #fileFor(url) {
    try {
      const pathname = decodeURIComponent(new URL(url, 'https://127.0.0.1').pathname);
      const requested = join(this.#root, normalize(pathname));
      if (requested !== this.#root && !requested.startsWith(this.#root + sep)) return null;
      const file = statSync(requested).isDirectory() ? join(requested, 'index.html') : requested;
      return statSync(file).isFile() ? file : null;
    } catch {
      return null;
    }
  }

  #read(file, brotli) {
    const key = `${file}|${brotli}`;
    if (!this.#cache.has(key)) {
      const body = readFileSync(file);
      this.#cache.set(key, {
        body: brotli
          ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } })
          : body,
        html: extname(file) === '.html' ? body.toString('utf8') : '',
      });
    }
    return this.#cache.get(key);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argument = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`);
    return index > -1 ? process.argv[index + 1] : fallback;
  };
  const root = argument('root', 'dist');
  const server = new ProductionServer(root);
  const origin = await server.start(Certificate.create(), Number(argument('port', 8738)));
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => server.stop().then(() => process.exit(0)));
  // Lighthouse CI waits for this line (startServerReadyPattern).
  console.log(`ready: ${root}/ at ${origin}`);
}
