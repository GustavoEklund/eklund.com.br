import { readFileSync } from 'node:fs';
import { test, expect } from './support/fixtures.js';
import { AxeAudit } from './support/axe-audit.js';
import { LayoutAudit } from './support/layout-audit.js';
import { LayoutShiftMeter } from './support/layout-shift-meter.js';
import { PageHealth } from './support/page-health.js';
import { SiteRoot } from './support/site-root.js';
import { NotFoundPages } from '../../tools/not-found-pages.mjs';

/** The heading each page is written with, read from the page itself: its text lives in the HTML, not in a dictionary (0016). */
const heading = (file) =>
  /<h1>([^<]+)<\/h1>/.exec(
    readFileSync(new URL(`../../source/${file}`, import.meta.url), 'utf8'),
  )[1];
const PORTUGUESE = heading(NotFoundPages.PAGES[0].file);
const ENGLISH = heading(NotFoundPages.PAGES[1].file);
/** Missing addresses, the language of the page that answers each, and its heading. */
const MISSING = [
  { address: '/nao-existe', language: 'pt-BR', title: PORTUGUESE },
  { address: '/a/b/c/d.html', language: 'pt-BR', title: PORTUGUESE },
  { address: '/enigma/', language: 'pt-BR', title: PORTUGUESE },
  { address: '/en/does-not-exist', language: 'en-US', title: ENGLISH },
  { address: '/en/a/b/c/', language: 'en-US', title: ENGLISH },
];
/** What PageHealth reports for a page that answers 404 on purpose: that one response, and the line Chromium logs for it. */
const healthOf = (baseURL, address) => ({
  ...PageHealth.NONE,
  console: [
    'error: Failed to load resource: the server responded with a status of 404 (Not Found)',
  ],
  badResponses: [`404 ${baseURL}${address}`],
});

test.describe('the 404 pages', () => {
  for (const { address, language, title } of MISSING)
    test(`${address} answers 404 with the page in ${language}`, async ({ page }) => {
      const response = await page.goto(address);
      expect([
        response.status(),
        response.headers()['content-language'],
        await page.locator('html').getAttribute('lang'),
        await page.locator('h1').textContent(),
        await page.title(),
        page.url().endsWith(address),
      ]).toStrictEqual([404, language, language, title, `${title} | eklund.com.br`, true]);
    });

  for (const { address, language } of [MISSING[1], MISSING[4]]) {
    test.describe(`${language}, at ${address}`, () => {
      for (const theme of ['dark', 'light']) {
        test(`${theme} theme: styled at any depth, no axe violation, and nothing else goes wrong`, async ({
          page,
          health,
          baseURL,
        }) => {
          await AxeAudit.useTheme(page, theme);
          await page.goto(address);
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          const styled = await page
            .locator('.legal-page')
            .evaluate((element) => getComputedStyle(element).marginInline !== '0px');
          const problems = health.problems;
          expect([styled, problems, await AxeAudit.run(page)]).toStrictEqual([
            true,
            healthOf(baseURL, address),
            [],
          ]);
        });
      }

      test('shifts nothing while it loads', async ({ page }) => {
        await LayoutShiftMeter.install(page);
        await page.goto(address);
        await page.evaluate(() => document.fonts.ready);
        await LayoutAudit.settle(page);
        expect(await LayoutShiftMeter.shifts(page)).toStrictEqual([]);
      });

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

      test('links only pages and sections that exist', async ({ page, request }) => {
        await page.goto(address);
        const links = await page
          .locator('a[href^="/"]')
          .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')));
        const pages = [...new Set(links.map((link) => link.split('#')[0]))];
        const statuses = await Promise.all(
          pages.map(async (link) => [link, (await request.get(link)).status()]),
        );
        const ids = await Promise.all(
          links
            .filter((link) => link.includes('#'))
            .map(async (link) => {
              const [home, id] = link.split('#');
              const html = await (await request.get(home)).text();
              return html.includes(`id="${id}"`);
            }),
        );
        expect([statuses, ids]).toStrictEqual([
          pages.map((link) => [link, 200]),
          Array(6).fill(true),
        ]);
      });
    });
  }

  test('leads to the home page of its language from the logo', async ({ page }) => {
    await page.goto('/en/does-not-exist');
    await page.locator('.logo').click();
    await expect(page).toHaveURL('/en/');
  });

  test('leads to a section of the home page from its list', async ({ page }) => {
    await page.goto('/nao-existe');
    await page.locator('main a[href="/#contato"]').click();
    await expect(page).toHaveURL('/#contato');
  });

  test('is served by the copy of a version too, from the pages of the root', async ({ page }) => {
    test.skip(!SiteRoot.isBuilt, 'only the build has the copy of a version');
    const { version } = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    );
    const response = await page.goto(`/${version}/en/does-not-exist`);
    expect([response.status(), await page.locator('h1').textContent()]).toStrictEqual([
      404,
      ENGLISH,
    ]);
  });
});
