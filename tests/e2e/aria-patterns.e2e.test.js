import { test, expect } from './support/fixtures.js';
import { PageHealth } from './support/page-health.js';
import { DictionaryText } from './support/dictionary-text.js';

const PT_BR = DictionaryText.of('pt-BR');
const EN_US = DictionaryText.of('en-US');
const LANGUAGES = [
  ['Portuguese', '/', PT_BR],
  ['English', '/en/', EN_US],
];
const plain = (html) => DictionaryText.plain(html);
const resultsText = (count) =>
  DictionaryText.plain(PT_BR.palette.results[new Intl.PluralRules('pt-BR').select(count)], {
    count,
  });
/** Where the focus is: inside the named dialog, on the browser's own controls (Tab leaves the page and comes back), or on the page behind. */
const focusPlace = (page) =>
  page.evaluate(() =>
    document.activeElement === document.body
      ? 'browser'
      : (document.activeElement.closest('dialog')?.id ?? 'page'),
  );
const sectionNames = (dictionary) => [
  plain(dictionary.status.title),
  plain(dictionary.profile.title),
  plain(dictionary.architecture.title),
  plain(dictionary.loadTest.title),
  plain(dictionary.history.title),
  plain(dictionary.contact.title),
];

test.describe('landmarks, headings and the names of regions', () => {
  for (const [language, path, dictionary] of LANGUAGES) {
    test(`the page has one banner, one navigation, one main and one footer in ${language}`, async ({
      site,
      page,
    }) => {
      await site.open(path);
      await expect(page.getByRole('banner')).toHaveCount(1);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('contentinfo')).toHaveCount(1);
      await expect(
        page.getByRole('navigation', { name: dictionary.nav.main, exact: true }),
      ).toHaveCount(1);
      await expect(
        page.getByRole('complementary', { name: dictionary.profile.board.label, exact: true }),
      ).toHaveCount(1);
    });

    test(`each section is a region named after its heading, and the map canvas is one too, in ${language}`, async ({
      site,
      page,
    }) => {
      await site.open(path);
      for (const name of [
        'Gustavo Eklund',
        ...sectionNames(dictionary),
        dictionary.architecture.canvas,
      ])
        await expect(page.getByRole('region', { name, exact: true })).toHaveCount(1);
      await expect(page.getByRole('region')).toHaveCount(8);
    });

    test(`the headings go h1, then one h2 per section, in ${language}`, async ({ site, page }) => {
      await site.open(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(['Gustavo Eklund']);
      await expect(page.getByRole('heading', { level: 2 })).toHaveText(sectionNames(dictionary));
    });
  }

  test('the footer sits outside the main landmark', async ({ site, page }) => {
    await site.open('/');
    await expect(page.locator('main footer')).toHaveCount(0);
    await expect(page.locator('body > footer')).toHaveCount(1);
  });

  test('the skip link is the first stop, and what follows it is the content, not the header', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await page.keyboard.press('Tab');
    await expect(page.locator('a.skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(page.locator('main a.btn[href="#historico"]')).toBeFocused();
  });
});

test.describe('the buttons that are on or off', () => {
  test('the language links say which language is the current one, and switching moves the mark', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await expect(site.localeLink('pt-BR')).toHaveAttribute('aria-current', 'true');
    await expect(site.localeLink('en-US')).not.toHaveAttribute('aria-current');
    await site.localeLink('en-US').click();
    await expect(site.html).toHaveAttribute('lang', 'en-US');
    await expect(site.localeLink('pt-BR')).not.toHaveAttribute('aria-current');
    await expect(site.localeLink('en-US')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('group', { name: EN_US.nav.language, exact: true })).toHaveCount(1);
  });

  for (const [language, path, dictionary] of LANGUAGES) {
    test(`the theme button keeps one name, ${JSON.stringify(dictionary.nav.themeLabel)}, and its state follows the theme in ${language}`, async ({
      site,
      page,
    }) => {
      await site.open(path);
      const toggle = page.getByRole('button', { name: dictionary.nav.themeLabel, exact: true });
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await expect(site.html).toHaveAttribute('data-theme', 'dark');
      await toggle.click();
      await expect(site.html).toHaveAttribute('data-theme', 'light');
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    });
  }

  test('the theme button starts pressed or not by the theme the visitor saved', async ({
    site,
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'light'));
    await site.open('/');
    await expect(site.themeToggle).toHaveAttribute('aria-pressed', 'false');
  });

  test('the theme command of the palette moves the state of the button too', async ({ site }) => {
    await site.open('/');
    await site.openPalette();
    await site.paletteInput.fill(PT_BR.palette.commands.toggleTheme.title);
    await site.paletteInput.press('Enter');
    await expect(site.themeToggle).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('the globe controls', () => {
  test('are a named group of three sliders and a button', async ({ site, page }) => {
    await site.open('/');
    const group = page.getByRole('group', { name: PT_BR.hero.controls.label, exact: true });
    await expect(group).toHaveCount(1);
    await expect(group.getByRole('slider')).toHaveCount(3);
    await expect(
      group.getByRole('slider', { name: PT_BR.hero.controls.hueAria, exact: true }),
    ).toHaveText('128°');
    await expect(
      group.getByRole('slider', { name: PT_BR.hero.controls.speedAria, exact: true }),
    ).toHaveText('1,5×');
    await expect(
      group.getByRole('slider', { name: PT_BR.hero.controls.pointsAria, exact: true }),
    ).toHaveText('×1');
  });

  const slider = (page, control) => page.locator(`[role=slider][data-control=${control}]`);
  const state = (locator) =>
    locator.evaluate((element) => [
      element.getAttribute('aria-valuemin'),
      element.getAttribute('aria-valuenow'),
      element.getAttribute('aria-valuemax'),
      element.getAttribute('aria-valuetext'),
      element.textContent,
    ]);

  test('the hue slider moves by one degree, ten with Shift, thirty with the Page keys, and to both ends with Home and End', async ({
    site,
    page,
  }) => {
    await site.open('/');
    const hue = slider(page, 'hue');
    await hue.focus();
    expect(await state(hue)).toStrictEqual(['0', '128', '360', '128°', '128°']);
    await page.keyboard.press('ArrowRight');
    expect(await state(hue)).toStrictEqual(['0', '129', '360', '129°', '129°']);
    await page.keyboard.press('Shift+ArrowLeft');
    expect(await state(hue)).toStrictEqual(['0', '119', '360', '119°', '119°']);
    await page.keyboard.press('PageUp');
    expect(await state(hue)).toStrictEqual(['0', '149', '360', '149°', '149°']);
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    expect(await state(hue)).toStrictEqual(['0', '89', '360', '89°', '89°']);
    await page.keyboard.press('Home');
    expect(await state(hue)).toStrictEqual(['0', '0', '360', '0°', '0°']);
    await page.keyboard.press('End');
    expect(await state(hue)).toStrictEqual(['0', '360', '360', '360°', '360°']);
  });

  test('the speed slider says its value as a decimal in the language of the page, without floating point noise', async ({
    site,
    page,
  }) => {
    await site.open('/');
    const speed = slider(page, 'speed');
    await speed.focus();
    await page.keyboard.press('ArrowRight');
    expect(await state(speed)).toStrictEqual(['0', '1.55', '4', '1,55×', '1,55×']);
    await page.keyboard.press('PageDown');
    expect(await state(speed)).toStrictEqual(['0', '1.05', '4', '1,05×', '1,05×']);
    await site.localeLink('en-US').click();
    await expect(site.html).toHaveAttribute('lang', 'en-US');
    expect(await state(speed)).toStrictEqual(['0', '1.05', '4', '1.05×', '1.05×']);
  });

  test('the points slider goes from 1 to 64', async ({ site, page }) => {
    await site.open('/');
    const points = slider(page, 'instances');
    await points.focus();
    await page.keyboard.press('PageUp');
    expect(await state(points)).toStrictEqual(['1', '5', '64', '×5', '×5']);
    await page.keyboard.press('End');
    expect(await state(points)).toStrictEqual(['1', '64', '64', '×64', '×64']);
  });

  test('a slider has the visible focus ring the other controls have', async ({ site, page }) => {
    await site.open('/');
    await slider(page, 'hue').focus();
    expect(
      await slider(page, 'hue').evaluate((element) => getComputedStyle(element).outlineStyle),
    ).toBe('solid');
  });
});

test.describe('the globe', () => {
  test('can be reached with Tab and turned with the arrow keys, and Home brings it back', async ({
    site,
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'a touch device has no keyboard to turn it with');
    await site.open('/');
    await site.globeCanvas.focus();
    await expect(site.globeCanvas).toBeFocused();
    await expect(site.globeCanvas).toHaveAttribute('role', 'img');
    const before = await page.evaluate(() => window.eklund.globe.canvasSize);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Home');
    expect(await page.evaluate(() => window.eklund.globe.canvasSize)).toBe(before);
  });

  test('says in its name how to turn it', async ({ site }) => {
    await site.open('/');
    await expect(site.globeCanvas).toHaveAttribute('aria-label', PT_BR.hero.globe);
    expect(PT_BR.hero.globe.endsWith('Arraste ou use as setas pra girar.')).toBe(true);
  });
});

test.describe('the command palette as a combobox', () => {
  for (const [language, path, dictionary] of LANGUAGES) {
    test(`the input is a combobox that controls a listbox and keeps the focus while the options change, in ${language}`, async ({
      site,
      page,
    }) => {
      await site.open(path);
      await site.openPalette();
      await expect(site.paletteInput).toHaveAttribute('role', 'combobox');
      await expect(site.paletteInput).toHaveAttribute('aria-autocomplete', 'list');
      await expect(site.paletteInput).toHaveAttribute('aria-expanded', 'true');
      await expect(site.paletteInput).toHaveAttribute('aria-controls', 'command-palette-list');
      await expect(
        page.getByRole('listbox', { name: dictionary.palette.list, exact: true }),
      ).toHaveCount(1);
      await expect(site.paletteInput).toHaveAttribute(
        'aria-activedescendant',
        'command-palette-option-0',
      );
      await page.keyboard.press('ArrowDown');
      await expect(site.paletteInput).toHaveAttribute(
        'aria-activedescendant',
        'command-palette-option-1',
      );
      await expect(site.paletteInput).toBeFocused();
      await expect(page.locator('#command-palette-option-1')).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(page.locator('#command-palette-option-0')).toHaveAttribute(
        'aria-selected',
        'false',
      );
    });
  }

  test('says how many commands match each time the query changes, and when none does', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await site.openPalette();
    const announcer = page.locator('#announcer');
    await site.paletteInput.fill('github');
    await expect(announcer).toHaveText(resultsText(2)); // the link to the profile and the link to the source code
    await site.paletteInput.fill('ir para');
    await expect(announcer).toHaveText(resultsText(6));
    await site.paletteInput.fill('zzzzzz');
    await expect(announcer).toHaveText(PT_BR.palette.empty);
    await expect(site.paletteInput).toHaveAttribute('aria-expanded', 'false');
    await expect(site.paletteInput).not.toHaveAttribute('aria-activedescendant');
  });

  test('closes with Escape and gives the focus back to the button that opened it', async ({
    site,
  }) => {
    await site.open('/');
    await site.paletteButton.focus();
    await site.paletteButton.press('Enter');
    await expect(site.palette).toBeVisible();
    await expect(site.paletteInput).toBeFocused();
    await site.paletteInput.press('Escape');
    await expect(site.palette).toBeHidden();
    await expect(site.paletteButton).toBeFocused();
  });

  test('keeps the focus inside while it is open: Tab never reaches the page behind', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await site.openPalette();
    const places = [];
    for (let press = 0; press < 6; press++) {
      await page.keyboard.press('Tab');
      places.push(await focusPlace(page));
    }
    expect(places.filter((place) => place === 'page')).toStrictEqual([]);
    expect(places.includes('command-palette')).toBe(true);
  });
});

test.describe('the shader dialog', () => {
  test('moves the focus into itself, keeps it there, closes on Escape and returns the focus to its button', async ({
    site,
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      'the button is hidden below 420 px wide; the palette opens the same dialog, below',
    );
    await site.open('/');
    await page.locator('#shader-button').focus();
    await page.locator('#shader-button').press('Enter');
    const dialog = page.getByRole('dialog', { name: PT_BR.shader.label, exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.locator('#shader-close')).toBeFocused();
    const places = [];
    for (let press = 0; press < 5; press++) {
      await page.keyboard.press('Tab');
      places.push(await focusPlace(page));
    }
    expect(places.filter((place) => place === 'page')).toStrictEqual([]);
    expect(places.includes('shader-dialog')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('#shader-button')).toBeFocused();
  });

  test('opens from the palette too, with a named close button that takes the focus, and Escape closes it', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await site.openPalette();
    await site.paletteInput.fill(PT_BR.palette.commands.shader.title);
    await site.paletteInput.press('Enter');
    const dialog = page.getByRole('dialog', { name: PT_BR.shader.label, exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: PT_BR.shader.close, exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('the history accordion', () => {
  test('each company is a heading that holds one button, which says whether its card is open and which panel it controls', async ({
    site,
    page,
  }) => {
    await site.open('/');
    const headings = page.locator('#history h3');
    await expect(headings).toHaveCount(4);
    await expect(page.locator('#history h3 > button.job-header')).toHaveCount(4);
    const controls = await page
      .locator('#history .job-header')
      .evaluateAll((buttons) =>
        buttons.map((button) => [
          button.getAttribute('aria-controls'),
          document.getElementById(button.getAttribute('aria-controls'))?.classList.value,
        ]),
      );
    expect(controls).toStrictEqual([
      ['job-okto', 'job-fold'],
      ['job-g8', 'job-fold'],
      ['job-esatto', 'job-fold'],
      ['job-anhanguera', 'job-fold'],
    ]);
  });

  test('opening a card with the keyboard closes the others and exposes only its text', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await site.jobHeaders.nth(2).focus();
    await page.keyboard.press('Enter');
    await expect(site.jobHeaders.nth(2)).toHaveAttribute('aria-expanded', 'true');
    expect(await site.expandedStates()).toStrictEqual(['false', 'false', 'true', 'false']);
    await expect(page.getByText(PT_BR.history.jobs.esatto.p2, { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator('#history .job-fold')
          .evaluateAll((folds) => folds.map((fold) => getComputedStyle(fold).visibility)),
      )
      .toStrictEqual(['hidden', 'hidden', 'visible', 'hidden']);
  });

  test('a closed card is out of the accessibility tree, an open one is in it', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await site.jobHeaders.nth(1).click();
    await expect(page.getByText(PT_BR.history.jobs.g8.p1, { exact: true })).toBeVisible();
    await expect(page.getByText(PT_BR.history.jobs.esatto.p1, { exact: true })).toBeHidden();
  });

  test('stops advancing by itself while a header has the keyboard focus', async ({
    site,
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'cards only advance by themselves on a wide screen');
    test.setTimeout(60_000);
    await site.open('/');
    await site.jumpTo('historico');
    await site.jobHeaders.nth(0).focus();
    await page.waitForTimeout(10_500);
    expect(await site.expandedStates()).toStrictEqual(['true', 'false', 'false', 'false']);
  });
});

test.describe('the trace as a listbox', () => {
  for (const [language, path, dictionary] of LANGUAGES) {
    test(`is one named listbox of options, with a polite region for the details, in ${language}`, async ({
      site,
      page,
    }) => {
      await site.open(path);
      await site.centerOn('#trace-rows');
      await expect(page.locator('#trace-rows [role=option]').first()).toBeVisible();
      await expect(
        page.getByRole('listbox', { name: dictionary.trace.rows, exact: true }),
      ).toHaveCount(1);
      await expect(page.locator('#trace-detail')).toHaveAttribute('aria-live', 'polite');
      await expect(
        page.getByRole('group', { name: dictionary.trace.label, exact: true }),
      ).toHaveCount(1);
    });
  }

  test('arrow keys select a span: the option is marked, the listbox points at it and the details are written', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await site.centerOn('#trace-rows');
    const rows = page.locator('#trace-rows');
    await expect(rows.locator('[role=option]').first()).toBeVisible();
    await rows.focus();
    await page.keyboard.press('ArrowDown');
    await expect(rows).toHaveAttribute('aria-activedescendant', 'trace-span-0');
    await expect(page.locator('#trace-span-0')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(rows).toHaveAttribute('aria-activedescendant', 'trace-span-1');
    await expect(page.locator('#trace-span-0')).toHaveAttribute('aria-selected', 'false');
    const name = await page.locator('#trace-span-1 .col-name').textContent();
    await expect(page.locator('#trace-detail .trace-detail-header b').first()).toHaveText(name);
    await page.keyboard.press('End');
    await expect(rows).toHaveAttribute(
      'aria-activedescendant',
      `trace-span-${(await rows.locator('[role=option]').count()) - 1}`,
    );
    await page.keyboard.press('Escape');
    await expect(rows).not.toHaveAttribute('aria-activedescendant');
  });

  test('zooms with the buttons and the keys, with no dragging', async ({ site, page }) => {
    await site.open('/');
    await site.centerOn('#trace-rows');
    await expect(page.locator('#trace-rows [role=option]').first()).toBeVisible();
    await expect(page.locator('#trace-reset')).toBeHidden();
    await page.getByRole('button', { name: PT_BR.trace.zoomIn, exact: true }).click();
    await expect(page.locator('#trace-reset')).toBeVisible();
    await page.getByRole('button', { name: PT_BR.trace.zoomOut, exact: true }).click();
    await expect(page.locator('#trace-reset')).toBeHidden();
    await page.locator('#trace-rows').focus();
    await page.keyboard.press('+');
    await expect(page.locator('#trace-reset')).toBeVisible();
    await page.keyboard.press('0');
    await expect(page.locator('#trace-reset')).toBeHidden();
  });
});

test.describe('the map', () => {
  test('lists every service as text, and a disclosure opens with the keyboard', async ({
    site,
    page,
  }) => {
    await site.open('/');
    const summary = page.getByText(PT_BR.architecture.list.summary, { exact: true });
    await summary.focus();
    await page.keyboard.press('Enter');
    const terms = page.locator('#architecture-list-body dt');
    await expect(terms).toHaveCount(31);
    await expect(terms.first()).toHaveText(PT_BR.architecture.nodes.apiPix.title);
    await expect(terms.last()).toHaveText('Kafka');
  });

  test('the tooltip can be reached with the pointer, stays while it is under it, and Escape dismisses it', async ({
    site,
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'there is no hover on a touch device');
    await site.open('/');
    await site.centerOn('#architecture');
    const node = site.architectureNode('ledger');
    await node.hover();
    await expect(site.architectureTooltip).toBeVisible();
    const box = await site.architectureTooltip.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    await page.waitForTimeout(500);
    await expect(site.architectureTooltip).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(site.architectureTooltip).toBeHidden();
  });

  test('narrates the followed Pix in a status region', async ({ site }) => {
    await site.open('/');
    await expect(site.architectureCaption).toHaveAttribute('role', 'status');
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('still follows a Pix from start to end: the caption appears and the button comes back', async ({
      site,
    }) => {
      test.setTimeout(90_000);
      await site.open('/');
      await site.centerOn('#architecture');
      await site.followButton.click();
      await expect(site.architectureCaption).toBeVisible();
      await expect(site.followButton).toBeDisabled();
      await expect(site.followButton).toBeEnabled({ timeout: 60_000 });
    });

    test('draws no ambient traffic', async ({ site }) => {
      await site.open('/');
      await site.centerOn('#architecture');
      await site.page.waitForTimeout(1500);
      await expect(site.page.locator('#architecture-svg .packet')).toHaveCount(0);
    });
  });
});

test.describe('messages that no element shows', () => {
  test('copying the e-mail address is announced', async ({ site, page }) => {
    await site.open('/');
    await site.emailLink.scrollIntoViewIfNeeded();
    await site.emailLink.click();
    await expect(page.locator('#announcer')).toHaveText(PT_BR.contact.copiedAnnouncement);
  });

  test('the announcer is a polite, atomic status region', async ({ site, page }) => {
    await site.open('/');
    const announcer = page.locator('#announcer');
    await expect(announcer).toHaveAttribute('role', 'status');
    await expect(announcer).toHaveAttribute('aria-live', 'polite');
    await expect(announcer).toHaveAttribute('aria-atomic', 'true');
  });

  test('the terminal does not speak every line it writes', async ({ site, page }) => {
    await site.open('/');
    await expect(page.locator('#load-test-terminal')).toHaveAttribute('aria-live', 'off');
  });

  test.describe('after a full load test run (desktop)', () => {
    test.skip(({ isMobile }) => isMobile, 'the full run takes 20 s of CPU, so one project runs it');

    test('the end is announced with the number of Pix and the peak', async ({ site, page }) => {
      test.setTimeout(150_000);
      await site.open('/');
      await site.jumpTo('carga');
      await expect(site.loadTestState).toHaveText(PT_BR.loadTest.states.done, { timeout: 90_000 });
      const [processed, peak] = [
        await site.summaryNumber('processed'),
        await site.summaryNumber('peak'),
      ];
      await expect(page.locator('#announcer')).toHaveText(
        DictionaryText.plain(PT_BR.loadTest.announcement, { done: processed, peak }),
      );
    });
  });
});

test.describe('motion', () => {
  test('the button pauses what moves and what updates, and plays it again', async ({
    site,
    page,
  }) => {
    await site.open('/');
    const toggle = page.getByRole('button', { name: PT_BR.nav.motionLabel, exact: true });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(site.html).toHaveAttribute('data-motion', 'full');
    expect(
      await page
        .locator('.rotating-text-roll')
        .evaluate((element) => getComputedStyle(element).animationIterationCount),
    ).toBe('infinite');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(site.html).toHaveAttribute('data-motion', 'paused');
    expect(
      await page
        .locator('.rotating-text-roll')
        .evaluate((element) => getComputedStyle(element).animationIterationCount),
    ).toBe('1');
    const states = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => animation.effect?.target?.classList?.contains('marquee-track'))
        .map((animation) => animation.playState),
    );
    expect(states).toStrictEqual(['paused', 'paused', 'paused', 'paused']);
    const stamp = await page.locator('#status-updated').textContent();
    await page.waitForTimeout(2200);
    await expect(page.locator('#status-updated')).toHaveText(stamp);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#status-updated')).not.toHaveText(stamp);
  });

  test('the choice survives a reload, and the page loads already paused', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await page.getByRole('button', { name: PT_BR.nav.motionLabel, exact: true }).click();
    await page.reload();
    await expect(site.html).toHaveAttribute('data-motion', 'paused');
    await expect(
      page.getByRole('button', { name: PT_BR.nav.motionLabel, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('the palette offers the opposite command', async ({ site, page }) => {
    await site.open('/');
    await site.openPalette();
    await site.paletteInput.fill(PT_BR.palette.commands.pauseMotion.title);
    await site.paletteInput.press('Enter');
    await expect(site.html).toHaveAttribute('data-motion', 'paused');
    await site.openPalette();
    await expect(
      site.paletteOptions.filter({ hasText: PT_BR.palette.commands.resumeMotion.title }),
    ).toHaveCount(1);
    await expect(
      site.paletteOptions.filter({ hasText: PT_BR.palette.commands.pauseMotion.title }),
    ).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('motion'))).toBe('paused');
  });

  test.describe('when the system asks for reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('starts paused, with the button pressed, and nothing moves by itself', async ({
      site,
      page,
    }) => {
      await site.open('/');
      await expect(site.html).toHaveAttribute('data-motion', 'paused');
      await expect(
        page.getByRole('button', { name: PT_BR.nav.motionLabel, exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      const running = await page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.playState === 'running' &&
                animation.effect?.getComputedTiming().iterations === Infinity,
            ).length,
      );
      expect(running).toBe(0);
    });

    test('lets the visitor choose motion anyway: the saved choice wins over the system', async ({
      site,
      page,
    }) => {
      await page.addInitScript(() => localStorage.setItem('motion', 'full'));
      await site.open('/');
      await expect(site.html).toHaveAttribute('data-motion', 'full');
      await expect(
        page.getByRole('button', { name: PT_BR.nav.motionLabel, exact: true }),
      ).toHaveAttribute('aria-pressed', 'false');
    });
  });
});

test.describe('the pages stay free of script errors while the keyboard is used', () => {
  test('tabbing through the whole page raises nothing', async ({ site, page, health }) => {
    await site.open('/');
    for (let press = 0; press < 70; press++) await page.keyboard.press('Tab');
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });
});
