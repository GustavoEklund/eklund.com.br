// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { LegalPages } from '../../tools/legal-pages.mjs';
import { NotFoundPages } from '../../tools/not-found-pages.mjs';
import { SiteHeaders } from '../../tools/site-headers.mjs';
import { SiteSource } from '../support/site-source.js';
import { HtaccessHeaders } from './support/htaccess-headers.js';

const HOME = { 'pt-BR': '/', 'en-US': '/en/' };
const SECTIONS = ['status', 'perfil', 'arquitetura', 'carga', 'historico', 'contato'];
const LEGAL = {
  'pt-BR': ['/privacidade/', '/cookies/', '/termos/', '/?preferencias'],
  'en-US': ['/en/privacy/', '/en/cookies/', '/en/terms/', '/en/?preferences'],
};
const REPOSITORY = 'https://github.com/GustavoEklund/eklund.com.br';

const parse = (file) =>
  new DOMParser().parseFromString(
    SiteSource.read(file).replaceAll('rel="stylesheet"', 'rel="stylesheet-not-loaded"'),
    'text/html',
  );
const attribute = (document, selector, name) =>
  [...document.querySelectorAll(selector)].map((element) => element.getAttribute(name));
/** Every ErrorDocument directive of an .htaccess, as [status, target]. */
const errorDocuments = (htaccess) =>
  [...htaccess.matchAll(/^ErrorDocument (\d{3}) (\S+)$/gm)].map(([, status, target]) => [
    status,
    target,
  ]);

describe('tools/not-found-pages.mjs', () => {
  it('lists the page of each language with the page of the other', () => {
    expect(NotFoundPages.PAGES).toStrictEqual([
      { file: '404.html', language: 'pt-BR', counterpart: 'en/404.html' },
      { file: 'en/404.html', language: 'en-US', counterpart: '404.html' },
    ]);
  });

  it('answers with the English page inside an en/ folder, also in the copy of a version, and with the Portuguese one elsewhere', () => {
    expect(
      ['', 'en', 'en/privacy', '1.1.0', '1.1.0/en', 'assets', 'enigma', 'english/en-x'].map(
        (folder) => NotFoundPages.fileFor(folder),
      ),
    ).toStrictEqual([
      '404.html',
      'en/404.html',
      'en/404.html',
      '404.html',
      'en/404.html',
      '404.html',
      '404.html',
      '404.html',
    ]);
  });
});

describe('the .htaccess files and the 404 pages', () => {
  it('name the Portuguese page in the root and the English one in en/, by a local path, so the status stays 404', () => {
    expect([
      errorDocuments(SiteSource.read('.htaccess')),
      errorDocuments(SiteSource.read('en/.htaccess')),
      errorDocuments(SiteSource.read('assets/brand/.htaccess')),
    ]).toStrictEqual([[['404', '/404.html']], [['404', '/en/404.html']], []]);
  });

  it('name files that exist, the ones NotFoundPages says answer in each folder', () => {
    expect(
      [
        ['', SiteSource.read('.htaccess')],
        ['en', SiteSource.read('en/.htaccess')],
      ].map(([folder, htaccess]) => [
        errorDocuments(htaccess)[0][1],
        `/${NotFoundPages.fileFor(folder)}`,
        SiteSource.exists(errorDocuments(htaccess)[0][1].slice(1)),
      ]),
    ).toStrictEqual([
      ['/404.html', '/404.html', true],
      ['/en/404.html', '/en/404.html', true],
    ]);
  });

  it('keep the 404 page ten minutes with no stale copy, with `always` so the header goes out with the error, and never twice', () => {
    const htaccess = SiteSource.read('.htaccess');
    const block = /<FilesMatch "\^404\\\.html\$">([\s\S]*?)<\/FilesMatch>/.exec(htaccess)[1];
    expect([
      block
        .trim()
        .split('\n')
        .map((line) => line.trim()),
      HtaccessHeaders.forFilesMatching(htaccess, '^404\\.html$'),
      SiteHeaders.cacheControl('/404.html'),
      SiteHeaders.cacheControl('/en/404.html'),
    ]).toStrictEqual([
      ['Header unset Cache-Control', 'Header always set Cache-Control "public, max-age=600"'],
      { 'Cache-Control': 'public, max-age=600' },
      'public, max-age=600',
      'public, max-age=600',
    ]);
  });

  it('stay out of the sitemap', () => {
    expect(SiteSource.read('sitemap.xml').includes('404')).toBe(false);
  });
});

describe('the 404 pages', () => {
  describe.each(NotFoundPages.PAGES)('$file', ({ file, language }) => {
    const document = parse(file);
    const home = HOME[language];

    it('carries the inline script of the head of index.html byte for byte, so the one hash of the policy allows it', () => {
      expect([
        LegalPages.headScript(SiteSource.read(file)),
        SiteHeaders.production(SiteSource.read(file)),
      ]).toStrictEqual([
        LegalPages.headScript(SiteSource.read('index.html')),
        SiteHeaders.production(SiteSource.read('index.html')),
      ]);
    });

    it('loads the stylesheet of the legal pages and no script but that one, measuring nothing', () => {
      expect([
        attribute(document, 'link[rel=stylesheet-not-loaded]', 'href'),
        document.querySelectorAll('script').length,
      ]).toStrictEqual([['/css/legal.css'], 1]);
    });

    it('asks not to be indexed, and names no canonical or alternate address', () => {
      expect([
        attribute(document, 'meta[name=robots]', 'content'),
        document.querySelectorAll('link[rel=canonical], link[rel=alternate]').length,
      ]).toStrictEqual([['noindex'], 0]);
    });

    it('declares its language where the document and the server say it', () => {
      expect([
        document.documentElement.getAttribute('lang'),
        SiteHeaders.documentLanguage(`/${file}`),
      ]).toStrictEqual([language, language]);
    });

    it('names every file and page from the root of the site, because it is served at any depth', () => {
      const addresses = attribute(document, '[href], [src]', 'href').concat(
        attribute(document, '[src]', 'src'),
      );
      expect(
        addresses.filter(
          (address) =>
            address !== null &&
            !address.startsWith('/') &&
            !address.startsWith('https://') &&
            !address.startsWith('mailto:'),
        ),
      ).toStrictEqual([]);
    });

    it('links the home page, each of its sections, the source code, and the home page of the other language', () => {
      const other = language === 'pt-BR' ? HOME['en-US'] : HOME['pt-BR'];
      expect([
        attribute(document, '.logo', 'href'),
        attribute(document, 'main a', 'href'),
      ]).toStrictEqual([
        [home],
        [
          home,
          ...SECTIONS.map((section) => `${home}#${section}`),
          REPOSITORY,
          'mailto:gustavo@eklund.com.br',
          other,
        ],
      ]);
    });

    it('links sections the home page has', () => {
      const ids = new Set(attribute(SiteSource.html(), 'section[id]', 'id'));
      expect(SECTIONS.filter((section) => !ids.has(section))).toStrictEqual([]);
    });

    it('lists the legal pages of its language and the privacy preferences in the footer', () => {
      expect(attribute(document, '.legal-footer a', 'href')).toStrictEqual(LEGAL[language]);
    });

    it('has one heading of the first level, and the title is that heading and the name of the site', () => {
      const headings = [...document.querySelectorAll('h1')].map((heading) => heading.textContent);
      expect([headings.length, document.title]).toStrictEqual([
        1,
        `${headings[0]} | eklund.com.br`,
      ]);
    });

    it('writes no em dash and no en dash in its text, as the voice of the site asks', () => {
      expect(document.body.textContent.match(/[–—]/g)).toBeNull();
    });
  });
});
