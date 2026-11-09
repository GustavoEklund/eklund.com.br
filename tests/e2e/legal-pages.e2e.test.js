import { test, expect } from './support/fixtures.js';
import { AxeAudit } from './support/axe-audit.js';
import { DictionaryText } from './support/dictionary-text.js';
import { LayoutAudit } from './support/layout-audit.js';
import { PageHealth } from './support/page-health.js';
import { LegalPages } from '../../tools/legal-pages.mjs';

const PT_BR = DictionaryText.of('pt-BR');
const EN_US = DictionaryText.of('en-US');
const PAGES = LegalPages.PAGES.map(({ file, language, counterpart }) => ({
  address: LegalPages.address(file),
  language,
  other: LegalPages.address(counterpart),
}));
/** The footer links of the home page in one language: [text, address] of each, in order. */
const footerLinks = (text) => [
  [text.footer.legal.privacy, text.footer.legal.privacyAddress],
  [text.footer.legal.cookies, text.footer.legal.cookiesAddress],
  [text.footer.legal.terms, text.footer.legal.termsAddress],
];
const readLinks = (locator) =>
  locator.evaluateAll((links) =>
    links.map((link) => [link.textContent, link.getAttribute('href')]),
  );

test.describe('the legal pages', () => {
  for (const { address, language, other } of PAGES) {
    test.describe(address, () => {
      for (const theme of ['dark', 'light']) {
        test(`${theme} theme: no axe violation, and nothing goes wrong while it loads`, async ({
          page,
          health,
        }) => {
          await AxeAudit.useTheme(page, theme);
          await page.goto(address);
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          // Read before the audit, which injects a style of its own and logs what the policy blocks of it.
          const problems = health.problems;
          expect([problems, await AxeAudit.run(page)]).toStrictEqual([PageHealth.NONE, []]);
        });
      }

      test('reads at 320 px with nothing scrolling sideways, and every control is at least 24 px', async ({
        page,
      }) => {
        await page.setViewportSize({ width: 320, height: 640 });
        await page.goto(address);
        expect([
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
          await LayoutAudit.undersizedTargets(page),
        ]).toStrictEqual([0, []]);
      });

      test('opens the same page in the other language from its language link', async ({ page }) => {
        await page.goto(address);
        await page
          .locator(`.locale-switcher a[lang="${language === 'pt-BR' ? 'en-US' : 'pt-BR'}"]`)
          .click();
        await expect(page).toHaveURL(other);
        await expect(page.locator('html')).toHaveAttribute(
          'lang',
          language === 'pt-BR' ? 'en-US' : 'pt-BR',
        );
      });
    });
  }

  test('keeps the language of the page even for a visitor who chose the other one on the home page', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('lang', 'en-US'));
    await page.goto('/privacidade/');
    await expect(page).toHaveURL('/privacidade/');
  });
});

test.describe('the footer of the home page', () => {
  test('links the three legal pages of the Portuguese page', async ({ site }) => {
    await site.open('/');
    expect(
      await readLinks(site.page.locator('footer a[id$="-link"]:not(#source-link)')),
    ).toStrictEqual(footerLinks(PT_BR));
  });

  test('links the three legal pages of the English page', async ({ site }) => {
    await site.open('/en/');
    expect(
      await readLinks(site.page.locator('footer a[id$="-link"]:not(#source-link)')),
    ).toStrictEqual(footerLinks(EN_US));
  });

  test('names the pages of the new language when the language switches in place', async ({
    site,
  }) => {
    await site.open('/');
    await site.localeLink('en-US').click();
    await expect(site.html).toHaveAttribute('lang', 'en-US');
    expect(
      await readLinks(site.page.locator('footer a[id$="-link"]:not(#source-link)')),
    ).toStrictEqual(footerLinks(EN_US));
  });

  test('leads to the privacy policy', async ({ site, page }) => {
    await site.open('/');
    await page.locator('#privacy-link').click();
    await expect(page).toHaveURL('/privacidade/');
    await expect(page.locator('h1')).toHaveText(PT_BR.footer.legal.privacy);
  });
});
