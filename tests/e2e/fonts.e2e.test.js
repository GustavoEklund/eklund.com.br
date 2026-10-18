import { test, expect } from './support/fixtures.js';
import { PageHealth } from './support/page-health.js';
import { LayoutShiftMeter } from './support/layout-shift-meter.js';
import { DictionaryText } from './support/dictionary-text.js';
import { SiteRoot } from './support/site-root.js';

const FONTS_CHECK = DictionaryText.of('pt-BR').status.checks.fonts;
const LATIN_FILES = [
  'bricolage-grotesque-latin',
  'instrument-serif-italic-latin',
  'jetbrains-mono-latin',
].map((name) => SiteRoot.fontPath(name));
/** The worst swap the page may make when the fonts arrive after the page is shown. Core Web Vitals call 0.1 good; the stand-ins keep it near a tenth of that. */
const SLOW_FONT_SHIFT_LIMIT = 0.02;
const FONT_DELAY_MS = 2500; // longer than the 1.8 s the hero waits for fonts, so the page is revealed in the stand-ins first

/** The families whose files are loaded, as "family style", without the stand-in faces. */
const loadedFaces = (page) =>
  page.evaluate(() =>
    [...document.fonts]
      .filter((face) => face.status === 'loaded' && !face.family.endsWith(' Fallback'))
      .map((face) => `${face.family.replaceAll('"', '')} ${face.style}`)
      .sort(),
  );

test.describe('self-hosted fonts', () => {
  test('are the only font requests of a page load: three WOFF2 files from this host, each fetched once, nothing from anywhere else', async ({
    site,
    page,
    health,
  }) => {
    const requested = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.endsWith('.woff2')) requested.push(pathname);
    });
    await site.open('/');
    await page.waitForLoadState('networkidle');
    expect(requested.sort()).toStrictEqual(LATIN_FILES);
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('arrive as font/woff2 with a WOFF2 signature', async ({ page }) => {
    const responses = await Promise.all(
      LATIN_FILES.map(async (path) => {
        const response = await page.request.get(path);
        return [
          path,
          response.status(),
          response.headers()['content-type'],
          (await response.body()).subarray(0, 4).toString('latin1'),
        ];
      }),
    );
    expect(responses).toStrictEqual(LATIN_FILES.map((path) => [path, 200, 'font/woff2', 'wOF2']));
  });

  test('draw the page: Bricolage Grotesque, Instrument Serif and JetBrains Mono are loaded, and the Greek file waits for a sigma', async ({
    site,
    page,
  }) => {
    await site.open('/');
    expect(await loadedFaces(page)).toStrictEqual([
      'Bricolage Grotesque normal',
      'Instrument Serif italic',
      'JetBrains Mono normal',
    ]);
    const greek = await page.evaluate(() =>
      [...document.fonts]
        .filter((face) => face.family === 'JetBrains Mono')
        .map((face) => [/^U\+0?370/i.test(face.unicodeRange), face.status]),
    );
    expect(greek).toStrictEqual([
      [false, 'loaded'],
      [true, 'unloaded'],
    ]);
  });

  test('are what the page really uses: the hero name is as wide as the font says, not as the stand-in would make it', async ({
    site,
    page,
  }) => {
    await site.open('/');
    const widths = await page.evaluate(() => {
      const measure = (family) => {
        const probe = document.createElement('span');
        probe.textContent = 'Gustavo Eklund pagamentos';
        probe.style.cssText = `position:absolute;white-space:nowrap;font:800 40px ${family};font-variation-settings:"opsz" 96,"wdth" 88`;
        document.body.append(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        return width;
      };
      return {
        web: measure('"Bricolage Grotesque"'),
        standIn: measure('"Bricolage Grotesque Fallback"'),
        declared: getComputedStyle(document.querySelector('.hero-name'))
          .fontFamily.split(',')[0]
          .replaceAll('"', '')
          .trim(),
      };
    });
    expect([widths.declared, widths.web === widths.standIn]).toStrictEqual([
      'Bricolage Grotesque',
      false,
    ]);
  });

  test('keep the status page honest: the fonts check counts three loaded families and calls itself self-hosted WOFF2', async ({
    site,
  }) => {
    await site.open('/');
    await expect(
      site.page
        .locator('#status-components li')
        .filter({ hasText: FONTS_CHECK.name })
        .locator('small'),
    ).toHaveText(DictionaryText.plain(FONTS_CHECK.detail, { loaded: 3 }));
  });

  test('put the Greek file to work only when the terminal prints a sigma, and then the face loads from this host', async ({
    site,
    page,
  }) => {
    await site.open('/');
    const [response] = await Promise.all([
      page.waitForResponse((candidate) =>
        candidate.url().endsWith(SiteRoot.fontPath('jetbrains-mono-greek')),
      ),
      page.evaluate(() => {
        const probe = document.createElement('span');
        probe.textContent = 'Σ';
        probe.style.fontFamily = 'var(--font-mono)';
        document.body.append(probe);
      }),
    ]);
    expect([response.status(), new URL(response.url()).host]).toStrictEqual([
      200,
      new URL(page.url()).host,
    ]);
  });

  test('make the swap almost invisible even when the fonts arrive late: the page is shown in the stand-ins and the swap shifts under the limit', async ({
    site,
    page,
  }) => {
    await page.route('**/*.woff2', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, FONT_DELAY_MS));
      await route.continue();
    });
    await LayoutShiftMeter.install(page);
    await site.open('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const shifts = await LayoutShiftMeter.shifts(page);
    const total = shifts.reduce((sum, shift) => sum + shift.value, 0);
    expect([await loadedFaces(page), total < SLOW_FONT_SHIFT_LIMIT]).toStrictEqual([
      ['Bricolage Grotesque normal', 'Instrument Serif italic', 'JetBrains Mono normal'],
      true,
    ]);
  });
});
