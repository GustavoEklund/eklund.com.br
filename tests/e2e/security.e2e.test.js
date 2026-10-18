import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from './support/fixtures.js';
import { PageHealth } from './support/page-health.js';
import { DictionaryText } from './support/dictionary-text.js';
import { SiteHeaders } from '../../tools/site-headers.mjs';
import { SiteRoot } from './support/site-root.js';

const SHADER_COMMAND = DictionaryText.of('en-US').palette.commands.shader.title; // the test opens the palette after switching to English
const INDEX = readFileSync(join(SiteRoot.folder, 'index.html'), 'utf8');

/** Records every Content-Security-Policy violation the document reports, as "directive blocked-resource". */
const watchViolations = (page) =>
  page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', (event) =>
      window.__violations.push(`${event.violatedDirective} ${event.blockedURI}`),
    );
  });
const violations = (page) => page.evaluate(() => window.__violations);

test.describe('content security policy', () => {
  test('arrives with the page, with the same value production sends', async ({ page }) => {
    const response = await page.goto('/');
    const headers = response.headers();
    expect([
      headers['content-security-policy'],
      headers['x-content-type-options'],
      headers['referrer-policy'],
      headers['cross-origin-opener-policy'],
      headers['content-language'],
    ]).toStrictEqual([
      SiteHeaders.production(INDEX)['Content-Security-Policy'],
      'nosniff',
      'strict-origin-when-cross-origin',
      'same-origin',
      'pt-BR',
    ]);
  });

  test('blocks nothing the page does: scrolling, the palette, the theme, both languages, the shader dialog and the architecture map', async ({
    site,
    page,
    health,
  }) => {
    await watchViolations(page);
    await site.open('/');
    await site.scrollThroughPage();
    await site.openPalette();
    await site.paletteInput.fill('tema');
    await page.keyboard.press('Escape');
    await site.themeToggle.click();
    await site.localeLink('en-US').click();
    await expect(site.html).toHaveAttribute('lang', 'en-US');
    await site.centerOn('#architecture-svg');
    await site.architectureNode('gateway').hover();
    await expect(site.architectureTooltip).toBeVisible();
    await site.openPalette();
    await site.paletteInput.fill(SHADER_COMMAND);
    await page.keyboard.press('Enter'); // the shader button is hidden on narrow screens, the palette reaches the dialog on every screen
    await expect(page.locator('#shader-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await site.localeLink('pt-BR').click();
    await expect(site.html).toHaveAttribute('lang', 'pt-BR');
    expect(await violations(page)).toStrictEqual([]);
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('blocks nothing the load test does, workers included, from the first request to the last result', async ({
    site,
    page,
    health,
    isMobile,
  }) => {
    test.skip(isMobile, 'the full run takes 20 s of CPU, so one project runs it');
    test.setTimeout(120_000);
    await watchViolations(page);
    await site.open('/');
    await site.jumpTo('carga');
    await expect(site.loadTestState).toHaveText('concluído', { timeout: 90_000 });
    expect(await violations(page)).toStrictEqual([]);
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('leaves the JSON-LD block alone: it is data, not a script, so it needs no hash and the page can still read it', async ({
    site,
    page,
  }) => {
    await watchViolations(page);
    await site.open('/');
    const types = await page.evaluate(() =>
      JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)[
        '@graph'
      ].map((node) => node['@type']),
    );
    expect([types, await violations(page)]).toStrictEqual([
      ['Person', 'WebSite', 'ProfilePage'],
      [],
    ]);
  });

  test('is enforced: an injected inline script does not run, an injected style element and a request to another host are refused', async ({
    site,
    page,
  }) => {
    await watchViolations(page);
    await site.open('/');
    const outcome = await page.evaluate(async () => {
      const script = document.createElement('script');
      script.textContent = 'window.__injected = true';
      document.head.append(script);
      const style = document.createElement('style');
      style.textContent = 'body { outline: 9px solid red }';
      document.head.append(style);
      const fetched = await fetch('https://example.com/').then(
        () => 'allowed',
        () => 'refused',
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        ran: window.__injected === true,
        outline: getComputedStyle(document.body).outlineStyle,
        fetched,
      };
    });
    expect(outcome).toStrictEqual({ ran: false, outline: 'none', fetched: 'refused' });
    expect(await violations(page)).toStrictEqual([
      'script-src-elem inline',
      'style-src-elem inline',
      'connect-src https://example.com/',
    ]);
  });
});
