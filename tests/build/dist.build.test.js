// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SiteHeaders } from '../../tools/site-headers.mjs';
import { HtaccessHeaders } from '../contract/support/htaccess-headers.js';
import { BuiltSite } from '../support/built-site.js';
import { SiteSource } from '../support/site-source.js';

/** What the files of one page may weigh once compressed, with a margin over what they weigh today so that growth is a decision. */
const BUDGET_GZIP_BYTES = {
  'main js': 70_000,
  'main css': 18_500,
  'index.html': 14_500,
  'en/index.html': 14_500,
};
const HASHED_ASSETS = [
  'anhanguera-educacional-logo-200-x-200-HASH.jpg',
  'apple-touch-icon-HASH.png',
  'bricolage-grotesque-latin-HASH.woff2',
  'esatto-logo-200-x-200-HASH.jpg',
  'fatec-taubate-logo-200-x-200-HASH.jpg',
  'favicon-HASH.ico',
  'g8-finance-logo-200-x-200-HASH.jpg',
  'icon-HASH.svg',
  'icons-HASH.svg',
  'instrument-serif-italic-latin-HASH.woff2',
  'jetbrains-mono-greek-HASH.woff2',
  'jetbrains-mono-latin-HASH.woff2',
  'main-HASH.css',
  'main-HASH.js',
  'okto-payments-logo-200-x-200-HASH.jpg',
  'pix-engine.worker-HASH.js',
  'site-HASH.webmanifest',
];
const PAGES = [
  ['index.html', 'index.html'],
  ['en/index.html', 'en/index.html'],
];

const parse = (html) =>
  new DOMParser().parseFromString(
    html.replaceAll('rel="stylesheet"', 'rel="stylesheet-not-loaded"'),
    'text/html',
  );
/** An address into the site with its hash removed from the name: /assets/main-AbCdEfGh.js and assets/main.js are the same file. */
const unhashed = (address) =>
  address.replace(/^\//, '').replace(/-[\w-]{8}(\.[a-z0-9]+)(#.*)?$/, '$1$2');
/** What an element is, without the addresses the build rewrites: its tag and its attributes, those that point at assets by their name. */
const signature = (element) => [
  element.localName,
  ...[...element.attributes]
    .filter((attribute) => attribute.name !== 'crossorigin')
    .map((attribute) =>
      ['href', 'src'].includes(attribute.name) && /(^|\/)assets\//.test(attribute.value)
        ? `${attribute.name}=${unhashed(attribute.value)}`
        : `${attribute.name}=${element.getAttribute('name') === 'viewport' ? attribute.value.replace(/,\s+/g, ',') : attribute.value}`,
    ),
];
const inlineScript = (html) =>
  [...html.matchAll(/<script(?![^>]*\s(?:src|type)=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    ([, code]) => code,
  );

describe('the production build', () => {
  let site;
  beforeAll(() => {
    site = BuiltSite.build();
  }, 120_000);
  afterAll(() => site?.remove());

  describe('what is in it', () => {
    it('is the two pages, the hashed assets, and the few files that keep their name', () => {
      expect([
        site.list(),
        site.list('en'),
        site.list('.well-known'),
        site.list('assets/brand'),
      ]).toStrictEqual([
        [
          '.htaccess',
          '.well-known',
          'assets',
          'en',
          'favicon.ico',
          'index.html',
          'robots.txt',
          'sitemap.xml',
        ],
        ['.htaccess', 'index.html'],
        ['security.txt'],
        ['.htaccess', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'social-card.png'],
      ]);
    });

    it('names every other asset with a hash of its content, so that each can be kept for a year', () => {
      expect(
        site
          .hashedAssets()
          .map((name) => name.replace(/-[\w-]{8}(\.[a-z0-9]+)$/, '-HASH$1'))
          .sort(), // after the hash is replaced: sorted with it, the order would follow the hash characters
      ).toStrictEqual(HASHED_ASSETS);
    });

    it('carries nothing of the source: no source map, no module folder, no tests, no tools', () => {
      expect(
        site.files().filter((path) => /\.map$|^js\/|^css\/|^fonts\/|^tests?\/|^tools\//.test(path)),
      ).toStrictEqual([]);
    });

    it('copies the files nothing links to byte for byte', () => {
      const copied = [
        '.htaccess',
        'en/.htaccess',
        'robots.txt',
        'sitemap.xml',
        'favicon.ico',
        '.well-known/security.txt',
      ].concat(
        [
          '.htaccess',
          'icon-192.png',
          'icon-512.png',
          'icon-maskable-512.png',
          'social-card.png',
        ].map((name) => `assets/brand/${name}`),
      );
      expect(
        copied.filter((path) => !site.bytes(path).equals(SiteSource.bytes(path))),
      ).toStrictEqual([]);
    });

    it('is the same every time: building again gives the same files with the same bytes', () => {
      const again = BuiltSite.build();
      try {
        expect(again.fingerprint()).toBe(site.fingerprint());
      } finally {
        again.remove();
      }
    });
  });

  describe.each(PAGES)('the page %s', (path) => {
    let built, written;
    beforeAll(() => {
      built = parse(site.read(path));
      written = parse(SiteSource.read(path));
    });

    it('loads one stylesheet and one script from assets/, preloads the three fonts of the first screen and nothing else', () => {
      const hrefs = (selector, attribute) =>
        [...built.querySelectorAll(selector)].map((element) => element.getAttribute(attribute));
      expect({
        stylesheets: hrefs('link[rel=stylesheet-not-loaded]', 'href').map(unhashed),
        scripts: hrefs('script[type=module][src]', 'src').map(unhashed),
        modulePreloads: hrefs('link[rel=modulepreload]', 'href'),
        preloads: hrefs('link[rel=preload]', 'href').map(unhashed),
      }).toStrictEqual({
        stylesheets: ['assets/main.css'],
        scripts: ['assets/main.js'],
        modulePreloads: [],
        preloads: [
          'assets/bricolage-grotesque-latin.woff2',
          'assets/instrument-serif-italic-latin.woff2',
          'assets/jetbrains-mono-latin.woff2',
        ],
      });
    });

    it('points at files that exist: every address into the site resolves to a file of the build', () => {
      const addresses = [...built.querySelectorAll('[href], [src]')]
        .map((element) => element.getAttribute('href') ?? element.getAttribute('src'))
        .filter((address) => address.startsWith('/') && !address.startsWith('//'))
        .map((address) => address.split(/[?#]/)[0])
        .filter((address) => !['/', '/en/'].includes(address));
      expect(addresses.filter((address) => !site.exists(address.slice(1)))).toStrictEqual([]);
    });

    it('is the page as it is written: the same elements with the same attributes and the same text, in the same order', () => {
      const body = (document) =>
        [...document.body.querySelectorAll('*')].filter(
          (element) => element.localName !== 'script',
        );
      expect(body(built).map(signature)).toStrictEqual(body(written).map(signature));
      expect(built.body.textContent.replace(/\s+/g, ' ').trim()).toBe(
        written.body.textContent.replace(/\s+/g, ' ').trim(),
      );
    });

    it('keeps what the head says: title, descriptions, social tags, canonical and alternate addresses', () => {
      const head = (document) =>
        [...document.head.querySelectorAll('meta, link[rel=canonical], link[rel=alternate]')].map(
          signature,
        );
      expect([built.title, head(built)]).toStrictEqual([written.title, head(written)]);
    });

    it('carries the same structured data, as the same document', () => {
      const data = (document) =>
        [...document.querySelectorAll('script[type="application/ld+json"]')].map((script) =>
          JSON.parse(script.textContent),
        );
      expect(data(built)).toStrictEqual(data(written));
    });

    it('carries the inline script of the head byte for byte, because the Content-Security-Policy allows it by its hash', () => {
      expect(inlineScript(site.read(path))).toStrictEqual(inlineScript(SiteSource.read(path)));
    });
  });

  describe('the headers the files go with', () => {
    it.each(PAGES)('allow the inline script of %s by the hash its page has', (path) => {
      expect(HtaccessHeaders.global(site.read('.htaccess'))).toStrictEqual(
        SiteHeaders.production(site.read(path)),
      );
    });

    it('say the English page is English, in the folder of the English page', () => {
      expect(
        HtaccessHeaders.forFilesMatching(site.read('en/.htaccess'), '\\.html?$')[
          'Content-Language'
        ],
      ).toBe('en-US');
    });
  });

  describe('the stylesheet', () => {
    let css;
    beforeAll(() => {
      css = site.read(`assets/${site.hashedAssets().find((name) => /^main-.*\.css$/.test(name))}`);
    });

    it('keeps the order of its cascade layers: they open in the order the first stylesheet of the source declares them', () => {
      const opened = [];
      for (const [, layer] of css.matchAll(/@layer ([\w-]+)\s*[{,;]/g))
        if (!opened.includes(layer)) opened.push(layer);
      expect(opened).toStrictEqual(['reset', 'base', 'layout', 'components', 'effects']);
    });

    it.each([
      'light-dark(',
      'oklch(',
      'color-mix(',
      '@container ',
      '@starting-style',
      'animation-timeline',
      '@font-face',
      'font-display:swap',
      'content-visibility:auto',
      'contain-intrinsic-size',
      '@media (width>=',
    ])('keeps %s as the browsers it is written for read it', (feature) => {
      expect(css.includes(feature)).toBe(true);
    });

    it('names its fonts by files that exist, and puts no font or image inside itself', () => {
      const fonts = [...css.matchAll(/url\(([^)]+\.woff2)\)/g)].map(([, address]) =>
        address.replace(/["']/g, ''),
      );
      expect({
        fonts: fonts.filter((address) => !site.exists(address.replace(/^\//, ''))).length,
        count: fonts.length > 0,
        inlined: /url\(["']?data:(font|application\/font)/.test(css),
      }).toStrictEqual({ fonts: 0, count: true, inlined: false });
    });
  });

  describe('the script', () => {
    let js, name;
    beforeAll(() => {
      name = site.hashedAssets().find((entry) => /^main-.*\.js$/.test(entry));
      js = site.read(`assets/${name}`);
    });

    it('is minified, and carries no source map: it takes at most 60% of the bytes of the modules it is made of', () => {
      const modules = SiteSource.files('js')
        .filter((file) => file.endsWith('.js') && !file.endsWith('.worker.js'))
        .reduce((sum, file) => sum + SiteSource.bytes(file).length, 0);
      expect([
        Buffer.byteLength(js) / modules <= 0.6,
        js.includes('sourceMappingURL'),
      ]).toStrictEqual([true, false]);
    });

    it('starts the load test engine from the worker file of the build, which exists', () => {
      const worker = [...js.matchAll(/new Worker\(new URL\(`?"?([^`"',]+)/g)].map(
        ([, address]) => address,
      );
      expect(
        worker.map((address) => [
          /^\/assets\/pix-engine\.worker-[\w-]{8}\.js$/.test(address),
          site.exists(address.slice(1)),
        ]),
      ).toStrictEqual([[true, true]]);
    });
  });

  describe('the web manifest', () => {
    it('is the manifest as it is written, as data, with each icon named from the root by the address it has in the build, and every icon exists', () => {
      const name = site.hashedAssets().find((entry) => /^site-.*\.webmanifest$/.test(entry));
      const built = JSON.parse(site.read(`assets/${name}`));
      const written = JSON.parse(SiteSource.read('site.webmanifest'));
      const withoutAddresses = (manifest) => ({
        ...manifest,
        icons: manifest.icons.map(({ src: _src, ...rest }) => rest),
      });
      expect(withoutAddresses(built)).toStrictEqual(withoutAddresses(written));
      expect(
        built.icons.map((icon) => [
          unhashed(icon.src),
          icon.src.startsWith('/'),
          site.exists(icon.src.replace(/^\//, '')),
        ]),
      ).toStrictEqual([
        ['assets/icon.svg', true, true],
        ['assets/brand/icon-192.png', true, true],
        ['assets/brand/icon-512.png', true, true],
        ['assets/brand/icon-maskable-512.png', true, true],
      ]);
    });
  });

  describe('the weight', () => {
    it('stays inside the budget of each file, compressed', () => {
      const main = (extension) =>
        `assets/${site.hashedAssets().find((entry) => new RegExp(`^main-.*\\.${extension}$`).test(entry))}`;
      const weights = {
        'main js': site.gzipBytes(main('js')),
        'main css': site.gzipBytes(main('css')),
        'index.html': site.gzipBytes('index.html'),
        'en/index.html': site.gzipBytes('en/index.html'),
      };
      expect(
        Object.entries(weights)
          .filter(([file, bytes]) => bytes > BUDGET_GZIP_BYTES[file])
          .map(([file, bytes]) => `${file}: ${bytes} bytes, budget ${BUDGET_GZIP_BYTES[file]}`),
      ).toStrictEqual([]);
    });
  });
});
