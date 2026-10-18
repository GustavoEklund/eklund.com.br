import { test, expect } from './support/fixtures.js';
import { PageHealth } from './support/page-health.js';
import { DictionaryText } from './support/dictionary-text.js';

const PT_BR = DictionaryText.of('pt-BR');

test.describe('theme', () => {
  test('starts dark', async ({ site }) => {
    await site.open('/');
    await expect(site.html).toHaveAttribute('data-theme', 'dark');
    await expect(site.html).toHaveCSS('color-scheme', 'dark');
    expect(await site.storedValue('theme')).toBe('dark');
  });

  test('the toggle flips between dark and light, and stores the choice', async ({
    site,
    health,
  }) => {
    await site.open('/');
    await site.themeToggle.click();
    await expect(site.html).toHaveAttribute('data-theme', 'light');
    await expect(site.html).toHaveCSS('color-scheme', 'light');
    expect(await site.storedValue('theme')).toBe('light');

    await site.themeToggle.click();
    await expect(site.html).toHaveAttribute('data-theme', 'dark');
    await expect(site.html).toHaveCSS('color-scheme', 'dark');
    expect(await site.storedValue('theme')).toBe('dark');
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('the light theme survives a reload, before the scripts run', async ({ site, page }) => {
    await site.open('/');
    await site.themeToggle.click();
    await expect(site.html).toHaveAttribute('data-theme', 'light');

    await page.goto('/', { waitUntil: 'commit' });
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
    await expect(site.html).toHaveAttribute('data-theme', 'light');
  });

  test('the toggle has an accessible name from the dictionary', async ({ site }) => {
    await site.open('/');
    await expect(site.themeToggle).toHaveAttribute('aria-label', PT_BR.nav.themeLabel);
    await expect(site.themeToggle).toHaveAttribute('title', PT_BR.nav.themeTitle);
  });

  test('the palette command toggles it too', async ({ site, page }) => {
    await site.open('/');
    await site.openPalette();
    await site.paletteInput.fill('tema claro');
    await expect(site.paletteSelected).toHaveText(
      PT_BR.palette.commands.toggleTheme.title + PT_BR.palette.tags.theme,
    );
    await page.keyboard.press('Enter');
    await expect(site.html).toHaveAttribute('data-theme', 'light');
    await expect(site.palette).toBeHidden();
  });
});
