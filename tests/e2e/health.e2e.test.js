import { test, expect } from './support/fixtures.js';
import { PageHealth } from './support/page-health.js';
import { SourceTree } from './support/source-tree.js';
import { DictionaryText } from './support/dictionary-text.js';
import { SiteRoot } from './support/site-root.js';

const PT_BR = DictionaryText.of('pt-BR');

test.describe('page health', () => {
  test('loads with nothing in the console, no uncaught error and no failed request', async ({
    site,
    health,
  }) => {
    await site.open('/');
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('turns on the custom cursor only for a fine pointer', async ({ site, isMobile }) => {
    await site.open('/');
    await expect(site.html).toHaveClass(
      isMobile ? 'js fonts-ready' : 'js has-custom-cursor fonts-ready',
    );
  });

  test('stays clean after scrolling through the whole page', async ({ site, health }) => {
    await site.open('/');
    const { bottom, height } = await site.scrollThroughPage();
    expect(bottom).toBe(height);
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('has the Portuguese title, description and language by default', async ({ site }) => {
    await site.open('/');
    await expect(site.page).toHaveTitle(PT_BR.meta.title);
    await expect(site.metaDescription).toHaveAttribute('content', PT_BR.meta.description);
    await expect(site.html).toHaveAttribute('lang', 'pt-BR');
  });

  test('answers every request of a full visit with status 200', async ({ site, page }) => {
    const statuses = [];
    page.on('response', (response) => {
      if (response.url().startsWith('http://127.0.0.1:8735/'))
        statuses.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    await site.open('/');
    await site.scrollThroughPage();
    const notOk = statuses.filter((entry) => !entry.startsWith('200 '));
    expect(notOk).toStrictEqual([]);
  });

  test('preloads exactly the modules that exist, and each one is served with status 200', async ({
    site,
    page,
  }) => {
    test.skip(
      SiteRoot.isBuilt,
      'the build bundles the modules: there is nothing left to preload but the fonts',
    );
    await site.open('/');
    const hrefs = await page
      .locator('link[rel=modulepreload]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')).sort());
    expect(hrefs).toStrictEqual(SourceTree.preloadedModules());
    const statuses = [];
    for (const href of hrefs)
      statuses.push({ href, status: (await page.request.get(href)).status() });
    expect(statuses).toStrictEqual(hrefs.map((href) => ({ href, status: 200 })));
  });
});
