import { test, expect } from './support/fixtures.js';
import { AxeAudit } from './support/axe-audit.js';
import { DictionaryText } from './support/dictionary-text.js';

const PT_BR = DictionaryText.of('pt-BR');
const EN_US = DictionaryText.of('en-US');

test.describe('accessibility (axe-core)', () => {
  for (const theme of ['dark', 'light']) {
    for (const [language, path] of [
      ['Portuguese', '/'],
      ['English', '/en/'],
    ]) {
      test(`${language} page, ${theme} theme: no axe violation`, async ({ site, page }) => {
        await AxeAudit.useTheme(page, theme);
        await site.open(path);
        await expect(site.html).toHaveAttribute('data-theme', theme);
        expect(await AxeAudit.run(page)).toStrictEqual([]);
      });
    }
  }

  test('aria-label sits on an element that allows it', async ({ site, page }) => {
    await site.open('/');
    expect(await AxeAudit.run(page, { onlyRules: ['aria-prohibited-attr'] })).toStrictEqual([]);
  });

  test('every scrollable region can be reached with the keyboard', async ({ site, page }) => {
    await site.open('/');
    expect(await AxeAudit.run(page, { onlyRules: ['scrollable-region-focusable'] })).toStrictEqual(
      [],
    );
  });

  for (const [language, path, dictionary] of [
    ['Portuguese', '/', PT_BR],
    ['English', '/en/', EN_US],
  ]) {
    test(`the rotating figures, the map, the terminal and the command list have exact roles and names in ${language}`, async ({
      site,
      page,
    }) => {
      await site.open(path);
      const rotating = page.locator('.rotating-text');
      await expect(rotating).toHaveAttribute('role', 'img');
      await expect(rotating).toHaveAttribute('aria-label', dictionary.hero.rotating.label);
      const map = page.locator('.architecture-canvas');
      await expect(map).toHaveAttribute('role', 'region');
      await expect(map).toHaveAttribute('tabindex', '0');
      await expect(map).toHaveAttribute('aria-label', dictionary.architecture.canvas);
      const terminal = page.locator('#load-test-terminal');
      await expect(terminal).toHaveAttribute('role', 'log');
      await expect(terminal).toHaveAttribute('tabindex', '0');
      await expect(terminal).toHaveAttribute('aria-label', dictionary.loadTest.terminalLabel);
      await expect(page.locator('#command-palette-list')).toHaveAttribute(
        'aria-label',
        dictionary.palette.list,
      );
    });
  }

  test('the map and the terminal take keyboard focus, so their sideways scroll works without a mouse', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await page.locator('.architecture-canvas').focus();
    await expect(page.locator('.architecture-canvas')).toBeFocused();
    await page.locator('#load-test-terminal').focus();
    await expect(page.locator('#load-test-terminal')).toBeFocused();
  });

  for (const theme of ['dark', 'light']) {
    test(`text contrast reaches the WCAG minimum in the ${theme} theme, in both languages`, async ({
      site,
      page,
    }) => {
      await AxeAudit.useTheme(page, theme);
      await site.open('/');
      expect(await AxeAudit.run(page, { onlyRules: ['color-contrast'] })).toStrictEqual([]);
      await site.open('/en/');
      expect(await AxeAudit.run(page, { onlyRules: ['color-contrast'] })).toStrictEqual([]);
    });
  }

  test.describe('after a full load test run (desktop)', () => {
    test.skip(({ isMobile }) => isMobile, 'the full run takes 20 s of CPU, so one project runs it');

    for (const theme of ['dark', 'light']) {
      test(`the terminal output and the summary stay readable and reachable in the ${theme} theme`, async ({
        site,
        page,
      }) => {
        test.setTimeout(150_000);
        await AxeAudit.useTheme(page, theme);
        await site.open('/');
        await site.jumpTo('carga');
        await expect(site.loadTestState).toHaveText(PT_BR.loadTest.states.done, {
          timeout: 90_000,
        });
        expect(
          await AxeAudit.run(page, {
            onlyRules: ['color-contrast', 'scrollable-region-focusable'],
          }),
        ).toStrictEqual([]);
      });
    }
  });

  test('the page has a language, a title, one h1 and a skip link that leads to the main content', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await expect(site.html).toHaveAttribute('lang', 'pt-BR');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('a.skip-link')).toHaveAttribute('href', '#main');
    await expect(page.locator('main#main')).toHaveCount(1);
  });

  test('the first Tab stop is the skip link', async ({ site, page }) => {
    await site.open('/');
    await page.keyboard.press('Tab');
    await expect(page.locator('a.skip-link')).toBeFocused();
  });

  test('the open command palette has no axe violation', async ({ site, page }) => {
    await site.open('/');
    await site.openPalette();
    expect(await AxeAudit.run(page)).toStrictEqual([]);
    await expect(site.paletteInput).toHaveAttribute('aria-controls', 'command-palette-list');
    await expect(page.locator('#command-palette-list')).toHaveAttribute('role', 'listbox');
  });

  test('the palette list of commands has an accessible name', async ({ site, page }) => {
    await site.open('/');
    await site.openPalette();
    expect(await AxeAudit.run(page, { onlyRules: ['aria-input-field-name'] })).toStrictEqual([]);
  });

  /** The page in the states a visitor can leave it in, each opened the way a visitor would. */
  const STATES = [
    [
      'the shader dialog open',
      async ({ site, page }) => {
        await site.openPalette();
        await site.paletteInput.fill(PT_BR.palette.commands.shader.title);
        await site.paletteInput.press('Enter');
        await expect(page.locator('#shader-dialog')).toBeVisible();
      },
    ],
    [
      'a trace span selected',
      async ({ site, page }) => {
        await site.centerOn('#trace-rows');
        await page.locator('#trace-rows').focus();
        await page.keyboard.press('ArrowDown');
        await expect(page.locator('#trace-span-0')).toHaveAttribute('aria-selected', 'true');
      },
    ],
    [
      'the trace zoomed',
      async ({ site, page }) => {
        await site.centerOn('#trace-rows');
        await page.getByRole('button', { name: PT_BR.trace.zoomIn, exact: true }).click();
        await expect(page.locator('#trace-reset')).toBeVisible();
      },
    ],
    [
      'the second job card open',
      async ({ site }) => {
        await site.jobHeaders.nth(1).click();
        await expect(site.jobHeaders.nth(1)).toHaveAttribute('aria-expanded', 'true');
      },
    ],
    [
      'every job card closed',
      async ({ site, isMobile }) => {
        test.skip(
          !isMobile,
          'on a wide screen the open card stays open: a card closes only on a narrow one',
        );
        await site.jobHeaders.nth(0).click();
        await expect(site.jobHeaders.nth(0)).toHaveAttribute('aria-expanded', 'false');
      },
    ],
    [
      'the service list of the map open',
      async ({ page }) => {
        await page.getByText(PT_BR.architecture.list.summary, { exact: true }).click();
        await expect(page.locator('#architecture-list-body dt').first()).toBeVisible();
      },
    ],
    [
      'the table of the dashboard open',
      async ({ page }) => {
        await page.getByText(PT_BR.dashboard.table.summary, { exact: true }).click();
        await expect(page.locator('#dashboard-table-body tr').first()).toBeVisible();
      },
    ],
    [
      'motion paused',
      async ({ page }) => {
        await page.getByRole('button', { name: PT_BR.nav.motionLabel, exact: true }).click();
        await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
      },
    ],
    [
      'a service of the map explained',
      async ({ site, isMobile }) => {
        test.skip(isMobile, 'there is no hover on a touch device');
        await site.centerOn('#architecture');
        await site.architectureNode('ledger').hover();
        await expect(site.architectureTooltip).toBeVisible();
      },
    ],
  ];

  for (const theme of ['dark', 'light']) {
    for (const [name, openState] of STATES) {
      test(`${name}, ${theme} theme: no axe violation at WCAG 2.2 AA`, async ({
        site,
        page,
        isMobile,
      }) => {
        await AxeAudit.useTheme(page, theme);
        await site.open('/');
        await openState({ site, page, isMobile });
        expect(await AxeAudit.run(page)).toStrictEqual([]);
      });
    }
  }
});
