import { test, expect } from './support/fixtures.js';
import { GlobePixels } from './support/globe-pixels.js';
import { SitePage } from './support/site-page.js';

/** The pixel the poll saw: a second reading could land on a canvas that a resize has just cleared. */
const centerOnceOpaque = async (page) => {
  let center;
  await expect
    .poll(
      async () => {
        center = (await GlobePixels.corners(page)).center;
        return center[3];
      },
      { timeout: 60_000 },
    )
    .toBe(255);
  return center;
};

test.describe('the colors the canvases and the browser read from the theme, with motion paused', () => {
  // A phone draws the globe at a pixel ratio of 1.5, and the globe lowers it to 1 after two seconds under 45 frames a
  // second, which a shared runner can do on one page and not on the other: the two canvases then differ in size, and so
  // does the pixel at their center. At a device scale factor of 1 there is no ratio to lower.
  test.use({ deviceScaleFactor: 1 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('motion', 'paused'));
    await GlobePixels.install(page);
  });

  test('the globe is repainted in the colors of the theme the visitor switches to, not of the one they left', async ({
    site,
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await site.open('/');
    const dark = await centerOnceOpaque(page);
    await site.themeToggle.click();
    await expect(site.html).toHaveAttribute('data-theme', 'light');
    // Motion is paused, so the globe stands still: the next frame can only differ from the first one by the colors.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const switched = await centerOnceOpaque(page);
    const fresh = await context.newPage(); // loads with the light theme the first page saved
    await GlobePixels.install(fresh);
    await new SitePage(fresh).open('/');
    const reference = await centerOnceOpaque(fresh);
    expect({ switched, changed: switched.join() !== dark.join() }).toStrictEqual({
      switched: reference,
      changed: true,
    });
  });

  test('the theme-color of the browser follows the switch too', async ({ site, page, context }) => {
    await site.open('/');
    const themeColor = (target) =>
      target.evaluate(() => document.querySelector('meta[name=theme-color]').content);
    const dark = await themeColor(page);
    await site.themeToggle.click();
    await expect(site.html).toHaveAttribute('data-theme', 'light');
    const switched = await themeColor(page);
    const fresh = await context.newPage();
    await new SitePage(fresh).open('/');
    expect({ switched, changed: switched !== dark }).toStrictEqual({
      switched: await themeColor(fresh),
      changed: true,
    });
  });
});
