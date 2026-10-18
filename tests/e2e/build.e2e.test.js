import { test, expect } from './support/fixtures.js';
import { PageHealth } from './support/page-health.js';
import { SiteRoot } from './support/site-root.js';

const FONTS = [
  'bricolage-grotesque-latin',
  'instrument-serif-italic-latin',
  'jetbrains-mono-latin',
];

/** What only the production build has to answer for. These specs run against dist/ (SITE_ROOT=dist) and are skipped on source/. */
test.describe('the production build', () => {
  test.skip(!SiteRoot.isBuilt, 'these checks are about dist/');

  for (const [language, path] of [
    ['Portuguese', '/'],
    ['English', '/en/'],
  ]) {
    test(`${language}: one stylesheet and one script from /assets, three font preloads and no module preload`, async ({
      site,
      page,
      health,
    }) => {
      await site.open(path);
      const hrefs = (selector, attribute) =>
        page
          .locator(selector)
          .evaluateAll(
            (elements, name) =>
              elements.map(
                (element) => new URL(element.getAttribute(name), location.href).pathname,
              ),
            attribute,
          );
      const hashed = /^\/assets\/main-[\w-]{8}\.(css|js)$/;
      const [stylesheets, scripts, modulePreloads, preloads] = await Promise.all([
        hrefs('link[rel=stylesheet]', 'href'),
        hrefs('script[type=module][src]', 'src'),
        hrefs('link[rel=modulepreload]', 'href'),
        hrefs('link[rel=preload]', 'href'),
      ]);
      expect({
        stylesheets: stylesheets.map((address) => hashed.test(address)),
        scripts: scripts.map((address) => hashed.test(address)),
        modulePreloads,
        preloads: preloads.sort(),
        problems: health.problems,
      }).toStrictEqual({
        stylesheets: [true],
        scripts: [true],
        modulePreloads: [],
        preloads: FONTS.map((name) => SiteRoot.fontPath(name)).sort(),
        problems: PageHealth.NONE,
      });
    });
  }

  test('the load test engine runs from its own bundled worker file', async ({ site, page }) => {
    const workers = [];
    page.on('worker', (worker) => workers.push(new URL(worker.url()).pathname));
    await site.open('/');
    await site.loadTestRun.click();
    await expect.poll(() => workers.length > 0, { timeout: 60_000 }).toBe(true);
    expect([
      workers.length > 0,
      workers.filter((address) => !/^\/assets\/pix-engine\.worker-[\w-]{8}\.js$/.test(address)),
    ]).toStrictEqual([true, []]);
  });
});
