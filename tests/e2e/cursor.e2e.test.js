import { test, expect } from './support/fixtures.js';
import { PageHealth } from './support/page-health.js';
import { DictionaryText } from './support/dictionary-text.js';
import { TopLayer } from './support/top-layer.js';

const PT_BR = DictionaryText.of('pt-BR');
const CURSOR_ONLY = ['div.cursor-ring', 'div.cursor-dot'];

test.describe('custom cursor (desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'touch screens have no cursor');

  test('the dot follows the pointer exactly', async ({ site, page }) => {
    await site.open('/');
    await page.mouse.move(300, 200);
    expect(await site.cursorDot.evaluate((dot) => dot.style.translate)).toBe(
      'calc(-50% + 300px) calc(-50% + 200px)',
    ); // as the browser serializes it;
    await page.mouse.move(640, 360);
    expect(await site.cursorDot.evaluate((dot) => dot.style.translate)).toBe(
      'calc(-50% + 640px) calc(-50% + 360px)',
    );
  });

  test('the ring turns into a label over a draggable globe and a copyable address, in the page language', async ({
    site,
  }) => {
    await site.open('/');
    await site.heroEmailButton.hover();
    await expect(site.cursorRing).toHaveClass('cursor-ring is-label');
    await expect(site.cursorLabel).toHaveText(PT_BR.cursor.copy);
    await site.globeCanvas.hover();
    await expect(site.cursorRing).toHaveClass('cursor-ring is-label');
    await expect(site.cursorLabel).toHaveText(PT_BR.cursor.drag);
  });

  test('the ring stretches over links, sticks to icon buttons and goes back to plain on empty space', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await site.navLink('perfil').hover();
    await expect(site.cursorRing).toHaveClass('cursor-ring is-link');
    await site.themeToggle.hover();
    await expect(site.cursorRing).toHaveClass('cursor-ring is-stuck');
    const buttonWidth = await site.themeToggle.evaluate(
      (button) => button.getBoundingClientRect().width,
    );
    await expect(site.cursorRing).toHaveCSS('width', `${buttonWidth + 14}px`); // the ring hugs the button with 7 px around it
    await page.mouse.move(2, 600); // the empty margin left of the hero, with nothing under it
    await expect(site.cursorRing).toHaveClass('cursor-ring');
  });

  test('stays in the top layer above a modal dialog: the command palette', async ({
    site,
    page,
    health,
  }) => {
    await site.open('/');
    const topLayer = await TopLayer.attach(page);
    expect(await topLayer.elements()).toStrictEqual(CURSOR_ONLY);

    await site.openPalette();
    expect(await topLayer.elements()).toStrictEqual(['dialog#command-palette', ...CURSOR_ONLY]);

    await page.keyboard.press('Escape');
    await expect(site.palette).toBeHidden();
    expect(await topLayer.elements()).toStrictEqual(CURSOR_ONLY);
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('stays in the top layer above the other modal dialog: the shader code', async ({
    site,
    page,
  }) => {
    await site.open('/');
    const topLayer = await TopLayer.attach(page);
    await page.locator('#shader-button').click();
    await expect(page.locator('#shader-dialog')).toBeVisible();
    expect(await topLayer.elements()).toStrictEqual(['dialog#shader-dialog', ...CURSOR_ONLY]);
    await page.locator('#shader-close').click();
    await expect(page.locator('#shader-dialog')).toBeHidden();
    expect(await topLayer.elements()).toStrictEqual(CURSOR_ONLY);
  });

  test('keeps its popovers after the dialog was opened and closed several times', async ({
    site,
    page,
  }) => {
    await site.open('/');
    const topLayer = await TopLayer.attach(page);
    for (let round = 0; round < 3; round++) {
      await site.openPalette();
      expect(await topLayer.elements()).toStrictEqual(['dialog#command-palette', ...CURSOR_ONLY]);
      await page.keyboard.press('Escape');
      await expect(site.palette).toBeHidden();
    }
    expect(await topLayer.elements()).toStrictEqual(CURSOR_ONLY);
  });
});

test.describe('custom cursor (touch)', () => {
  test.skip(({ isMobile }) => !isMobile, 'covered above for fine pointers');

  test('is off, and only the dialog itself uses the top layer', async ({ site, page }) => {
    await site.open('/');
    const topLayer = await TopLayer.attach(page);
    await expect(site.cursorDot).toBeHidden();
    await expect(site.cursorRing).toBeHidden();
    expect(await topLayer.elements()).toStrictEqual([]);
    await site.openPalette();
    expect(await topLayer.elements()).toStrictEqual(['dialog#command-palette']);
  });
});
