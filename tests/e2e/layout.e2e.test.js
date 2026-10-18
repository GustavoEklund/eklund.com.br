import { test, expect } from './support/fixtures.js';

test.describe('layout', () => {
  for (const [name, path] of [
    ['Portuguese', '/'],
    ['English', '/en/'],
  ]) {
    test(`the ${name} page does not scroll sideways, at the top and after a full scroll`, async ({
      site,
    }) => {
      await site.open(path);
      expect(await site.horizontalOverflow()).toBe(0);
      await site.scrollThroughPage();
      expect(await site.horizontalOverflow()).toBe(0);
    });
  }

  test('every header control sits fully inside the viewport', async ({ site, page }) => {
    await site.open('/');
    const inside = await page.evaluate(() =>
      ['.locale-switcher', '#command-palette-button', '#theme-toggle'].map((selector) => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return (
          rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
        );
      }),
    );
    expect(inside).toStrictEqual([true, true, true]);
  });

  test('the theme button is fully inside the viewport in the light theme and in English too', async ({
    site,
  }) => {
    await site.open('/en/');
    await site.themeToggle.click();
    await expect(site.html).toHaveAttribute('data-theme', 'light');
    const inside = await site.themeToggle.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth;
    });
    expect(inside).toBe(true);
    expect(await site.horizontalOverflow()).toBe(0);
  });
});
