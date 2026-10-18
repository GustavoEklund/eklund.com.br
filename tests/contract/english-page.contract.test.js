// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from 'vitest';
import { EN_US } from '@site/js/i18n/locales/en-us.js';
import { PT_BR } from '@site/js/i18n/locales/pt-br.js';
import { EnglishPage } from '../../tools/english-page.mjs';
import { SiteSource } from '../support/site-source.js';

const ORIGIN = 'https://eklund.com.br';

const parse = (html) =>
  new DOMParser().parseFromString(
    html.replaceAll('rel="stylesheet"', 'rel="stylesheet-not-loaded"'),
    'text/html',
  );
const flatten = (dictionary, prefix = '', map = new Map()) => {
  for (const [name, value] of Object.entries(dictionary)) {
    if (value && typeof value === 'object') flatten(value, `${prefix}${name}.`, map);
    else map.set(`${prefix}${name}`, String(value));
  }
  return map;
};

describe('the English page, en/index.html', () => {
  let portuguese, english;
  const values = (document, selector, attribute) =>
    [...document.querySelectorAll(selector)].map((element) => element.getAttribute(attribute));

  beforeAll(() => {
    portuguese = parse(SiteSource.read('index.html'));
    english = parse(SiteSource.read('en/index.html'));
  });

  describe('as a document', () => {
    it('declares English, and takes its title, description and social text from the en-US dictionary', () => {
      expect([
        english.documentElement.lang,
        english.documentElement.hasAttribute('dir'),
        english.title,
        values(english, 'meta[name=description]', 'content'),
        values(english, 'meta[property="og:title"]', 'content'),
        values(english, 'meta[property="og:description"]', 'content'),
        values(english, 'meta[property="og:image:alt"]', 'content'),
      ]).toStrictEqual([
        'en-US',
        false,
        EN_US.meta.title,
        [EN_US.meta.description],
        [EN_US.meta.title],
        [EN_US.meta.description],
        [EN_US.meta.imageAlt],
      ]);
    });

    it('names itself as the address of this version, and Portuguese as the alternate locale', () => {
      expect([
        values(english, 'link[rel=canonical]', 'href'),
        values(english, 'meta[property="og:url"]', 'content'),
        values(english, 'meta[property="og:locale"]', 'content'),
        values(english, 'meta[property="og:locale:alternate"]', 'content'),
      ]).toStrictEqual([[`${ORIGIN}/en/`], [`${ORIGIN}/en/`], ['en_US'], ['pt_BR']]);
    });

    it('announces the same alternates as the Portuguese page: each language at its own address, and x-default at the root', () => {
      const alternates = (document) =>
        [...document.querySelectorAll('link[rel=alternate][hreflang]')].map((link) => [
          link.getAttribute('hreflang'),
          link.getAttribute('href'),
        ]);
      expect([alternates(english), alternates(portuguese)]).toStrictEqual([
        [
          ['pt-BR', `${ORIGIN}/`],
          ['en', `${ORIGIN}/en/`],
          ['x-default', `${ORIGIN}/`],
        ],
        [
          ['pt-BR', `${ORIGIN}/`],
          ['en', `${ORIGIN}/en/`],
          ['x-default', `${ORIGIN}/`],
        ],
      ]);
    });

    it('carries the same JSON-LD and the same inline script as the Portuguese page', () => {
      const scripts = (document) =>
        [...document.querySelectorAll('script:not([src])')].map((script) => [
          script.getAttribute('type'),
          script.textContent,
        ]);
      expect(scripts(english)).toStrictEqual(scripts(portuguese));
    });

    it('marks English as the current language in the header, and links each language to its page', () => {
      const switcher = (document) =>
        [...document.querySelectorAll('.locale-switcher a')].map((link) => [
          link.dataset.locale,
          link.getAttribute('href'),
          link.getAttribute('aria-current'),
        ]);
      expect([switcher(english), switcher(portuguese)]).toStrictEqual([
        [
          ['pt-BR', '/', null],
          ['en-US', '/en/', 'true'],
        ],
        [
          ['pt-BR', '/', 'true'],
          ['en-US', '/en/', null],
        ],
      ]);
    });
  });

  describe('as the same page in another language', () => {
    it('has the same elements in the same order, with the same ids: only the text differs', () => {
      const skeleton = (document) =>
        [...document.body.querySelectorAll('*')].map(
          (element) => `${element.localName}${element.id ? `#${element.id}` : ''}`,
        );
      expect(skeleton(english)).toStrictEqual(skeleton(portuguese));
    });

    it('shows text from the en-US dictionary wherever the Portuguese page shows text from the pt-BR one', () => {
      const texts = (document) =>
        [...document.querySelectorAll('[data-i18n]')].map((element) => [
          element.dataset.i18n,
          element.textContent,
        ]);
      const keys = texts(portuguese).map(([key]) => key);
      const englishDictionary = flatten(EN_US);
      expect(texts(english)).toStrictEqual(keys.map((key) => [key, englishDictionary.get(key)]));
      expect(texts(portuguese)).toStrictEqual(keys.map((key) => [key, flatten(PT_BR).get(key)]));
    });

    it('marks the same parts as being in another language', () => {
      const marked = (document) =>
        [...document.querySelectorAll('[lang]')].map((element) => [
          element.localName,
          element.getAttribute('lang'),
        ]);
      expect(marked(english)).toStrictEqual([['html', 'en-US'], ...marked(portuguese).slice(1)]);
    });
  });

  describe('one folder down', () => {
    const addresses = (document) =>
      [...document.querySelectorAll('[href], [src]')]
        .map((element) => element.getAttribute('href') ?? element.getAttribute('src'))
        .filter((address) => !address.startsWith('#'));

    it('names every file, stylesheet, script, font and image from the root of the site or by a full address', () => {
      expect(
        addresses(english).filter((address) => !/^(\/|https?:|mailto:|tel:|data:)/.test(address)),
      ).toStrictEqual([]);
    });

    it('points at files that exist', () => {
      const local = addresses(english)
        .filter((address) => address.startsWith('/'))
        .map((address) => address.split(/[?#]/)[0])
        .filter((path) => path !== '/' && path !== '/en/');
      expect(local.filter((path) => !SiteSource.exists(path.slice(1)))).toStrictEqual([]);
    });

    it('starts the same modules as the Portuguese page and preloads the same files', () => {
      const root = (address) => (address.startsWith('/') ? address : `/${address}`);
      const files = (document, selector, attribute) =>
        values(document, selector, attribute).map(root);
      expect([
        files(english, 'link[rel=modulepreload]', 'href'),
        files(english, 'script[type=module]', 'src'),
        files(english, 'link[rel=preload]', 'href'),
        files(english, 'link[rel=stylesheet-not-loaded]', 'href'),
      ]).toStrictEqual([
        files(portuguese, 'link[rel=modulepreload]', 'href'),
        files(portuguese, 'script[type=module]', 'src'),
        files(portuguese, 'link[rel=preload]', 'href'),
        files(portuguese, 'link[rel=stylesheet-not-loaded]', 'href'),
      ]);
    });
  });
});

describe('EnglishPage.render', () => {
  const dictionary = new Map([
    ['meta.title', 'The title'],
    ['hero.cta', 'See it'],
  ]);
  const page = `<!doctype html>
<html lang="pt-BR" data-theme="dark">
<head>
<title data-i18n-attr="x:y">O título</title>
<link rel="canonical" href="https://eklund.com.br/">
<meta property="og:url" content="https://eklund.com.br/">
<meta property="og:locale" content="pt_BR">
<meta property="og:locale:alternate" content="en_US">
<link rel="stylesheet" href="css/site.css">
</head>
<body>
<a class="btn" data-i18n="hero.cta" href="#perfil">Ver</a>
<div class="locale-switcher"><a href="/" data-locale="pt-BR" aria-current="true">PT</a><a href="/en/" data-locale="en-US">EN</a></div>
<img src="assets/logo.jpg" alt="">
<a href="https://example.test/x">outside</a><a href="mailto:a@b.c">mail</a><a href="/already/rooted">rooted</a><a href="data:text/plain,hi">data</a><a href="//cdn.test/y">scheme-relative</a>
<script type="module" src="js/main.js"></script>
</body>
</html>`;
  const render = () => EnglishPage.render(page, dictionary);

  it('writes the default text of every translated element in English', () => {
    expect(
      render()
        .split('\n')
        .filter((line) => line.includes('data-i18n="hero.cta"')),
    ).toStrictEqual(['<a class="btn" data-i18n="hero.cta" href="#perfil">See it</a>']);
  });

  it('declares English and swaps the Open Graph locales', () => {
    const html = render();
    expect([
      html.includes('<html lang="en-US" data-theme="dark">'),
      html.includes('<meta property="og:locale" content="en_US">'),
      html.includes('<meta property="og:locale:alternate" content="pt_BR">'),
    ]).toStrictEqual([true, true, true]);
  });

  it('points the canonical link and og:url at /en/', () => {
    const html = render();
    expect([
      html.includes('<link rel="canonical" href="https://eklund.com.br/en/">'),
      html.includes('<meta property="og:url" content="https://eklund.com.br/en/">'),
    ]).toStrictEqual([true, true]);
  });

  it('moves aria-current from the Portuguese link to the English one', () => {
    expect(
      render()
        .split('\n')
        .filter((line) => line.includes('locale-switcher')),
    ).toStrictEqual([
      '<div class="locale-switcher"><a href="/" data-locale="pt-BR">PT</a><a href="/en/" data-locale="en-US" aria-current="true">EN</a></div>',
    ]);
  });

  it('makes site paths absolute, and leaves anchors, addresses, mail and data links alone', () => {
    const html = render();
    expect([
      html.includes('<link rel="stylesheet" href="/css/site.css">'),
      html.includes('<img src="/assets/logo.jpg" alt="">'),
      html.includes('<script type="module" src="/js/main.js"></script>'),
      html.includes('href="#perfil"'),
      html.includes('href="https://example.test/x"'),
      html.includes('href="mailto:a@b.c"'),
      html.includes('href="/already/rooted"'),
      html.includes('href="data:text/plain,hi"'),
      html.includes('href="//cdn.test/y"'),
    ]).toStrictEqual([true, true, true, true, true, true, true, true, true]);
  });

  it('is the same for the same input', () => {
    expect(render()).toBe(render());
  });
});
