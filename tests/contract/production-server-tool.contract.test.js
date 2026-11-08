import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:http2';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Certificate, ProductionServer } from '../../tools/production-server.mjs';
import { SiteHeaders } from '../../tools/site-headers.mjs';

const PAGE =
  '<!doctype html>\n<html lang="pt-BR"><head><script>document.documentElement.dataset.ready = "1";</script></head><body></body></html>\n';
const ENGLISH = PAGE.replace('pt-BR', 'en-US');
const SCRIPT = 'export const answer = 42;\n';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TIMEOUT_MS = 30_000;

describe('tools/production-server.mjs', () => {
  let folder;
  let server;
  let session;

  /** One request over the shared HTTP/2 session: the status, the headers that matter and the decoded body. */
  const get = (path, acceptEncoding = 'gzip, deflate, br') =>
    new Promise((done, fail) => {
      const request = session.request({ ':path': path, 'accept-encoding': acceptEncoding });
      const chunks = [];
      let headers = {};
      request.on('response', (received) => (headers = received));
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('error', fail);
      request.on('end', () => {
        const raw = Buffer.concat(chunks);
        done({
          status: headers[':status'],
          type: headers['content-type'],
          encoding: headers['content-encoding'],
          cache: headers['cache-control'],
          language: headers['content-language'],
          policy: headers['content-security-policy'],
          body: headers['content-encoding'] === 'br' ? brotliDecompressSync(raw) : raw,
        });
      });
      request.end();
    });

  beforeAll(async () => {
    folder = mkdtempSync(join(tmpdir(), 'production-server-test-'));
    mkdirSync(join(folder, 'en'));
    mkdirSync(join(folder, 'assets', 'brand'), { recursive: true });
    writeFileSync(join(folder, 'index.html'), PAGE);
    writeFileSync(join(folder, 'en', 'index.html'), ENGLISH);
    writeFileSync(join(folder, 'assets', 'main-AbC123.js'), SCRIPT);
    writeFileSync(join(folder, 'assets', 'brand', 'icon-192.png'), PNG);
    server = new ProductionServer(folder);
    session = connect(await server.start(Certificate.create()), { rejectUnauthorized: false });
  }, TIMEOUT_MS);

  afterAll(async () => {
    session?.close();
    await server?.stop();
    rmSync(folder, { recursive: true, force: true });
  });

  it('serves a page over HTTP/2 with brotli and the headers production sends', async () => {
    const page = await get('/');
    expect({ ...page, body: page.body.toString('utf8') }).toStrictEqual({
      status: 200,
      type: 'text/html; charset=utf-8',
      encoding: 'br',
      cache: 'public, max-age=600, stale-while-revalidate=86400',
      language: 'pt-BR',
      policy: SiteHeaders.contentSecurityPolicy(PAGE),
      body: PAGE,
    });
  });

  it('serves the index.html of a folder, in the language of that folder', async () => {
    const english = await get('/en/');
    expect([english.status, english.language, english.body.toString('utf8')]).toStrictEqual([
      200,
      'en-US',
      ENGLISH,
    ]);
  });

  it('keeps a hashed script for a year and a brand image, which keeps its name, for a day', async () => {
    const [script, image] = [
      await get('/assets/main-AbC123.js'),
      await get('/assets/brand/icon-192.png'),
    ];
    expect([
      [script.type, script.encoding, script.cache, script.body.toString('utf8')],
      [image.type, image.encoding, image.cache, image.body.equals(PNG)],
    ]).toStrictEqual([
      ['text/javascript; charset=utf-8', 'br', 'public, max-age=31536000, immutable', SCRIPT],
      ['image/png', undefined, 'public, max-age=86400, stale-while-revalidate=604800', true],
    ]);
  });

  it('sends the bytes as they are to a client that does not accept brotli', async () => {
    const plain = await get('/', 'identity');
    expect([plain.encoding, plain.body.toString('utf8')]).toStrictEqual([undefined, PAGE]);
  });

  it('answers 404 to a file it does not have and to a path that climbs out of its folder', async () => {
    expect([
      (await get('/missing.html')).status,
      (await get('/../../../etc/passwd')).status,
      (await get('/%2e%2e/%2e%2e/etc/passwd')).status,
    ]).toStrictEqual([404, 404, 404]);
  });
});
