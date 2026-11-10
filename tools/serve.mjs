// Static file server for source/, with no dependencies. Used by `pnpm dev`, Playwright and Cucumber.
// usage: node tools/serve.mjs [--port 8734] [--root source]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NotFoundPages } from './not-found-pages.mjs';
import { SiteHeaders } from './site-headers.mjs';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

class StaticServer {
  #root;

  constructor(root) {
    this.#root = root;
  }

  listen(port, host = '127.0.0.1') {
    const server = createServer((request, response) => this.#handle(request, response));
    return new Promise((done) => server.listen(port, host, () => done(server)));
  }

  async #handle(request, response) {
    try {
      const pathname = StaticServer.#pathnameOf(request.url);
      if (pathname === null) return this.#send(response, 400, 'Bad request');
      const moved = StaticServer.#movedTo(request.url);
      if (moved) return this.#redirect(response, moved);
      const requested = resolve(join(this.#root, normalize(pathname)));
      if (requested !== this.#root && !requested.startsWith(this.#root + sep))
        return this.#send(response, 403, 'Forbidden');
      const file = await this.#resolveFile(requested);
      if (!file) return await this.#notFound(response, requested);
      const content = await readFile(file); // read first: a failure here must still be able to answer 500
      const isDocument = extname(file) === '.html';
      const headers = SiteHeaders.development({
        html: isDocument ? content.toString('utf8') : '',
        isDocument,
        pathname,
      });
      response.writeHead(200, {
        'Content-Type': MIME_TYPES[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        ...headers,
      });
      response.end(content);
    } catch {
      this.#send(response, 500, 'Server error');
    }
  }

  /**
   * Where a request is sent for good, as the root .htaccess does: /en gets its slash, and the address the English page had before
   * it had its own, /?lang=en, leads to /en/. Null when the request stays where it is.
   */
  static #movedTo(url) {
    const { pathname, searchParams } = new URL(url, 'http://localhost');
    if (pathname === '/en') return '/en/';
    return pathname === '/' && /^en/i.test(searchParams.get('lang') ?? '') ? '/en/' : null;
  }

  #redirect(response, location) {
    response.writeHead(301, {
      Location: location,
      'Content-Type': 'text/plain; charset=utf-8',
      ...SiteHeaders.development({ html: '', isDocument: false }),
    });
    response.end(`Moved to ${location}`);
  }

  /** The decoded path of a request URL, or null when it holds a malformed percent escape. */
  static #pathnameOf(url) {
    try {
      return decodeURIComponent(new URL(url, 'http://localhost').pathname);
    } catch {
      return null;
    }
  }

  async #resolveFile(path) {
    try {
      const info = await stat(path);
      return info.isDirectory() ? this.#resolveFile(join(path, 'index.html')) : path;
    } catch {
      return null;
    }
  }

  /**
   * A missing address answers 404 with the page the .htaccess files name for it (0016), English under an en/ folder, as Apache
   * does with ErrorDocument; a folder without those pages gets the plain text answer.
   */
  async #notFound(response, requested) {
    const file = NotFoundPages.fileFor(await this.#deepestFolder(requested));
    let content;
    try {
      content = await readFile(join(this.#root, file));
    } catch {
      return this.#send(response, 404, 'Not found');
    }
    response.writeHead(404, {
      'Content-Type': MIME_TYPES['.html'],
      'Cache-Control': 'no-store',
      ...SiteHeaders.development({
        html: content.toString('utf8'),
        isDocument: true,
        pathname: `/${file}`,
      }),
    });
    response.end(content);
  }

  /** The deepest folder of a path inside the root that exists, relative to the root with slashes ('' for the root itself). */
  async #deepestFolder(path) {
    for (let folder = path; folder.startsWith(this.#root); folder = dirname(folder)) {
      try {
        if ((await stat(folder)).isDirectory())
          return relative(this.#root, folder).split(sep).join('/');
      } catch {
        // missing: try the folder above
      }
      if (folder === this.#root) break;
    }
    return '';
  }

  #send(response, status, message) {
    response.writeHead(status, {
      'Content-Type': 'text/plain; charset=utf-8',
      ...SiteHeaders.development({ html: '', isDocument: false }),
    });
    response.end(message);
  }
}

const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
};
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const root = resolve(projectRoot, argument('root', 'source'));
const port = Number(argument('port', 8734));
await new StaticServer(root).listen(port);
console.log(`serving ${root} at http://127.0.0.1:${port}/`);
