import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SiteHeaders } from '../../tools/site-headers.mjs';
import { RunningServer } from '../support/running-server.js';

const PROJECT = join(import.meta.dirname, '..', '..');

describe('tools/serve.mjs', () => {
  let root, server;
  const BASE_POLICY =
    "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests";

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'serve-root-'));
    const files = {
      'index.html': '<h1>home</h1>',
      'about/index.html': '<h1>about</h1>',
      'en/index.html': '<h1>english</h1>',
      'empty/.keep': '',
      'hello world.txt': 'spaced',
      'app.js': 'export {};',
      'main.mjs': 'export {};',
      'style.css': 'a{}',
      'data.json': '{}',
      'logo.svg': '<svg/>',
      'p.png': 'png',
      'p.jpg': 'jpg',
      'p.jpeg': 'jpeg',
      'p.webp': 'webp',
      'favicon.ico': 'ico',
      'robots.txt': 'x',
      'font.woff2': 'woff',
      'sitemap.xml': '<urlset/>',
      'site.webmanifest': '{}',
      'blob.bin': 'bin',
      noext: 'plain',
    };
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(join(root, name, '..'), { recursive: true });
      writeFileSync(join(root, name), content);
    }
    writeFileSync(join(root, '..', 'outside-secret.txt'), 'secret');
    server = await RunningServer.start(['--root', root]);
  });

  afterAll(() => {
    server.stop();
    rmSync(root, { recursive: true, force: true });
    rmSync(join(root, '..', 'outside-secret.txt'), { force: true });
  });

  it('announces the folder and the address it serves', () => {
    expect(server.banner).toBe(`serving ${root} at http://127.0.0.1:${server.port}/`);
  });

  it('serves a file with its type, never cached, byte for byte', async () => {
    expect(await server.get('/index.html')).toStrictEqual({
      status: 200,
      type: 'text/html; charset=utf-8',
      cache: 'no-store',
      body: '<h1>home</h1>',
    });
  });

  it('serves index.html for the root and for a folder, with or without the slash', async () => {
    expect(
      (await Promise.all(['/', '/about', '/about/'].map((path) => server.get(path)))).map(
        ({ status, body }) => [status, body],
      ),
    ).toStrictEqual([
      [200, '<h1>home</h1>'],
      [200, '<h1>about</h1>'],
      [200, '<h1>about</h1>'],
    ]);
  });

  it.each([
    ['/app.js', 'text/javascript; charset=utf-8'],
    ['/main.mjs', 'text/javascript; charset=utf-8'],
    ['/style.css', 'text/css; charset=utf-8'],
    ['/data.json', 'application/json; charset=utf-8'],
    ['/logo.svg', 'image/svg+xml'],
    ['/p.png', 'image/png'],
    ['/p.jpg', 'image/jpeg'],
    ['/p.jpeg', 'image/jpeg'],
    ['/p.webp', 'image/webp'],
    ['/favicon.ico', 'image/x-icon'],
    ['/robots.txt', 'text/plain; charset=utf-8'],
    ['/font.woff2', 'font/woff2'],
    ['/sitemap.xml', 'application/xml; charset=utf-8'],
    ['/site.webmanifest', 'application/manifest+json; charset=utf-8'],
    ['/blob.bin', 'application/octet-stream'],
    ['/noext', 'application/octet-stream'],
  ])('types %s as %s', async (path, type) => {
    expect((await server.get(path)).type).toBe(type);
  });

  it('ignores the query string and the hash', async () => {
    expect((await server.get('/app.js?v=3')).body).toBe('export {};');
  });

  it('decodes percent-encoded names', async () => {
    expect(await server.get('/hello%20world.txt')).toStrictEqual({
      status: 200,
      type: 'text/plain; charset=utf-8',
      cache: 'no-store',
      body: 'spaced',
    });
  });

  it('answers 404 in plain text for a missing file and for a folder without index.html', async () => {
    expect(
      await Promise.all(['/nope.js', '/empty', '/empty/'].map((path) => server.get(path))),
    ).toStrictEqual(
      Array.from({ length: 3 }, () => ({
        status: 404,
        type: 'text/plain; charset=utf-8',
        cache: undefined,
        body: 'Not found',
      })),
    );
  });

  it('never serves anything above its root, however the path climbs out', async () => {
    const attempts = [
      '/../outside-secret.txt',
      '/..%2foutside-secret.txt',
      '/%2e%2e/outside-secret.txt',
      '/about/../../outside-secret.txt',
      '/..%2f..%2fetc/passwd',
    ];
    expect(
      (await Promise.all(attempts.map((path) => server.get(path)))).map(({ status, body }) => [
        status,
        body,
      ]),
    ).toStrictEqual(attempts.map(() => [404, 'Not found']));
  });

  it('treats a null byte as a missing file', async () => {
    expect((await server.get('/index.html%00.js')).status).toBe(404);
  });

  it('answers 400 to a malformed escape and keeps serving', async () => {
    const attempts = ['/%', '/%E0%A4%A', '/index.html%zz', '/%c0%af'];
    expect(
      (await Promise.all(attempts.map((path) => server.get(path)))).map(
        ({ status, type, body }) => [status, type, body],
      ),
    ).toStrictEqual(attempts.map(() => [400, 'text/plain; charset=utf-8', 'Bad request']));
    expect((await server.get('/index.html')).status).toBe(200);
  });

  describe('headers', () => {
    const SECURITY = {
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy':
        'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
      'cross-origin-opener-policy': 'same-origin',
      'content-security-policy': BASE_POLICY,
    };
    const securityOf = (headers) =>
      Object.fromEntries(Object.keys(SECURITY).map((name) => [name, headers[name]]));

    it('sends the security headers and the policy with every response: documents, scripts, missing files and bad requests', async () => {
      const paths = ['/index.html', '/app.js', '/nope.js', '/%'];
      const sent = await Promise.all(
        paths.map(async (path) => securityOf(await server.headers(path))),
      );
      expect(sent).toStrictEqual(paths.map(() => SECURITY));
    });

    it('never sends the HTTPS-only Strict-Transport-Security header', async () => {
      expect((await server.headers('/index.html'))['strict-transport-security']).toBeUndefined();
    });

    it('names the language of documents, and only of documents', async () => {
      const languages = await Promise.all(
        ['/index.html', '/about', '/app.js', '/style.css', '/nope.js'].map(
          async (path) => (await server.headers(path))['content-language'],
        ),
      );
      expect(languages).toStrictEqual(['pt-BR', 'pt-BR', undefined, undefined, undefined]);
    });

    it('names the English page as English, like the .htaccess of its folder does', async () => {
      const languages = await Promise.all(
        ['/en/', '/en/index.html', '/'].map(
          async (path) => (await server.headers(path))['content-language'],
        ),
      );
      expect(languages).toStrictEqual(['en-US', 'en-US', 'pt-BR']);
    });
  });

  describe('the English page, as the root .htaccess has it', () => {
    it('serves /en/ and its file', async () => {
      expect(
        (await Promise.all(['/en/', '/en/index.html'].map((path) => server.get(path)))).map(
          ({ status, body }) => [status, body],
        ),
      ).toStrictEqual([
        [200, '<h1>english</h1>'],
        [200, '<h1>english</h1>'],
      ]);
    });

    it.each([
      ['/en', '/en/'],
      ['/?lang=en', '/en/'],
      ['/?lang=EN', '/en/'],
      ['/?lang=en-GB', '/en/'],
      ['/?x=1&lang=en', '/en/'],
    ])('moves %s to %s for good', async (path, location) => {
      expect(await server.moved(path)).toStrictEqual({
        status: 301,
        location,
        policy: BASE_POLICY,
      });
    });

    it.each([['/?lang=pt'], ['/?lang=fr'], ['/?x=1'], ['/about?lang=en'], ['/index.html?lang=en']])(
      'leaves %s where it is',
      async (path) => {
        expect((await server.moved(path)).status).toBe(200);
      },
    );
  });

  it('answers 500 instead of dying when a file exists but cannot be read, and keeps serving', async () => {
    writeFileSync(join(root, 'locked.txt'), 'locked');
    chmodSync(join(root, 'locked.txt'), 0o000);
    expect(await server.get('/locked.txt')).toStrictEqual({
      status: 500,
      type: 'text/plain; charset=utf-8',
      cache: undefined,
      body: 'Server error',
    });
    chmodSync(join(root, 'locked.txt'), 0o644);
    expect((await server.get('/index.html')).status).toBe(200);
  });
});

describe('tools/serve.mjs with its defaults', () => {
  it('serves the real site from source/', async () => {
    const server = await RunningServer.start();
    try {
      const page = await server.get('/');
      const script = await server.get('/js/main.js');
      expect([
        server.banner,
        page.status,
        page.type,
        page.body.startsWith('<!doctype html>'),
        script.type,
      ]).toStrictEqual([
        `serving ${join(PROJECT, 'source')} at http://127.0.0.1:${server.port}/`,
        200,
        'text/html; charset=utf-8',
        true,
        'text/javascript; charset=utf-8',
      ]);
    } finally {
      server.stop();
    }
  });

  it('sends the policy production sends for the real page, with the hash of its inline script', async () => {
    const server = await RunningServer.start();
    try {
      const headers = await server.headers('/');
      expect(headers['content-security-policy']).toBe(
        SiteHeaders.production(readFileSync(join(PROJECT, 'source', 'index.html'), 'utf8'))[
          'Content-Security-Policy'
        ],
      );
    } finally {
      server.stop();
    }
  });
});
