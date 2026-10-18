import { test, expect } from './support/fixtures.js';
import { PageHealth } from './support/page-health.js';
import { DictionaryText } from './support/dictionary-text.js';

const PT_BR = DictionaryText.of('pt-BR');
const EN_US = DictionaryText.of('en-US');
const ORIGIN = 'http://127.0.0.1:8735';
const GOOGLEBOT =
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/130 Safari/537.36';

test.describe('the Portuguese page, at the root', () => {
  test('opens in Portuguese when the browser asks for it', async ({ site }) => {
    await site.open('/');
    await expect(site.html).toHaveAttribute('lang', 'pt-BR');
    await expect(site.page).toHaveTitle(PT_BR.meta.title);
    await expect(site.localeLink('pt-BR')).toHaveAttribute('aria-current', 'true');
    await expect(site.localeLink('en-US')).not.toHaveAttribute('aria-current');
    await expect(site.page).toHaveURL(`${ORIGIN}/`);
    await expect(site.section('status').locator('h2')).toHaveText(
      DictionaryText.plain(PT_BR.status.title),
    );
  });

  test('does not store a language the visitor never chose', async ({ site }) => {
    await site.open('/');
    expect(await site.storedValue('lang')).toBeNull();
  });
});

test.describe('the English page, at /en/', () => {
  test('opens in English, everywhere on the page, whatever the browser asks for', async ({
    site,
    health,
  }) => {
    await site.open('/en/');
    await expect(site.html).toHaveAttribute('lang', 'en-US');
    await expect(site.page).toHaveTitle(EN_US.meta.title);
    await expect(site.metaDescription).toHaveAttribute('content', EN_US.meta.description);
    await expect(site.localeLink('en-US')).toHaveAttribute('aria-current', 'true');
    await expect(site.localeLink('pt-BR')).not.toHaveAttribute('aria-current');
    await expect(site.page).toHaveURL(`${ORIGIN}/en/`);
    await expect(site.section('status').locator('h2')).toHaveText(
      DictionaryText.plain(EN_US.status.title),
    );
    await expect(site.section('perfil').locator('.eyebrow bdi')).toHaveText(EN_US.profile.eyebrow);
    await expect(site.section('contato').locator('.lead')).toHaveText(EN_US.contact.lead);
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('opens at /en without the slash too, which moves to /en/', async ({ site }) => {
    await site.page.goto('/en');
    await expect(site.page).toHaveURL(`${ORIGIN}/en/`);
  });

  test('does not store a language the visitor never chose', async ({ site }) => {
    await site.open('/en/');
    expect(await site.storedValue('lang')).toBeNull();
  });

  test('keeps its address when the browser and the saved choice are Portuguese: the address wins', async ({
    site,
  }) => {
    await site.open('/');
    await site.storeValue('lang', 'pt-BR');
    await site.open('/en/');
    await expect(site.html).toHaveAttribute('lang', 'en-US');
    await expect(site.page).toHaveURL(`${ORIGIN}/en/`);
  });
});

test.describe('each page is in its language before any script runs', () => {
  const textsOf = (page) =>
    page.evaluate(() => [
      document.documentElement.lang,
      document.title,
      document.querySelector('#status h2').textContent,
      document.querySelector('#contato .lead').textContent,
    ]);

  test('what a crawler or a reader without scripts gets', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: ORIGIN });
    try {
      const portuguese = await context.newPage();
      await portuguese.goto('/');
      const english = await context.newPage();
      await english.goto('/en/');
      expect([await textsOf(portuguese), await textsOf(english)]).toStrictEqual([
        ['pt-BR', PT_BR.meta.title, DictionaryText.plain(PT_BR.status.title), PT_BR.contact.lead],
        ['en-US', EN_US.meta.title, DictionaryText.plain(EN_US.status.title), EN_US.contact.lead],
      ]);
    } finally {
      await context.close();
    }
  });
});

test.describe('the old address of the English version, and a ?lang the site does not know', () => {
  test('/?lang=en leads to /en/, in English', async ({ site }) => {
    await site.open('/?lang=en');
    await expect(site.page).toHaveURL(`${ORIGIN}/en/`);
    await expect(site.html).toHaveAttribute('lang', 'en-US');
  });

  test('/?lang=pt stays at the root in Portuguese even when the saved choice is English', async ({
    site,
  }) => {
    await site.open('/');
    await site.storeValue('lang', 'en-US');
    await site.open('/?lang=pt');
    await expect(site.html).toHaveAttribute('lang', 'pt-BR');
    await expect(site.page).toHaveTitle(PT_BR.meta.title);
  });

  test('an unsupported ?lang falls through to the saved choice', async ({ site }) => {
    await site.open('/');
    await site.storeValue('lang', 'en-US');
    await site.open('/?lang=fr');
    await expect(site.page).toHaveURL(`${ORIGIN}/en/`);
    await expect(site.html).toHaveAttribute('lang', 'en-US');
  });
});

test.describe('switching with the header links', () => {
  test('changes every string without reloading, moves the address and remembers the choice', async ({
    site,
    page,
    health,
  }) => {
    await site.open('/');
    await page.evaluate(() => {
      window.__sameDocument = 'still here';
    });

    await site.localeLink('en-US').click();

    await expect(site.html).toHaveAttribute('lang', 'en-US');
    await expect(page).toHaveTitle(EN_US.meta.title);
    await expect(site.metaDescription).toHaveAttribute('content', EN_US.meta.description);
    await expect(site.section('status').locator('h2')).toHaveText(
      DictionaryText.plain(EN_US.status.title),
    );
    await expect(site.localeLink('en-US')).toHaveAttribute('aria-current', 'true');
    await expect(site.localeLink('pt-BR')).not.toHaveAttribute('aria-current');
    await expect(page).toHaveURL(`${ORIGIN}/en/`);
    expect(await site.storedValue('lang')).toBe('en-US');
    expect(await page.evaluate(() => window.__sameDocument)).toBe('still here');

    await site.localeLink('pt-BR').click();

    await expect(site.html).toHaveAttribute('lang', 'pt-BR');
    await expect(page).toHaveTitle(PT_BR.meta.title);
    await expect(page).toHaveURL(`${ORIGIN}/`);
    expect(await site.storedValue('lang')).toBe('pt-BR');
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('keeps the section the visitor was at, in the hash', async ({ site, page }) => {
    await site.open('/#carga');
    await site.localeLink('en-US').click();
    await expect(page).toHaveURL(`${ORIGIN}/en/#carga`);
  });

  test('links to the page of each language, so a new tab or a reader without scripts gets it', async ({
    site,
  }) => {
    await site.open('/');
    expect([
      await site.localeLink('pt-BR').getAttribute('href'),
      await site.localeLink('en-US').getAttribute('href'),
    ]).toStrictEqual(['/', '/en/']);
  });

  test('keeps the chosen language after a reload and when coming back to the root address', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await site.localeLink('en-US').click();
    await expect(site.html).toHaveAttribute('lang', 'en-US');

    await page.reload();
    await expect(site.html).toHaveAttribute('lang', 'en-US');
    await expect(page).toHaveTitle(EN_US.meta.title);
    await expect(page).toHaveURL(`${ORIGIN}/en/`);

    await site.open('/');
    await expect(page).toHaveURL(`${ORIGIN}/en/`);
    await expect(site.html).toHaveAttribute('lang', 'en-US');
    await expect(page).toHaveTitle(EN_US.meta.title);
  });

  test('formats numbers with the separators of the language', async ({ site }) => {
    await site.open('/');
    const pointCount = await site.page.evaluate(() => window.eklund.globe.pointCount);
    await expect(site.pointsChip).toHaveText(DictionaryText.formatInteger(pointCount, 'pt-BR'));
    await site.localeLink('en-US').click();
    await expect(site.pointsChip).toHaveText(DictionaryText.formatInteger(pointCount, 'en-US'));
  });
});

test.describe('switching with the command palette', () => {
  test('runs the "switch language" command in both directions', async ({ site, page }) => {
    await site.open('/');
    await site.openPalette();
    await site.paletteInput.fill('english');
    await expect(site.paletteSelected).toHaveText(
      PT_BR.palette.commands.switchLocale.title + PT_BR.palette.tags.language,
    );
    await page.keyboard.press('Enter');
    await expect(site.html).toHaveAttribute('lang', 'en-US');
    await expect(page).toHaveURL(`${ORIGIN}/en/`);

    await site.openPalette();
    await expect(
      site.paletteOptions.filter({ hasText: EN_US.palette.commands.switchLocale.title }),
    ).toHaveText(EN_US.palette.commands.switchLocale.title + EN_US.palette.tags.language);
    await site.paletteInput.fill('portugues');
    await page.keyboard.press('Enter');
    await expect(site.html).toHaveAttribute('lang', 'pt-BR');
    await expect(page).toHaveURL(`${ORIGIN}/`);
  });
});

test.describe('where the browser language sends a visitor who opens the root address', () => {
  test.describe('English (United Kingdom) browser', () => {
    test.use({ locale: 'en-GB' });

    test('goes to /en/, in English, and saves nothing', async ({ site }) => {
      await site.open('/');
      await expect(site.page).toHaveURL(`${ORIGIN}/en/`);
      await expect(site.html).toHaveAttribute('lang', 'en-US');
      await expect(site.page).toHaveTitle(EN_US.meta.title);
      expect(await site.storedValue('lang')).toBeNull();
    });

    test('keeps the section in the hash and what else the address carries', async ({ site }) => {
      await site.open('/?utm=x#carga');
      await expect(site.page).toHaveURL(`${ORIGIN}/en/?utm=x#carga`);
    });
  });

  test.describe('Portuguese (Portugal) browser', () => {
    test.use({ locale: 'pt-PT' });

    test('stays at the root, in Brazilian Portuguese', async ({ site }) => {
      await site.open('/');
      await expect(site.page).toHaveURL(`${ORIGIN}/`);
      await expect(site.html).toHaveAttribute('lang', 'pt-BR');
    });
  });

  test.describe('French browser', () => {
    test.use({ locale: 'fr-FR' });

    test('stays at the root, in Brazilian Portuguese, the default', async ({ site }) => {
      await site.open('/');
      await expect(site.page).toHaveURL(`${ORIGIN}/`);
      await expect(site.html).toHaveAttribute('lang', 'pt-BR');
      await expect(site.page).toHaveTitle(PT_BR.meta.title);
    });
  });

  test.describe('English browser with a saved Portuguese choice', () => {
    test.use({ locale: 'en-US' });

    test('the saved choice wins over the browser language', async ({ site }) => {
      await site.open('/en/');
      await expect(site.html).toHaveAttribute('lang', 'en-US');
      await site.storeValue('lang', 'pt-BR');
      await site.open('/');
      await expect(site.page).toHaveURL(`${ORIGIN}/`);
      await expect(site.html).toHaveAttribute('lang', 'pt-BR');
    });
  });

  test.describe('a crawler with an English browser', () => {
    test.use({ locale: 'en-US', userAgent: GOOGLEBOT });

    test('stays at the root, so that the Portuguese page is the one indexed there', async ({
      site,
    }) => {
      await site.open('/');
      await expect(site.page).toHaveURL(`${ORIGIN}/`);
      await expect(site.html).toHaveAttribute('lang', 'pt-BR');
    });

    test('still follows an explicit /?lang=en link to the English page', async ({ site }) => {
      await site.open('/?lang=en');
      await expect(site.page).toHaveURL(`${ORIGIN}/en/`);
    });
  });
});
