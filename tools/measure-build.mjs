// What the production build saves a visitor: the same page loaded from source/ (the site as it is written, 60 modules
// and 20 stylesheets, the way it was deployed before the build) and from dist/ (the build), cold cache each time, in a few
// network and CPU conditions, with the files and the bytes they cost and the times the page reaches its marks.
// Both folders are served by the same server: HTTP/2 over TLS (as the hosting does, so a hundred requests cost what they
// cost there and not what they would over six HTTP/1.1 connections) with brotli, from a throwaway certificate.
// usage: node tools/measure-build.mjs [--runs 7] [--json FILE]      (build first: pnpm run build; needs openssl)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { createSecureServer } from 'node:http2';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { SiteHeaders } from './site-headers.mjs';

const PROJECT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOFTWARE_GL = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.webmanifest', '.ico']);

/** What a visitor's connection and phone are like. Throughput in kilobits per second, as DevTools and Lighthouse state it. */
const SCENARIOS = [
  { name: 'desktop, no throttling', device: 'desktop', network: null, cpu: 1 },
  {
    name: 'desktop, Fast 4G (9 Mbit/s, 60 ms)',
    device: 'desktop',
    network: { down: 9000, up: 1500, rtt: 60 },
    cpu: 1,
  },
  {
    name: 'phone, Slow 4G (1.6 Mbit/s, 150 ms) and a CPU 4x slower',
    device: 'phone',
    network: { down: 1600, up: 750, rtt: 150 },
    cpu: 4,
  },
];
const DEVICES = {
  desktop: {
    viewport: { width: 1280, height: 800 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  },
  phone: {
    viewport: { width: 412, height: 839 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2.625,
  },
};

/** A certificate for 127.0.0.1 that lives as long as the run. */
class Certificate {
  static create() {
    const folder = mkdtempSync(join(tmpdir(), 'measure-build-'));
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
    const certificate = {
      key: readFileSync(join(folder, 'key.pem')),
      cert: readFileSync(join(folder, 'cert.pem')),
    };
    rmSync(folder, { recursive: true, force: true });
    return certificate;
  }
}

/** One folder served over HTTP/2 with brotli. The compressed copies are made once, so the run does not pay for them. */
class SiteServer {
  #root;
  #cache = new Map();
  #server;

  constructor(root) {
    this.#root = resolve(PROJECT, root);
  }

  async start(certificate) {
    this.#server = createSecureServer({ ...certificate, allowHTTP1: false });
    this.#server.on('request', (request, response) => this.#answer(request, response));
    await new Promise((done) => this.#server.listen(0, '127.0.0.1', done));
    return `https://127.0.0.1:${this.#server.address().port}`;
  }

  stop() {
    this.#server.close();
    this.#server.closeAllConnections?.();
  }

  #answer(request, response) {
    const pathname = decodeURIComponent(new URL(request.url, 'https://x').pathname);
    let file = join(this.#root, normalize(pathname));
    try {
      if (statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!statSync(file).isFile()) throw new Error('not a file');
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    const extension = extname(file);
    const wantsBrotli =
      /\bbr\b/.test(request.headers['accept-encoding'] ?? '') && COMPRESSIBLE.has(extension);
    const key = `${file}|${wantsBrotli}`;
    if (!this.#cache.has(key)) {
      const body = readFileSync(file);
      this.#cache.set(key, {
        body: wantsBrotli
          ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } })
          : body,
        html: extension === '.html' ? body.toString('utf8') : '',
      });
    }
    const { body, html } = this.#cache.get(key);
    response.writeHead(200, {
      'content-type': MIME[extension] ?? 'application/octet-stream',
      'cache-control': 'no-store',
      ...(wantsBrotli ? { 'content-encoding': 'br', vary: 'Accept-Encoding' } : {}),
      ...SiteHeaders.development({ html, isDocument: extension === '.html', pathname }),
    });
    response.end(body);
  }
}

/** One cold load of the home page, and what it cost. */
class PageLoad {
  static async measure(browser, origin, scenario) {
    const context = await browser.newContext({
      ...DEVICES[scenario.device],
      ignoreHTTPSErrors: true,
      locale: 'pt-BR',
      serviceWorkers: 'block',
    });
    try {
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__lcp = 0;
        window.__blocking = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) window.__lcp = entry.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            window.__blocking += Math.max(0, entry.duration - 50);
        }).observe({ type: 'longtask', buffered: true });
      });
      const session = await context.newCDPSession(page);
      if (scenario.network)
        await session.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: scenario.network.rtt,
          downloadThroughput: (scenario.network.down * 1000) / 8,
          uploadThroughput: (scenario.network.up * 1000) / 8,
        });
      if (scenario.cpu > 1)
        await session.send('Emulation.setCPUThrottlingRate', { rate: scenario.cpu });
      await page.goto(`${origin}/`, { waitUntil: 'load', timeout: 120_000 });
      await page.waitForFunction(
        () =>
          document.documentElement.classList.contains('fonts-ready') && window.eklund !== undefined,
        null,
        { timeout: 120_000 },
      );
      await page.waitForTimeout(1500); // the last largest paint
      return await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0];
        const resources = performance.getEntriesByType('resource').map((entry) => ({
          type:
            entry.initiatorType === 'img'
              ? 'image'
              : /\.woff2/.test(entry.name)
                ? 'font'
                : /\.css(\?|$)/.test(entry.name)
                  ? 'css'
                  : /\.js(\?|$)/.test(entry.name)
                    ? 'js'
                    : 'other',
          wire: entry.encodedBodySize,
          raw: entry.decodedBodySize,
        }));
        const paint = performance.getEntriesByName('first-contentful-paint')[0];
        const mark = (name) => performance.getEntriesByName(name, 'mark')[0]?.startTime ?? null;
        return {
          resources: [
            { type: 'html', wire: navigation.encodedBodySize, raw: navigation.decodedBodySize },
            ...resources,
          ],
          fcp: paint?.startTime ?? null,
          lcp: window.__lcp,
          ready: mark('app:ready'),
          load: navigation.loadEventEnd,
          blocking: window.__blocking,
        };
      });
    } finally {
      await context.close();
    }
  }
}

const median = (values) => {
  const sorted = values.filter((value) => value !== null).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};
const kilobytes = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;
const milliseconds = (value) => (value === null ? 'n/a' : `${Math.round(value)} ms`);
const change = (before, after) =>
  before
    ? `${after <= before ? '-' : '+'}${Math.abs(Math.round(((after - before) / before) * 100))}%`
    : '';

class Report {
  /** The first load as a count of requests and bytes, by kind of file. */
  static #cost(loads) {
    const sums = {};
    for (const { type, wire, raw } of loads[0].resources) {
      sums[type] ??= { files: 0, wire: 0, raw: 0 };
      sums[type].files += 1;
      sums[type].wire += wire;
      sums[type].raw += raw;
    }
    return sums;
  }

  static print(results, runs) {
    const sizes = results[0];
    console.log(`\nWhat is downloaded to show the home page, cold cache (brotli over HTTP/2):\n`);
    const kinds = ['html', 'css', 'js', 'font', 'image', 'other'];
    console.log('kind      source files / on the wire / raw       dist files / on the wire / raw');
    const total = (cost) =>
      Object.values(cost).reduce(
        (sum, one) => ({
          files: sum.files + one.files,
          wire: sum.wire + one.wire,
          raw: sum.raw + one.raw,
        }),
        { files: 0, wire: 0, raw: 0 },
      );
    const source = Report.#cost(sizes.source.loads);
    const dist = Report.#cost(sizes.dist.loads);
    const line = (cost) =>
      cost
        ? `${String(cost.files).padStart(3)} / ${kilobytes(cost.wire).padStart(9)} / ${kilobytes(cost.raw).padStart(9)}`
        : '  0 /       0.0 kB /       0.0 kB';
    for (const kind of kinds)
      console.log(`${kind.padEnd(9)} ${line(source[kind])}        ${line(dist[kind])}`);
    const a = total(source);
    const b = total(dist);
    console.log(`${'total'.padEnd(9)} ${line(a)}        ${line(b)}`);
    console.log(
      `\nrequests ${a.files} -> ${b.files} (${change(a.files, b.files)}), on the wire ${kilobytes(a.wire)} -> ${kilobytes(b.wire)} (${change(a.wire, b.wire)}), raw ${kilobytes(a.raw)} -> ${kilobytes(b.raw)} (${change(a.raw, b.raw)})`,
    );
    console.log(`\nTimes, median of ${runs} cold loads:\n`);
    for (const result of results) {
      console.log(result.scenario);
      for (const [label, key] of [
        ['first contentful paint', 'fcp'],
        ['largest contentful paint', 'lcp'],
        ['app ready (all scripts run)', 'ready'],
        ['load event', 'load'],
        ['blocking time', 'blocking'],
      ]) {
        const before = median(result.source.loads.map((load) => load[key]));
        const after = median(result.dist.loads.map((load) => load[key]));
        console.log(
          `  ${label.padEnd(28)} ${milliseconds(before).padStart(8)} -> ${milliseconds(after).padStart(8)}  ${change(before, after)}`,
        );
      }
    }
  }
}

const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
};
const runs = Number(argument('runs', 7));
const certificate = Certificate.create();
const servers = { source: new SiteServer('source'), dist: new SiteServer('dist') };
const origins = {
  source: await servers.source.start(certificate),
  dist: await servers.dist.start(certificate),
};
const browser = await chromium.launch({ args: [...SOFTWARE_GL, '--ignore-certificate-errors'] });
try {
  const results = [];
  for (const scenario of SCENARIOS) {
    const result = { scenario: scenario.name, source: { loads: [] }, dist: { loads: [] } };
    for (let run = 0; run < runs; run++)
      for (const tree of run % 2 ? ['dist', 'source'] : ['source', 'dist'])
        // alternate who goes first, so neither always meets a warm machine
        result[tree].loads.push(await PageLoad.measure(browser, origins[tree], scenario));
    results.push(result);
    console.log(`measured: ${scenario.name}`);
  }
  Report.print(results, runs);
  const file = argument('json', null);
  if (file) writeFileSync(file, JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  servers.source.stop();
  servers.dist.stop();
}
