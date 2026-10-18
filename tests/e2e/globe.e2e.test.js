import { test, expect } from './support/fixtures.js';
import { PageHealth } from './support/page-health.js';
import { DictionaryText } from './support/dictionary-text.js';
import { GlobePixels } from './support/globe-pixels.js';
import { LandDecoder } from '../../source/js/globe/land-decoder.js';
import { LAND_RING_COUNT, LAND_BITSET_BASE64 } from '../../source/js/globe/land-bitset.js';

const PT_BR = DictionaryText.of('pt-BR');
const LAND_DOTS = new LandDecoder({
  ringCount: LAND_RING_COUNT,
  bitsetBase64: LAND_BITSET_BASE64,
}).decode().count;

test.describe('globe', () => {
  test.setTimeout(90_000);
  test('is revealed and running on WebGL, not on the fallback', async ({ site, page, health }) => {
    await site.open('/');
    await expect(site.globe).toHaveClass('globe is-revealed');
    expect(await page.evaluate(() => window.eklund.globe !== null)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.eklund.globe.isRunning)).toBe(true);
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('draws one point per land sample, and says so in the language of the page', async ({
    site,
    page,
  }) => {
    await site.open('/');
    expect(await page.evaluate(() => window.eklund.globe.pointCount)).toBe(LAND_DOTS);
    await expect(site.pointsChip).toHaveText(DictionaryText.formatInteger(LAND_DOTS, 'pt-BR'));
    await site.localeLink('en-US').click();
    await expect(site.pointsChip).toHaveText(DictionaryText.formatInteger(LAND_DOTS, 'en-US'));
  });

  test('measures its own frame rate and puts it in the chip', async ({ site, page }) => {
    await site.open('/');
    // The frame rate is a live measurement and the chip copies it every 500 ms, so the value cannot be known in advance:
    // the exact expectation is that the chip equals the globe's own reading (which is never the "—" placeholder while it runs).
    await expect
      .poll(() =>
        page
          .evaluate(() => [
            document.querySelector('#chip-fps').textContent,
            String(window.eklund.globe.frameRate),
          ])
          .then(([chip, measured]) => chip === measured && measured !== '0'),
      )
      .toBe(true);
  });

  test('paints the sphere onto the canvas and leaves the corners clear', async ({ site, page }) => {
    await GlobePixels.install(page);
    await site.open('/');
    // The globe fades in over frames, so on a busy machine it takes longer to be fully opaque at the centre: wait for it.
    await expect
      .poll(async () => (await GlobePixels.corners(page)).center[3], { timeout: 60_000 })
      .toBe(255);
    expect((await GlobePixels.corners(page)).corner).toStrictEqual([0, 0, 0, 0]);
  });

  test('has a text alternative from the dictionary', async ({ site }) => {
    await site.open('/');
    await expect(site.globeCanvas).toHaveAttribute('aria-label', PT_BR.hero.globe);
    await expect(site.globeCanvas).toHaveAttribute('role', 'img');
  });

  test('the shader dialog shows the GLSL source that is running', async ({
    site,
    page,
    isMobile,
  }) => {
    await site.open('/');
    if (isMobile) {
      // the shader button is hidden on narrow screens; the palette command opens the same dialog
      await site.openPalette();
      await site.paletteInput.fill('codigo do globo');
      await expect(site.paletteSelected).toHaveText(
        PT_BR.palette.commands.shader.title + PT_BR.palette.tags.code,
      );
      await page.keyboard.press('Enter');
    } else await page.locator('#shader-button').click();
    await expect(page.locator('#shader-dialog')).toBeVisible();
    await expect(page.locator('#shader-dialog .code-dialog-header span').first()).toHaveText(
      PT_BR.shader.title,
    );
    expect(
      await page
        .locator('#shader-code')
        .evaluate((code) => code.textContent.startsWith('#version 300 es')),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#shader-dialog')).toBeHidden();
  });
});
