import { test, expect } from './support/fixtures.js';
import { PageHealth } from './support/page-health.js';
import { DictionaryText } from './support/dictionary-text.js';
import { InjectedStyle } from './support/injected-style.js';

const ORIGIN = 'https://eklund.com.br';
const TEXT = { 'pt-BR': DictionaryText.of('pt-BR'), 'en-US': DictionaryText.of('en-US') };

/** Lays out every lazily rendered section at once, so the whole page can be read without scrolling through it (which would also start the load test). */
const renderEverySection = async (page) => {
  await InjectedStyle.add(
    page,
    '#perfil, #arquitetura, #carga, #historico, #contato { content-visibility: visible !important; }',
  );
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
};
/** What the head of the page says about itself in each language, as the rendered DOM shows it. */
const EXPECTED = {
  'pt-BR': { lang: 'pt-BR', address: `${ORIGIN}/`, locales: ['pt_BR', 'en_US'] },
  'en-US': { lang: 'en-US', address: `${ORIGIN}/en/`, locales: ['en_US', 'pt_BR'] },
};
const expectedHead = (locale) => ({
  lang: EXPECTED[locale].lang,
  title: TEXT[locale].meta.title,
  description: TEXT[locale].meta.description,
  ogTitle: TEXT[locale].meta.title,
  ogDescription: TEXT[locale].meta.description,
  ogImageAlt: TEXT[locale].meta.imageAlt,
  ogLocales: EXPECTED[locale].locales,
  canonical: EXPECTED[locale].address,
  ogUrl: EXPECTED[locale].address,
  alternates: [
    ['pt-BR', `${ORIGIN}/`],
    ['en', `${ORIGIN}/en/`],
    ['x-default', `${ORIGIN}/`],
  ],
});

/** The language-dependent parts of the rendered head. */
const renderedHead = (page) =>
  page.evaluate(() => {
    const content = (selector) => document.querySelector(selector).getAttribute('content');
    return {
      lang: document.documentElement.lang,
      title: document.title,
      description: content('meta[name=description]'),
      ogTitle: content('meta[property="og:title"]'),
      ogDescription: content('meta[property="og:description"]'),
      ogImageAlt: content('meta[property="og:image:alt"]'),
      ogLocales: [...document.querySelectorAll('meta[property^="og:locale"]')].map((meta) =>
        meta.getAttribute('content'),
      ),
      canonical: document.querySelector('link[rel=canonical]').getAttribute('href'),
      ogUrl: content('meta[property="og:url"]'),
      alternates: [...document.querySelectorAll('link[rel=alternate][hreflang]')].map((link) => [
        link.getAttribute('hreflang'),
        link.getAttribute('href'),
      ]),
    };
  });

/** Elements that must stay out of automatic translation, as "tag.class-or-id" in document order. */
const untranslatable = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[translate=no]')].map(
      (element) =>
        `${element.tagName.toLowerCase()}.${element.className || element.id || element.textContent.trim()}`,
    ),
  );

test.describe('language declarations', () => {
  test('the Portuguese page states its language in the root element, title, description, social tags, locale and addresses', async ({
    site,
    page,
    health,
  }) => {
    await site.open('/');
    expect(await renderedHead(page)).toStrictEqual(expectedHead('pt-BR'));
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('the English page states it in every one of those places too, and names its own address as canonical', async ({
    site,
    page,
    health,
  }) => {
    await site.open('/en/');
    expect(await renderedHead(page)).toStrictEqual(expectedHead('en-US'));
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('a switch with the links rewrites all of them and back, with no reload', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await page.evaluate(() => {
      window.__sameDocument = true;
    });
    await site.localeLink('en-US').click();
    await expect(site.html).toHaveAttribute('lang', 'en-US');
    expect(await renderedHead(page)).toStrictEqual(expectedHead('en-US'));
    await site.localeLink('pt-BR').click();
    await expect(site.html).toHaveAttribute('lang', 'pt-BR');
    expect(await renderedHead(page)).toStrictEqual(expectedHead('pt-BR'));
    expect(await page.evaluate(() => window.__sameDocument)).toBe(true);
  });

  test('every lang attribute in the rendered page is a canonical BCP 47 tag', async ({
    site,
    page,
  }) => {
    await site.open('/en/');
    const tags = await page.evaluate(() => [
      ...new Set(
        [...document.querySelectorAll('[lang]')].map((element) => element.getAttribute('lang')),
      ),
    ]);
    expect([
      tags,
      await page.evaluate((list) => Intl.getCanonicalLocales(list), tags),
    ]).toStrictEqual([
      ['en-US', 'pt-BR', 'en'],
      ['en-US', 'pt-BR', 'en'],
    ]);
  });
});

test.describe('language switcher', () => {
  test('offers each language by its own name, links to its page, says which one is shown, and keeps that after switching', async ({
    site,
    page,
  }) => {
    await site.open('/');
    const portuguese = page.getByRole('link', { name: 'PT, Português (Brasil)' });
    const english = page.getByRole('link', { name: 'EN, English (United States)' });
    await expect(portuguese).toHaveAttribute('aria-current', 'true');
    await expect(english).not.toHaveAttribute('aria-current');
    await english.click();
    await expect(english).toHaveAttribute('aria-current', 'true');
    await expect(portuguese).not.toHaveAttribute('aria-current');
    expect([
      await portuguese.getAttribute('lang'),
      await english.getAttribute('lang'),
      await portuguese.getAttribute('hreflang'),
      await english.getAttribute('hreflang'),
      await portuguese.getAttribute('href'),
      await english.getAttribute('href'),
      await portuguese.getAttribute('aria-label'),
      await english.getAttribute('aria-label'),
    ]).toStrictEqual([
      'pt-BR',
      'en-US',
      'pt-BR',
      'en',
      '/',
      '/en/',
      'PT, Português (Brasil)',
      'EN, English (United States)',
    ]);
  });

  test('labels the group in the language of the page, while the links keep theirs', async ({
    site,
  }) => {
    await site.open('/en/');
    await expect(site.page.locator('.locale-switcher')).toHaveAttribute(
      'aria-label',
      TEXT['en-US'].nav.language,
    );
    await expect(site.localeLink('pt-BR')).toHaveAttribute('aria-label', 'PT, Português (Brasil)');
  });
});

test.describe('command palette', () => {
  test('lists the command that switches language in that language, and says so with lang: English on the Portuguese page and the reverse', async ({
    site,
  }) => {
    await site.open('/');
    await site.openPalette();
    await site.paletteInput.fill(TEXT['pt-BR'].palette.commands.switchLocale.title);
    await expect(site.paletteOptions.first()).toHaveAttribute('lang', 'en-US');
    await site.page.keyboard.press('Enter');
    await expect(site.html).toHaveAttribute('lang', 'en-US');
    await site.openPalette();
    await site.paletteInput.fill(TEXT['en-US'].palette.commands.switchLocale.title);
    await expect(site.paletteOptions.first()).toHaveAttribute('lang', 'pt-BR');
  });
});

test.describe('names and code stay out of automatic translation', () => {
  const NAMES = [
    'a.logo',
    'h1.hero-name',
    'kbd.modifier-key',
    'kbd.K',
    'small.first contentful paint',
    'div.marquee',
    'span.terminal-command',
    'pre.quiet-scroller',
    'kbd.↑',
    'kbd.↓',
    'kbd.↵',
    'kbd.esc',
  ];

  for (const path of ['/', '/en/']) {
    test(`on ${path}: the same twelve elements carry translate="no" once the page is translated`, async ({
      site,
      page,
    }) => {
      await site.open(path);
      expect(await untranslatable(page)).toStrictEqual(NAMES);
    });
  }
});

test.describe('the English page', () => {
  test('shows no Portuguese: no word with ã, õ, ç, ê, â or ô anywhere on the page, every section laid out', async ({
    site,
    page,
  }) => {
    await site.open('/en/');
    await renderEverySection(page);
    const words = await page.evaluate(() => [
      ...new Set(document.body.innerText.match(/[^\s]*[ãõçêâô][^\s]*/gi) ?? []),
    ]);
    expect(words).toStrictEqual([]);
  });
});

test.describe('text expansion', () => {
  for (const path of ['/', '/en/']) {
    test(`on ${path}: the longest strings still fit, so the page never scrolls sideways`, async ({
      site,
    }) => {
      await site.open(path);
      await renderEverySection(site.page);
      expect(await site.horizontalOverflow()).toBe(0);
    });
  }
});
