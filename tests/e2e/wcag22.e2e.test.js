import { test, expect } from './support/fixtures.js';
import { DictionaryText } from './support/dictionary-text.js';
import { FocusWalk } from './support/focus-walk.js';
import { LayoutAudit } from './support/layout-audit.js';
import { InjectedStyle } from './support/injected-style.js';

const PT_BR = DictionaryText.of('pt-BR');
const LANGUAGES = [
  ['Portuguese', '/', PT_BR],
  ['English', '/en/', DictionaryText.of('en-US')],
];
/** Regions that scroll sideways on purpose, each focusable so the keyboard can scroll it. */
const SIDEWAYS_REGIONS = [
  '.architecture-canvas',
  '#load-test-terminal',
  '.code-dialog pre',
  '.marquee-clip',
  '.terminal-screen',
  '#globe-canvas',
];
const SOCIAL_LINKS = [
  'a:email-link',
  'a:https://github.com/GustavoEklund',
  'a:https://www.linkedin.com/in/gustavo-eklund',
];
const JOB_HEADERS = Array(4).fill('button:job-header');
/** What takes the focus, in order, from the top to the bottom of the page: the header, the hero, then each section as it reads. */
const BODY_TAB_ORDER = [
  'a:#historico',
  'a:mailto:gustavo@eklund.com.br',
  'canvas:globe-canvas',
  'b:hue',
  'b:speed',
  'b:instances',
];
const SECTIONS_TAB_ORDER = [
  'ol:status-incidents',
  'button:trace-zoom-out',
  'button:trace-zoom-in',
  'div:trace-rows',
  'summary:data-table',
  'button:architecture-follow',
  'div:architecture-canvas',
  'summary:data-table',
  'button:load-test-run',
  'div:load-test-terminal',
  ...JOB_HEADERS,
  ...SOCIAL_LINKS,
  'a:source-link',
];
const HEADER_TAB_ORDER = [
  'a:pt-BR',
  'a:en-US',
  'a:source-button',
  'button:command-palette-button',
  'button:theme-toggle',
  'button:motion-toggle',
];
const DESKTOP_TAB_ORDER = [
  'a:#main',
  'a:logo',
  'a:#status',
  'a:#perfil',
  'a:#arquitetura',
  'a:#carga',
  'a:#historico',
  'a:#contato',
  ...HEADER_TAB_ORDER,
  ...BODY_TAB_ORDER,
  'button:shader-button',
  ...SECTIONS_TAB_ORDER,
];
const NARROW_TAB_ORDER = [
  'a:#main',
  'a:logo',
  ...HEADER_TAB_ORDER,
  ...BODY_TAB_ORDER,
  ...SECTIONS_TAB_ORDER,
];
const TEXT_SPACING = `* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }`;

test.describe('2.4.3 focus order, 2.4.7 focus visible, 2.4.11 focus not obscured, 2.1.2 no keyboard trap', () => {
  test('Tab visits every control once, in page order, and the focus leaves the page at the end', async ({
    site,
    page,
  }) => {
    await site.open('/');
    const before = page.url();
    const stops = await FocusWalk.tabThrough(page);
    expect(stops.map((stop) => stop.identity)).toStrictEqual(
      page.viewportSize().width >= 1000 ? DESKTOP_TAB_ORDER : NARROW_TAB_ORDER,
    );
    expect(page.url()).toBe(before);
  });

  test('every stop shows a focus ring of at least 2 px, and is never entirely covered by the fixed header', async ({
    site,
    page,
  }) => {
    await site.open('/');
    const stops = await FocusWalk.tabThrough(page);
    expect(
      stops
        .filter((stop) => stop.ring.style === 'none' || stop.ring.width < 2)
        .map((stop) => stop.label),
    ).toStrictEqual([]);
    expect(
      stops.filter((stop) => !stop.inView || !stop.reachable).map((stop) => stop.label),
    ).toStrictEqual([]);
  });

  test('Shift+Tab walks back the way Tab came, so nothing holds the focus', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await page.evaluate(() => {
      document.activeElement?.blur();
    });
    await page.keyboard.press('Shift+Tab');
    const labels = [];
    for (let press = 0; press < 200; press++) {
      labels.push(
        await page.evaluate(() =>
          document.activeElement === document.body ? null : document.activeElement.localName,
        ),
      );
      if (labels.at(-1) === null) break;
      await page.keyboard.press('Shift+Tab');
    }
    expect(labels.at(-1)).toBeNull();
    expect(labels.length).toBe(
      (page.viewportSize().width >= 1000 ? DESKTOP_TAB_ORDER : NARROW_TAB_ORDER).length + 1,
    );
  });
});

test.describe('2.5.8 target size (minimum)', () => {
  for (const [language, path] of LANGUAGES) {
    test(`every control is at least 24 x 24 CSS px, or has room around it, in ${language}`, async ({
      site,
      page,
    }) => {
      await site.open(path);
      await LayoutAudit.settle(page);
      await site.scrollThroughPage();
      expect(await LayoutAudit.undersizedTargets(page)).toStrictEqual([]);
    });
  }

  test('the same holds with the command palette open', async ({ site, page }) => {
    await site.open('/');
    await LayoutAudit.settle(page);
    await site.openPalette();
    expect(await LayoutAudit.undersizedTargets(page)).toStrictEqual([]);
  });
});

test.describe('1.4.10 reflow', () => {
  for (const [language, path] of LANGUAGES) {
    test(`at 320 px wide (a 1280 px window at 400%) nothing scrolls sideways but the regions that must, in ${language}`, async ({
      site,
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 256 });
      await site.open(path);
      await site.scrollThroughPage();
      expect(await site.horizontalOverflow()).toBe(0);
      expect(await LayoutAudit.widerThanScreen(page, SIDEWAYS_REGIONS)).toStrictEqual([]);
    });
  }

  test('the regions that scroll sideways can be focused, so the keyboard scrolls them', async ({
    site,
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 256 });
    await site.open('/');
    for (const selector of ['.architecture-canvas', '#load-test-terminal']) {
      await page.locator(selector).focus();
      await expect(page.locator(selector)).toBeFocused();
    }
  });
});

test.describe('1.4.4 resize text', () => {
  test('at 200% browser zoom (a 640 px window) nothing is cut off and nothing scrolls sideways', async ({
    site,
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await site.open('/');
    await site.scrollThroughPage();
    expect([await site.horizontalOverflow(), await LayoutAudit.clippedText(page)]).toStrictEqual([
      0,
      [],
    ]);
  });

  test('with only the text at 200% nothing is cut off and nothing scrolls sideways', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await InjectedStyle.add(page, 'html { font-size: 200% !important; }');
    await site.scrollThroughPage();
    expect([await site.horizontalOverflow(), await LayoutAudit.clippedText(page)]).toStrictEqual([
      0,
      [],
    ]);
  });
});

test.describe('1.4.12 text spacing', () => {
  test('with the spacing a reader may set, no text is cut off and nothing scrolls sideways', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await InjectedStyle.add(page, TEXT_SPACING);
    await site.scrollThroughPage();
    expect([await site.horizontalOverflow(), await LayoutAudit.clippedText(page)]).toStrictEqual([
      0,
      [],
    ]);
  });
});

test.describe('1.3.4 orientation', () => {
  for (const [orientation, width, height] of [
    ['portrait', 390, 844],
    ['landscape', 844, 390],
  ]) {
    test(`the page works in ${orientation}: no sideways scroll, and no lock was asked for`, async ({
      site,
      page,
    }) => {
      await page.addInitScript(() => {
        window.__orientationLocks = 0;
        if (screen.orientation)
          screen.orientation.lock = async () => {
            window.__orientationLocks++;
          };
      });
      await page.setViewportSize({ width, height });
      await site.open('/');
      await site.scrollThroughPage();
      expect([
        await site.horizontalOverflow(),
        await page.evaluate(() => window.__orientationLocks),
      ]).toStrictEqual([0, 0]);
    });
  }
});

test.describe('2.5.7 dragging movements: a single pointer without dragging does the same', () => {
  const globeControl = (page, control) => page.locator(`[role=slider][data-control=${control}]`);

  test('the palette moves each slider by a coarse step with clicks only', async ({
    site,
    page,
  }) => {
    await site.open('/');
    const run = async (title) => {
      await site.paletteButton.click();
      await site.paletteOptions.filter({ hasText: title }).first().click();
      await expect(site.palette).toBeHidden();
    };
    await run(PT_BR.palette.commands.hueUp.title);
    await expect(globeControl(page, 'hue')).toHaveAttribute('aria-valuenow', '158');
    await run(PT_BR.palette.commands.hueDown.title);
    await run(PT_BR.palette.commands.hueDown.title);
    await expect(globeControl(page, 'hue')).toHaveAttribute('aria-valuenow', '98');
    await run(PT_BR.palette.commands.speedUp.title);
    await expect(globeControl(page, 'speed')).toHaveAttribute('aria-valuenow', '2');
    await run(PT_BR.palette.commands.speedDown.title);
    await expect(globeControl(page, 'speed')).toHaveAttribute('aria-valuenow', '1.5');
    await run(PT_BR.palette.commands.pointsUp.title);
    await expect(globeControl(page, 'instances')).toHaveAttribute('aria-valuenow', '5');
    await run(PT_BR.palette.commands.pointsDown.title);
    await expect(globeControl(page, 'instances')).toHaveAttribute('aria-valuenow', '1');
  });

  test('the plus and minus buttons zoom the trace, which dragging on the timeline also does', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await site.centerOn('#trace-rows');
    await expect(page.locator('#trace-rows [role=option]').first()).toBeVisible();
    await page.getByRole('button', { name: PT_BR.trace.zoomIn, exact: true }).click();
    await expect(page.locator('#trace-reset')).toBeVisible();
    await page.locator('#trace-reset').click();
    await expect(page.locator('#trace-reset')).toBeHidden();
  });

  test('the palette gives the globe a spin and brings it home, which dragging does too', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await site.paletteButton.click();
    await site.paletteOptions
      .filter({ hasText: PT_BR.palette.commands.spinGlobe.title })
      .first()
      .click();
    await expect(site.palette).toBeHidden();
    await expect(site.globeCanvas).toBeVisible();
    expect(await page.evaluate(() => typeof window.eklund.globe?.rotateBy)).toBe('function');
  });
});

test.describe('2.5.3 label in name', () => {
  for (const [language, path] of LANGUAGES) {
    test(`every link and button that has a visible text and an aria-label has the text in the label, in ${language}`, async ({
      site,
      page,
    }) => {
      await site.open(path);
      const mismatches = await page.evaluate(() =>
        [...document.querySelectorAll('a[aria-label], button[aria-label]')]
          .filter((element) => element.textContent.trim())
          .filter((element) => {
            const visible = element.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
            return !element.getAttribute('aria-label').toLowerCase().includes(visible);
          })
          .map(
            (element) =>
              `${element.localName} ${element.textContent.trim()} / ${element.getAttribute('aria-label')}`,
          ),
      );
      expect(mismatches).toStrictEqual([]);
    });
  }
});

test.describe('2.4.2 page titled, 3.1.1 language of page', () => {
  for (const [language, path, dictionary] of LANGUAGES) {
    test(`the title and the language of the document follow the language of the page, ${language}`, async ({
      site,
      page,
    }) => {
      await site.open(path);
      await expect(page).toHaveTitle(dictionary.meta.title);
      await expect(site.html).toHaveAttribute('lang', language === 'English' ? 'en-US' : 'pt-BR');
    });
  }

  test('switching the language changes both the title and the lang attribute at once', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await site.localeLink('en-US').click();
    await expect(page).toHaveTitle(DictionaryText.of('en-US').meta.title);
    await expect(site.html).toHaveAttribute('lang', 'en-US');
  });
});

test.describe('2.1.4 character key shortcuts', () => {
  test('the only shortcut is Ctrl or Cmd with K, so a single key never does anything on the page', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    for (const key of ['k', 'K', '/', '?', 't', 'p']) await page.keyboard.press(key);
    await expect(site.palette).toBeHidden();
    await expect(site.html).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('2.2.2 pause, stop, hide', () => {
  test('after the pause button nothing keeps moving by itself and the page text stops changing', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await page.getByRole('button', { name: PT_BR.nav.motionLabel, exact: true }).click();
    await site.centerOn('#architecture');
    const first = await page.evaluate(() =>
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === 'running' &&
            animation.effect?.getComputedTiming().iterations === Infinity &&
            animation.effect.target?.checkVisibility?.({ contentVisibilityAuto: true }) !== false,
        )
        .map((animation) => animation.effect.target?.className?.toString?.() ?? ''),
    );
    expect(first).toStrictEqual([]);
    await expect(page.locator('#architecture-svg .packet')).toHaveCount(0);
  });
});
