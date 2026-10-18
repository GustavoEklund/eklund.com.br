// Checks the site against the public filter lists that uBlock Origin and other blockers ship with.
// 1. Network filters: every file the page can request, as https://eklund.com.br/<path>, must not match a rule.
// 2. Cosmetic filters: no element of the live page may be hidden by a generic element-hiding rule (pt-BR and en-US).
// Lists are cached in reports/adblock for a day. usage: node tools/adblock-check.mjs [--refresh]   (needs network the first time)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FiltersEngine, Request } from '@ghostery/adblocker';
import { chromium } from 'playwright';

const PROJECT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE = join(PROJECT, 'source');
const CACHE = join(PROJECT, 'reports', 'adblock');
const ORIGIN = 'https://eklund.com.br/';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const UBO = 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters';
const LISTS = {
  easylist: 'https://easylist.to/easylist/easylist.txt',
  easyprivacy: 'https://easylist.to/easylist/easyprivacy.txt',
  'ubo-filters': `${UBO}/filters.txt`,
  'ubo-privacy': `${UBO}/privacy.txt`,
  'ubo-badware': `${UBO}/badware.txt`,
  'ubo-unbreak': `${UBO}/unbreak.txt`,
};
const SOFTWARE_GL = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

class FilterLists {
  static async load(refresh) {
    mkdirSync(CACHE, { recursive: true });
    const texts = [];
    for (const [name, url] of Object.entries(LISTS)) {
      const path = join(CACHE, `${name}.txt`);
      const fresh = existsSync(path) && Date.now() - statSync(path).mtimeMs < CACHE_MAX_AGE_MS;
      if (refresh || !fresh) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${name}: HTTP ${response.status} for ${url}`);
        writeFileSync(path, await response.text());
      }
      texts.push(readFileSync(path, 'utf8'));
    }
    return FiltersEngine.parse(texts.join('\n'));
  }
}

class NetworkAudit {
  #engine;

  constructor(engine) {
    this.#engine = engine;
  }

  /** [path, rule] for every requestable file a rule would block. */
  blocked() {
    return NetworkAudit.#requestable().flatMap(({ path, type }) => {
      const { match, filter } = this.#engine.match(
        Request.fromRawDetails({ url: `${ORIGIN}${path}`, sourceUrl: ORIGIN, type }),
      );
      return match ? [[path, String(filter)]] : [];
    });
  }

  static #requestable() {
    const walk = (directory) =>
      readdirSync(join(SOURCE, directory))
        .sort()
        .flatMap((name) => {
          const path = join(directory, name);
          return statSync(join(SOURCE, path)).isDirectory() ? walk(path) : [path];
        });
    const typeOf = (path) =>
      path.endsWith('.js')
        ? 'script'
        : path.endsWith('.css')
          ? 'stylesheet'
          : /\.(png|jpe?g|webp|svg|ico)$/.test(path)
            ? 'image'
            : 'other';
    return ['index.html', ...walk('js'), ...walk('css'), ...walk('assets')].map((path) => ({
      path,
      type: path === 'index.html' ? 'main_frame' : typeOf(path),
    }));
  }
}

class CosmeticAudit {
  #engine;

  constructor(engine) {
    this.#engine = engine;
  }

  /** [language, selector, element] for every element of the page that a generic hiding rule matches. */
  async hidden() {
    const port = await CosmeticAudit.#freePort();
    const server = spawn(process.execPath, [
      join(PROJECT, 'tools', 'serve.mjs'),
      '--port',
      String(port),
    ]);
    await new Promise((done) => server.stdout.once('data', done));
    const browser = await chromium.launch({ args: SOFTWARE_GL });
    try {
      const found = [];
      for (const [language, path] of [
        ['pt', '/'],
        ['en', '/en/'],
      ]) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await page.goto(`http://127.0.0.1:${port}${path}`);
        await page.waitForTimeout(2000);
        const dom = await page.evaluate(() => ({
          classes: [
            ...new Set(
              [...document.querySelectorAll('[class]')].flatMap((element) => [
                ...element.classList,
              ]),
            ),
          ],
          ids: [...document.querySelectorAll('[id]')].map((element) => element.id),
          hrefs: [
            ...new Set(
              [...document.querySelectorAll('[href]')].map((element) =>
                element.getAttribute('href'),
              ),
            ),
          ],
        }));
        const { styles = '' } = this.#engine.getCosmeticsFilters({
          url: ORIGIN,
          hostname: 'eklund.com.br',
          domain: 'eklund.com.br',
          ...dom,
          getBaseRules: true,
          getInjectionRules: false,
          getExtendedRules: false,
          getRulesFromDOM: true,
          getRulesFromHostname: true,
        });
        const selectors = [...styles.matchAll(/([^{}]+)\{[^}]*\}/g)].flatMap(([, list]) =>
          list
            .split(',')
            .map((selector) => selector.trim())
            .filter(Boolean),
        );
        const hits = await page.evaluate(
          (list) =>
            list.flatMap((selector) => {
              try {
                return [...document.querySelectorAll(selector)].map((element) => [
                  selector,
                  `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`,
                ]);
              } catch {
                return [];
              }
            }),
          selectors,
        );
        found.push(...hits.map(([selector, element]) => [language, selector, element]));
        await page.close();
      }
      return found;
    } finally {
      await browser.close();
      server.kill('SIGTERM');
    }
  }

  static #freePort() {
    return new Promise((done) => {
      const probe = createServer().listen(0, '127.0.0.1', () => {
        const { port } = probe.address();
        probe.close(() => done(port));
      });
    });
  }
}

const engine = await FilterLists.load(process.argv.includes('--refresh'));
const blocked = new NetworkAudit(engine).blocked();
const hidden = await new CosmeticAudit(engine).hidden();
console.log(`network filters: ${blocked.length} blocked`);
for (const [path, rule] of blocked) console.log(`  ${path}  <=  ${rule}`);
console.log(`cosmetic filters: ${hidden.length} elements hidden`);
for (const [language, selector, element] of hidden)
  console.log(`  [${language}] ${element}  <=  ${selector}`);
process.exit(blocked.length || hidden.length ? 1 : 0);
