// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { LegalPages } from '../../tools/legal-pages.mjs';
import { SiteHeaders } from '../../tools/site-headers.mjs';
import { SiteSource } from '../support/site-source.js';

const ORIGIN = 'https://eklund.com.br';
/** The three pages of each language, in the order their footer lists them. */
const SETS = {
  'pt-BR': ['privacidade/index.html', 'cookies/index.html', 'termos/index.html'],
  'en-US': ['en/privacy/index.html', 'en/cookies/index.html', 'en/terms/index.html'],
};
const HOME = { 'pt-BR': '/', 'en-US': '/en/' };
/** The address of the privacy preferences on the home page of each language, which the footer links after the three pages. */
const PREFERENCES = { 'pt-BR': '/?preferencias', 'en-US': '/en/?preferences' };
const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const parse = (file) =>
  new DOMParser().parseFromString(
    SiteSource.read(file).replaceAll('rel="stylesheet"', 'rel="stylesheet-not-loaded"'),
    'text/html',
  );
const attribute = (document, selector, name) =>
  [...document.querySelectorAll(selector)].map((element) => element.getAttribute(name));
/** The date at the top of a page, as YYYY-MM-DD, from "Última atualização: 9 de novembro de 2026" or "Last updated: November 9, 2026". */
const updated = (document) => {
  const text = document.querySelector('.updated').textContent;
  const portuguese = /(\d{1,2}) de (\p{L}+) de (\d{4})$/u.exec(text);
  const [day, month, year] = portuguese
    ? [portuguese[1], MONTHS.indexOf(portuguese[2]) + 1, portuguese[3]]
    : (([, name, number, at]) => [number, new Date(`${name} 1, 2000`).getMonth() + 1, at])(
        /([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(text),
      );
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

describe('tools/legal-pages.mjs', () => {
  it('lists the six pages, three in each language, each with the same page in the other language', () => {
    expect(
      LegalPages.PAGES.map(({ file, language, counterpart }) => [
        LegalPages.address(file),
        language,
        LegalPages.address(counterpart),
      ]),
    ).toStrictEqual([
      ['/privacidade/', 'pt-BR', '/en/privacy/'],
      ['/cookies/', 'pt-BR', '/en/cookies/'],
      ['/termos/', 'pt-BR', '/en/terms/'],
      ['/en/privacy/', 'en-US', '/privacidade/'],
      ['/en/cookies/', 'en-US', '/cookies/'],
      ['/en/terms/', 'en-US', '/termos/'],
    ]);
  });

  it('reads the first classic inline script and leaves data blocks and scripts with a source out', () => {
    const html =
      '<script type="application/ld+json">{}</script><script src="a.js"></script><script>one()</script><script>two()</script>';
    expect([LegalPages.headScript(html), LegalPages.headScript('<p>no script</p>')]).toStrictEqual([
      'one()',
      null,
    ]);
  });

  it('replaces only the code of that script, dollar signs included', () => {
    expect(LegalPages.withHeadScript('<head><script>old()</script></head>', "'$1' + $&")).toBe(
      "<head><script>'$1' + $&</script></head>",
    );
  });

  it('refuses a page without an inline script', () => {
    expect(() => LegalPages.withHeadScript('<p>no script</p>', 'x')).toThrow(
      'the page has no inline script',
    );
  });
});

describe('the legal pages', () => {
  describe.each(LegalPages.PAGES)('$file', ({ file, language, counterpart }) => {
    const document = parse(file);
    const own = LegalPages.address(file);
    const other = LegalPages.address(counterpart);
    const portuguese = language === 'pt-BR' ? own : other;
    const english = language === 'pt-BR' ? other : own;

    it('carries the inline script of the head of index.html byte for byte, so the one hash of the policy allows it', () => {
      expect(LegalPages.headScript(SiteSource.read(file))).toBe(
        LegalPages.headScript(SiteSource.read('index.html')),
      );
    });

    it('loads one stylesheet, its own, and no script but that one', () => {
      expect([
        attribute(document, 'link[rel=stylesheet-not-loaded]', 'href'),
        document.querySelectorAll('script').length,
        SiteHeaders.inlineScriptSources(SiteSource.read(file)),
      ]).toStrictEqual([
        ['/css/legal.css'],
        1,
        SiteHeaders.inlineScriptSources(SiteSource.read('index.html')),
      ]);
    });

    it('declares its language where the document, the server and the switcher say it', () => {
      expect([
        document.documentElement.getAttribute('lang'),
        SiteHeaders.documentLanguage(own),
        attribute(document, '.locale-switcher a[aria-current="true"]', 'lang'),
      ]).toStrictEqual([language, language, [language]]);
    });

    it('names itself as canonical, both languages as alternates and the Portuguese page as the default', () => {
      expect([
        attribute(document, 'link[rel=canonical]', 'href'),
        [...document.querySelectorAll('link[rel=alternate]')].map((link) => [
          link.getAttribute('hreflang'),
          link.getAttribute('href'),
        ]),
      ]).toStrictEqual([
        [`${ORIGIN}${own}`],
        [
          ['pt-BR', `${ORIGIN}${portuguese}`],
          ['en', `${ORIGIN}${english}`],
          ['x-default', `${ORIGIN}${portuguese}`],
        ],
      ]);
    });

    it('links its logo to the home page and its language links to this page in each language', () => {
      expect([
        attribute(document, '.logo', 'href'),
        attribute(document, '.locale-switcher a', 'href'),
      ]).toStrictEqual([[HOME[language]], [portuguese, english]]);
    });

    it('lists the three pages of its language and the privacy preferences in the footer, and marks itself as the current one', () => {
      expect([
        attribute(document, '.legal-footer a', 'href'),
        attribute(document, '.legal-footer a[aria-current="page"]', 'href'),
      ]).toStrictEqual([[...SETS[language].map(LegalPages.address), PREFERENCES[language]], [own]]);
    });

    it('has one heading of the first level, and the title is that heading and the name of the site', () => {
      const headings = [...document.querySelectorAll('h1')].map((heading) => heading.textContent);
      expect([headings.length, document.title]).toStrictEqual([
        1,
        `${headings[0]} | eklund.com.br`,
      ]);
    });

    it('carries the date of the same version as the page in the other language', () => {
      expect(updated(document)).toBe(updated(parse(counterpart)));
    });

    it('writes no em dash and no en dash in its text, as the voice of the site asks', () => {
      expect(document.body.textContent.match(/[–—]/g)).toBeNull();
    });
  });

  it('list in the cookie policy exactly the keys the site stores in the browser, in both languages', () => {
    const code = [
      SiteSource.read('index.html'),
      ...SiteSource.files('js').map((file) => SiteSource.read(file)),
    ].join('\n');
    const stored = new Set([
      ...[...code.matchAll(/localStorage\.(?:get|set)Item\('(\w+)'/g)].map(([, key]) => key),
      ...[...code.matchAll(/Preferences\.(?:read|write)\('(\w+)'/g)].map(([, key]) => key),
      ...[...code.matchAll(/STORAGE_KEY = '(\w+)'/g)].map(([, key]) => key),
    ]);
    const listed = (file) =>
      [...parse(file).querySelectorAll('tbody tr td:first-child code')].map(
        (element) => element.textContent,
      );
    expect([
      listed('cookies/index.html'),
      listed('en/cookies/index.html'),
      [...stored].sort(),
    ]).toStrictEqual([
      ['theme', 'hue', 'motion', 'lang', 'privacy', 'recordings'],
      ['theme', 'hue', 'motion', 'lang', 'privacy', 'recordings'],
      ['hue', 'lang', 'motion', 'privacy', 'recordings', 'theme'],
    ]);
  });

  it('give the channel for data subjects in the privacy policy of both languages', () => {
    expect(
      ['privacidade/index.html', 'en/privacy/index.html'].map((file) => [
        ...new Set(attribute(parse(file), 'a[href^="mailto:"]', 'href')),
      ]),
    ).toStrictEqual([
      ['mailto:gustavo+privacidade@eklund.com.br'],
      ['mailto:gustavo+privacidade@eklund.com.br'],
    ]);
  });
});
