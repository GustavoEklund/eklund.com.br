import { test, expect } from './support/fixtures.js';
import { AxeAudit } from './support/axe-audit.js';
import { DictionaryText } from './support/dictionary-text.js';
import { ContrastSweep } from '../../tools/contrast-sweep.mjs';
import { ContrastTargets } from '../../source/js/shared/contrast-targets.js';

const THEMES = ['dark', 'light'];
const PT_BR = DictionaryText.of('pt-BR').status.checks.contrast;
const EN_US = DictionaryText.of('en-US').status.checks.contrast;

/** What a measurement leaves to report: [theme, hue, kind, label, ratio] of every pair under its minimum, and what was left unjudged. */
const problems = (theme, results) =>
  results.flatMap((result) => [
    ...result.failing.map((pair) => [
      theme,
      result.hue,
      pair.kind,
      pair.labels.join(' | '),
      pair.ratio,
    ]),
    ...(result.skipped ? [[theme, result.hue, 'skipped', String(result.skipped), 0]] : []),
  ]);

/** The numbers in the contrast row, read back with the dictionary's own sentence; null while the row says something else. */
const readRow = (detail, entry) => {
  try {
    return DictionaryText.extract(entry.detail, detail);
  } catch {
    return null;
  }
};

test.describe('WCAG 2.2 contrast', () => {
  for (const theme of THEMES) {
    test.describe(`${theme} theme`, () => {
      test.beforeEach(async ({ page }) => {
        await AxeAudit.useTheme(page, theme);
      });

      test('every text and component pair reaches AA at every third hue from 0 to 360, and at the default hue', async ({
        site,
        page,
        isMobile,
      }) => {
        test.skip(
          isMobile,
          'the colors do not depend on the viewport; the desktop project sweeps them',
        );
        test.setTimeout(180_000);
        await site.open('/');
        const sweep = new ContrastSweep(page);
        await sweep.prepare();
        const results = await sweep.sweep({ theme, hues: ContrastSweep.hues(3) });
        expect(results.map((result) => result.hue)).toStrictEqual(ContrastSweep.hues(3));
        expect(problems(theme, results)).toStrictEqual([]);
        expect(
          results.filter((result) => result.count < 40).map((result) => result.hue),
        ).toStrictEqual([]);
      });

      for (const [language, path] of [
        ['Portuguese', '/'],
        ['English', '/en/'],
      ]) {
        test(`the ${language} page reaches AA at the hues that are hardest on it`, async ({
          site,
          page,
        }) => {
          await site.open(path);
          const sweep = new ContrastSweep(page);
          await sweep.prepare();
          expect(
            problems(
              theme,
              await sweep.sweep({ theme, hues: [0, 30, 60, 128, 195, 260, 300, 360] }),
            ),
          ).toStrictEqual([]);
        });
      }

      test('the page measures every kind of thing it claims to: each component target finds its element', async ({
        site,
        page,
        isMobile,
      }) => {
        test.skip(isMobile, 'the custom scrollbar only exists with a fine pointer');
        await site.open('/');
        const sweep = new ContrastSweep(page);
        await sweep.prepare();
        for (const selector of ['#chart-throughput', '#trace-rows']) await site.centerOn(selector); // the charts and the trace draw when they scroll into view
        const { labels, count } = await sweep.measure();
        const wanted = [
          ...ContrastTargets.COMPONENTS.map((target) => target.label),
          ...ContrastTargets.TOKENS.map((pair) => pair.label),
        ];
        expect(wanted.filter((label) => !labels.includes(label))).toStrictEqual([]);
        expect(count > 40).toBe(true);
      });
    });
  }
});

test.describe('WCAG 2.2 contrast in the states of the page', () => {
  test.skip(({ isMobile }) => isMobile, 'hover and the open overlays are desktop states');

  for (const theme of THEMES) {
    test.describe(`${theme} theme`, () => {
      let sweep;

      test.beforeEach(async ({ site, page }) => {
        await AxeAudit.useTheme(page, theme);
        await site.open('/');
        sweep = new ContrastSweep(page);
        await sweep.prepare();
      });

      const expectNoProblems = async () =>
        expect(problems(theme, [{ hue: 128, ...(await sweep.measure()) }])).toStrictEqual([]);

      test('the open command palette: the field, the list and the selected command', async ({
        site,
      }) => {
        await site.openPalette();
        await expect(site.paletteSelected).toHaveCount(1);
        await expectNoProblems();
      });

      test('the skip link, the first thing a keyboard visitor sees', async ({ page }) => {
        await page.keyboard.press('Tab');
        await expect(page.locator('a.skip-link')).toBeFocused();
        await expectNoProblems();
      });

      for (const [name, selector] of [
        ['the primary button', '.hero-actions .btn:not(.btn-ghost)'],
        ['the ghost button', '.hero-actions .btn-ghost'],
        ['a navigation link', '.nav-link >> nth=1'],
        ['the language that is not current', '.locale-switcher a:not([aria-current])'],
        ['the outline button', '#architecture-follow'],
        ['the shader button', '#shader-button'],
      ]) {
        test(`hovering ${name}`, async ({ page }) => {
          await page.locator(selector).hover();
          await expectNoProblems();
        });
      }

      test('a trace row that is selected, and one under the pointer', async ({ site, page }) => {
        await site.centerOn('#trace-rows');
        await expect(page.locator('#trace-rows [role=option]').first()).toBeVisible();
        await page.locator('#trace-rows').focus();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await expect(page.locator('.trace-row.is-selected')).toHaveCount(1);
        await page.locator('#trace-rows [role=option]').nth(5).hover();
        await expectNoProblems();
      });

      test('the architecture tooltip over a node', async ({ site }) => {
        await site.centerOn('#architecture-svg');
        await site.architectureNodes.first().hover();
        await expect(site.architectureTooltip).toBeVisible();
        await expectNoProblems();
      });

      test('the Pix walkthrough caption', async ({ site }) => {
        await site.centerOn('#architecture-svg');
        await site.followButton.click();
        await expect(site.architectureCaption).toBeVisible();
        await expectNoProblems();
      });

      test('the toast that confirms the copied e-mail', async ({ site }) => {
        await site.heroEmailButton.click();
        await expect(site.copiedToast).toBeVisible();
        await expectNoProblems();
      });

      test('the shader dialog with its highlighted source', async ({ page }) => {
        await page.locator('#shader-button').click();
        await expect(page.locator('#shader-dialog')).toBeVisible();
        await expectNoProblems();
      });

      test('every kind of terminal line, the cursor and the summary of the load test', async ({
        site,
        page,
      }) => {
        await site.jumpTo('carga');
        await page.evaluate(() => {
          const lines = [
            ['command', 'k6 run <b>pix</b>'],
            ['info', 'info <em>emphasis</em> <code>code</code>'],
            ['dim', 'dim line'],
            ['running', 'running <em>12s</em> 60%  <b>10</b> Pix'],
            ['ok', '<b>payload</b> 10 ok'],
            ['fail', 'failed <b>check</b>'],
            ['metric', '<b>pix_processed</b> 10 · <em>5/s</em>'],
          ];
          const output = document.querySelector('.terminal-output');
          for (const [kind, html] of lines) {
            const line = document.createElement('div');
            line.className = `terminal-line is-${kind}`;
            line.innerHTML = `<time>10:00:00</time><i aria-hidden="true"></i><span>${html}</span>`;
            output.append(line);
          }
          document.querySelector('.terminal-cursor').classList.add('is-blinking');
          document.querySelector('.load-test').classList.add('is-running', 'is-done');
        });
        await expectNoProblems();
        const { labels } = await sweep.measure();
        expect(
          ['span.terminal-command::before', 'time'].filter((label) => !labels.includes(label)),
        ).toStrictEqual([]);
      });
    });
  }
});

test.describe('the contrast row of the status page', () => {
  const row = (page) => page.locator('#status-components li').nth(7);

  test('is the last component, named from the dictionary, and reports a measurement of the page', async ({
    site,
    page,
  }) => {
    await site.open('/');
    const detail = row(page).locator('small');
    await expect(row(page).locator('b')).toHaveText(PT_BR.name);
    await expect(detail).not.toHaveText(PT_BR.measuring, { timeout: 20_000 });
    const line = await detail.textContent();
    const reading = readRow(line, PT_BR);
    expect(DictionaryText.plain(PT_BR.detail, reading)).toBe(line);
    expect([
      reading.passing === reading.pairs,
      Number(reading.pairs) > 40,
      Number(reading.text.replace(',', '.')) >= 4.5,
      Number(reading.component.replace(',', '.')) >= 3,
      reading.theme,
      reading.hue,
    ]).toStrictEqual([true, true, true, true, 'escuro', '128']);
    await expect(row(page).locator('.status-badge')).toHaveAttribute('data-level', '0');
  });

  test('speaks English with decimal points when the language is switched', async ({
    site,
    page,
  }) => {
    await site.open('/en/');
    const detail = row(page).locator('small');
    await expect(row(page).locator('b')).toHaveText(EN_US.name);
    await expect(detail).not.toHaveText(EN_US.measuring, { timeout: 20_000 });
    const line = await detail.textContent();
    const reading = readRow(line, EN_US);
    expect(DictionaryText.plain(EN_US.detail, reading)).toBe(line);
    expect([
      /^\d+\.\d\d$/.test(reading.text),
      /^\d+\.\d\d$/.test(reading.component),
      reading.theme,
    ]).toStrictEqual([true, true, 'dark']);
  });

  test('measures again after the theme is switched, and after the hue is changed', async ({
    site,
    page,
  }) => {
    test.setTimeout(90_000);
    await site.open('/');
    const detail = row(page).locator('small');
    await expect(detail).not.toHaveText(PT_BR.measuring, { timeout: 20_000 });
    await site.themeToggle.click();
    await expect
      .poll(async () => readRow(await detail.textContent(), PT_BR)?.theme, { timeout: 20_000 })
      .toBe('claro');
    // The first reading after the switch is the one a visitor sees: sections below the fold must have their new colors in it too.
    const switched = readRow(await detail.textContent(), PT_BR);
    expect([
      switched.passing === switched.pairs,
      Number(switched.text.replace(',', '.')) >= 4.5,
      Number(switched.component.replace(',', '.')) >= 3,
    ]).toStrictEqual([true, true, true]);
    await expect(row(page).locator('.status-badge')).toHaveAttribute('data-level', '0');
    await page.evaluate(() => window.eklund.theme.setHue(200));
    await expect
      .poll(async () => readRow(await detail.textContent(), PT_BR)?.hue, { timeout: 20_000 })
      .toBe('200');
    const reading = readRow(await detail.textContent(), PT_BR);
    expect([
      reading.theme,
      reading.passing === reading.pairs,
      Number(reading.text.replace(',', '.')) >= 4.5,
      Number(reading.component.replace(',', '.')) >= 3,
    ]).toStrictEqual(['claro', true, true, true]);
    await expect(row(page).locator('.status-badge')).toHaveAttribute('data-level', '0');
  });
});
