import { test, expect } from './support/fixtures.js';
import { AxeAudit } from './support/axe-audit.js';
import { DictionaryText } from './support/dictionary-text.js';
import { FocusWalk } from './support/focus-walk.js';
import { LayoutAudit } from './support/layout-audit.js';
import { LayoutShiftMeter } from './support/layout-shift-meter.js';
import { PageHealth } from './support/page-health.js';
import { PrivacyChoice } from '../../source/js/privacy/privacy-choice.js';

const LANGUAGES = [
  ['Portuguese', '/', DictionaryText.of('pt-BR')],
  ['English', '/en/', DictionaryText.of('en-US')],
];
const PT_BR = DictionaryText.of('pt-BR');
/** The three buttons of the notice, in order. */
const NOTICE_BUTTONS = ['accept', 'refuse', 'choose'];
/** What the stylesheet gives a button, for comparing the three. */
const BUTTON_STYLE = [
  'font-size',
  'font-weight',
  'font-family',
  'color',
  'background-color',
  'box-shadow',
  'border-radius',
  'padding-top',
  'padding-left',
];

/** A browser that sends Global Privacy Control, as Brave, DuckDuckGo or Firefox with the setting on. */
const sendGlobalPrivacyControl = (page) =>
  page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }),
  );
const stored = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PrivacyChoice.STORAGE_KEY);
/** What the saved choice says, without its expiry, which follows the clock. */
const storedPurposes = async (page) => {
  const choice = await stored(page);
  return (
    choice && {
      version: choice.version,
      measurement: choice.measurement,
      recording: choice.recording,
    }
  );
};
const noticeButton = (site, action) =>
  site.privacyNotice.locator(`[data-privacy-action="${action}"]`);
const dialogButton = (site, action) =>
  site.privacyDialog.locator(`[data-privacy-action="${action}"]`);

test.describe('the privacy notice (0010)', () => {
  test.use({ privacyChoice: null });

  for (const [language, path, text] of LANGUAGES) {
    test(`shows on a first visit in ${language}, with the text, the policy link and three buttons, and no close button`, async ({
      site,
      health,
    }) => {
      await site.open(path);
      await expect(site.html).toHaveAttribute('data-privacy', 'ask');
      await expect(site.privacyNotice).toBeVisible();
      await expect(site.privacyNotice).toHaveAttribute('aria-label', text.privacy.notice.label);
      await expect(site.privacyNotice.locator('p')).toHaveText(
        `${text.privacy.notice.text} ${text.privacy.notice.policy}`,
      );
      expect([
        await site.privacyNotice
          .getByRole('link')
          .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
        await site.privacyNotice
          .getByRole('button')
          .evaluateAll((buttons) => buttons.map((button) => button.textContent)),
        health.problems,
      ]).toStrictEqual([
        [text.footer.legal.privacyAddress],
        [text.privacy.notice.acceptAll, text.privacy.notice.refuseAll, text.privacy.notice.choose],
        PageHealth.NONE,
      ]);
    });
  }

  test('gives its three buttons the same size and the same style, so refusing is as easy as accepting', async ({
    site,
  }) => {
    await site.open('/');
    const looks = await site.privacyNotice.getByRole('button').evaluateAll(
      (buttons, properties) =>
        buttons.map((button) => {
          const { width, height } = button.getBoundingClientRect();
          const style = getComputedStyle(button);
          return [
            Math.round(width),
            Math.round(height),
            ...properties.map((name) => style.getPropertyValue(name)),
          ];
        }),
      BUTTON_STYLE,
    );
    expect([looks.length, looks[1], looks[2], looks[0][1] >= 24]).toStrictEqual([
      3,
      looks[0],
      looks[0],
      true,
    ]);
  });

  test('is shown before the first paint, by the head script, and moves nothing when it shows or goes away', async ({
    site,
    page,
  }) => {
    await LayoutShiftMeter.install(page);
    await page.addInitScript(() => {
      window.__privacyAtFirstPaint = null;
      new PerformanceObserver(() => {
        window.__privacyAtFirstPaint ??= document.documentElement.dataset.privacy ?? 'none';
      }).observe({ type: 'paint', buffered: true });
    });
    await site.open('/');
    await page.waitForLoadState('networkidle');
    await noticeButton(site, 'accept').click();
    await expect(site.privacyNotice).toBeHidden();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    expect([
      await page.evaluate(() => window.__privacyAtFirstPaint),
      await LayoutShiftMeter.shifts(page),
    ]).toStrictEqual(['ask', []]);
  });

  test('stays hidden for a browser without scripts, where nothing measures', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await page.goto('/');
      expect([
        await page.locator('#privacy-notice').isVisible(),
        await page.locator('#privacy-preferences-link').getAttribute('href'),
      ]).toStrictEqual([false, PT_BR.footer.legal.preferencesAddress]);
    } finally {
      await context.close();
    }
  });

  test.describe('a choice from the notice', () => {
    for (const [action, measurement, recording] of [
      ['accept', true, true],
      ['refuse', false, false],
    ]) {
      test(`"${action}" saves it with the version, closes the notice and keeps it closed on the next visit`, async ({
        site,
        page,
      }) => {
        await site.open('/');
        await noticeButton(site, action).click();
        await expect(site.privacyNotice).toBeHidden();
        await site.open('/');
        expect([
          await storedPurposes(page),
          await site.privacyNotice.isVisible(),
          await page.evaluate(() => [
            window.eklund.privacy.measurementAllowed,
            window.eklund.privacy.recordingAllowed,
          ]),
        ]).toStrictEqual([
          { version: PrivacyChoice.VERSION, measurement, recording },
          false,
          [measurement, recording],
        ]);
      });
    }

    test('keeps the six months of the choice', async ({ site, page }) => {
      const before = Date.now();
      await site.open('/');
      await noticeButton(site, 'refuse').click();
      const { expires } = await stored(page);
      const after = Date.now();
      expect([
        expires >= PrivacyChoice.expiry(before),
        expires <= PrivacyChoice.expiry(after),
      ]).toStrictEqual([true, true]);
    });
  });

  test.describe('asks again', () => {
    for (const [description, fields] of [
      ['when the choice ran out', { expires: Date.now() - 1000 }],
      ['when the purposes changed version', { version: PrivacyChoice.VERSION - 1 }],
    ]) {
      test(description, async ({ site, page }) => {
        await page.addInitScript(
          ([key, value]) => localStorage.setItem(key, value),
          [
            PrivacyChoice.STORAGE_KEY,
            JSON.stringify({
              version: PrivacyChoice.VERSION,
              measurement: false,
              recording: false,
              expires: Date.now() + 86_400_000,
              ...fields,
            }),
          ],
        );
        await site.open('/');
        await expect(site.privacyNotice).toBeVisible();
        expect(await page.evaluate(() => window.eklund.privacy.measurementAllowed)).toBe(true);
      });
    }
  });

  test.describe('Global Privacy Control', () => {
    test('counts as refusing everything: the notice never shows and nothing is allowed', async ({
      site,
      page,
    }) => {
      await sendGlobalPrivacyControl(page);
      await site.open('/');
      expect([
        await site.html.getAttribute('data-privacy'),
        await site.privacyNotice.isVisible(),
        await page.evaluate(() => [
          window.eklund.privacy.decided,
          window.eklund.privacy.measurementAllowed,
          window.eklund.privacy.recordingAllowed,
        ]),
      ]).toStrictEqual([null, false, [true, false, false]]);
    });

    test('leaves the preferences showing why nothing can be turned on', async ({ site, page }) => {
      await sendGlobalPrivacyControl(page);
      await site.open('/');
      await site.privacyPreferencesLink.click();
      await expect(site.privacyDialog).toBeVisible();
      await expect(page.locator('#privacy-signal')).toHaveText(PT_BR.privacy.dialog.signal);
      for (const id of ['#privacy-measurement', '#privacy-recording']) {
        await expect(page.locator(id)).toBeDisabled();
        await expect(page.locator(id)).toBeChecked({ checked: false });
      }
      await expect(dialogButton(site, 'save')).toBeDisabled();
      await expect(dialogButton(site, 'accept')).toBeDisabled();
      await expect(dialogButton(site, 'refuse')).toBeEnabled();
    });

    test('is published at /.well-known/gpc.json, as JSON', async ({ request }) => {
      const response = await request.get('/.well-known/gpc.json');
      expect([
        response.status(),
        response.headers()['content-type'],
        (await response.json()).gpc,
      ]).toStrictEqual([200, 'application/json; charset=utf-8', true]);
    });
  });

  test.describe('with the keyboard', () => {
    test('comes right after the header, its link and its buttons in reading order', async ({
      site,
      page,
    }) => {
      await site.open('/');
      await page.locator('#motion-toggle').focus();
      const stops = [];
      for (let press = 0; press < 4; press++) {
        await page.keyboard.press('Tab');
        stops.push(
          await page.evaluate(
            () =>
              document.activeElement.dataset.privacyAction ??
              document.activeElement.getAttribute('href'),
          ),
        );
      }
      expect(stops).toStrictEqual([PT_BR.footer.legal.privacyAddress, ...NOTICE_BUTTONS]);
    });

    test('"Choose" opens the preferences with the focus inside; Escape closes them and gives the focus back', async ({
      site,
      page,
    }) => {
      await site.open('/');
      await noticeButton(site, 'choose').focus();
      await page.keyboard.press('Enter');
      await expect(site.privacyDialog).toBeVisible();
      const inside = await page.evaluate(() =>
        document.getElementById('privacy-dialog').contains(document.activeElement),
      );
      await page.keyboard.press('Escape');
      await expect(site.privacyDialog).toBeHidden();
      await expect(noticeButton(site, 'choose')).toBeFocused();
      expect([inside, await site.privacyNotice.isVisible()]).toStrictEqual([true, true]);
    });

    test('a choice made with the keyboard hands the focus to the main content, where the reading goes on', async ({
      site,
      page,
    }) => {
      await site.open('/');
      await noticeButton(site, 'refuse').focus();
      await page.keyboard.press('Enter');
      await expect(site.privacyNotice).toBeHidden();
      await expect(page.locator('#main')).toBeFocused();
    });

    test('a choice saved in the preferences opened from "Choose" sends the focus to the main content too', async ({
      site,
      page,
    }) => {
      await site.open('/');
      await noticeButton(site, 'choose').click();
      await page.locator('#privacy-recording').check();
      await dialogButton(site, 'save').focus();
      await page.keyboard.press('Enter');
      await expect(site.privacyDialog).toBeHidden();
      await expect(site.privacyNotice).toBeHidden();
      await expect(page.locator('#main')).toBeFocused();
      expect(await storedPurposes(page)).toStrictEqual({
        version: PrivacyChoice.VERSION,
        measurement: true,
        recording: true,
      });
    });

    test('never hides the focused control under the notice (WCAG 2.4.11)', async ({
      site,
      page,
    }) => {
      await site.open('/');
      await expect(site.privacyNotice).toBeVisible();
      const stops = await FocusWalk.tabThrough(page);
      expect(
        stops.filter((stop) => !stop.inView || !stop.reachable).map((stop) => stop.label),
      ).toStrictEqual([]);
    });
  });

  test.describe('motion', () => {
    test('rises into place only while motion is on', async ({ site }) => {
      await site.open('/');
      expect(
        await site.privacyNotice.evaluate((notice) => getComputedStyle(notice).animationName),
      ).toBe('privacy-notice-rise');
    });

    test('does not move at all under reduced motion', async ({ site, page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await site.open('/');
      expect(
        await site.privacyNotice.evaluate((notice) => getComputedStyle(notice).animationName),
      ).toBe('none');
    });
  });

  test.describe('accessibility', () => {
    for (const theme of ['dark', 'light']) {
      for (const [language, path] of LANGUAGES) {
        test(`no axe violation with the notice on screen, ${theme} theme, in ${language}`, async ({
          site,
          page,
        }) => {
          await AxeAudit.useTheme(page, theme);
          await site.open(path);
          await expect(site.privacyNotice).toBeVisible();
          expect(await AxeAudit.run(page)).toStrictEqual([]);
        });
      }

      test(`no axe violation with the preferences open, ${theme} theme`, async ({ site, page }) => {
        await AxeAudit.useTheme(page, theme);
        await site.open('/');
        await noticeButton(site, 'choose').click();
        await expect(site.privacyDialog).toBeVisible();
        expect(await AxeAudit.run(page)).toStrictEqual([]);
      });
    }

    test('every control of the notice and of the preferences is at least 24 x 24 px, links inside a sentence apart', async ({
      site,
    }) => {
      const small = (selector) =>
        site.page.locator(selector).evaluateAll(
          (controls) =>
            controls
              .filter((control) => !(control.localName === 'a' && control.closest('p')))
              .map((control) => control.getBoundingClientRect())
              .filter(({ width, height }) => width < 24 || height < 24).length,
        );
      await site.open('/');
      await LayoutAudit.settle(site.page); // the dialog grows from 96% as it opens
      const inNotice = await small('#privacy-notice :is(a, button)');
      await noticeButton(site, 'choose').click();
      await expect(site.privacyDialog).toBeVisible();
      await site.page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      expect([inNotice, await small('#privacy-dialog :is(a, button, input)')]).toStrictEqual([
        0, 0,
      ]);
    });
  });
});

test.describe('the privacy preferences (0010)', () => {
  for (const [language, path, text] of LANGUAGES) {
    test(`open from the footer link in ${language}, with every purpose, its basis and the saved choice`, async ({
      site,
      page,
    }) => {
      await site.open(path);
      await site.privacyPreferencesLink.click();
      await expect(site.privacyDialog).toBeVisible();
      await expect(page).toHaveURL(path);
      const purposes = await site.privacyDialog.locator('.privacy-purpose').evaluateAll((items) =>
        items.map((item) => {
          const input = item.querySelector('input');
          return [
            item.querySelector('label').textContent,
            item.querySelector('.privacy-basis').textContent,
            input.checked,
            input.disabled,
          ];
        }),
      );
      expect([
        await page.locator('#privacy-dialog-title').textContent(),
        purposes,
        await site.privacyDialog
          .getByRole('button')
          .evaluateAll((buttons) =>
            buttons.map((button) => [button.textContent || button.ariaLabel, button.disabled]),
          ),
      ]).toStrictEqual([
        text.privacy.dialog.title,
        [
          [
            text.privacy.dialog.preferences.title,
            text.privacy.dialog.preferences.basis,
            true,
            true,
          ],
          [
            text.privacy.dialog.measurement.title,
            text.privacy.dialog.measurement.basis,
            true,
            false,
          ],
          [text.privacy.dialog.recording.title, text.privacy.dialog.recording.basis, false, false],
        ],
        [
          [text.privacy.dialog.close, false],
          [text.privacy.dialog.save, false],
          [text.privacy.dialog.acceptAll, false],
          [text.privacy.dialog.refuseAll, false],
          [text.privacy.dialog.deleteRecordings, true],
        ],
      ]);
    });
  }

  test('save what the switches say, and the next visit finds it', async ({ site, page }) => {
    await site.open('/');
    await site.privacyPreferencesLink.click();
    await page.locator('#privacy-measurement').uncheck();
    await dialogButton(site, 'save').click();
    await expect(site.privacyDialog).toBeHidden();
    await expect(site.privacyPreferencesLink).toBeFocused();
    await site.open('/');
    await site.privacyPreferencesLink.click();
    await expect(page.locator('#privacy-measurement')).toBeChecked({ checked: false });
    expect(await storedPurposes(page)).toStrictEqual({
      version: PrivacyChoice.VERSION,
      measurement: false,
      recording: false,
    });
  });

  for (const [address, expected, title] of [
    ['/?preferencias', '/', PT_BR.privacy.dialog.title],
    ['/en/?preferences', '/en/', DictionaryText.of('en-US').privacy.dialog.title],
    ['/?utm=x&preferencias#contato', '/?utm=x#contato', PT_BR.privacy.dialog.title],
  ]) {
    test(`open at once from ${address}, the address the legal pages link to, and leave it as ${expected}`, async ({
      site,
      page,
    }) => {
      await site.open(address);
      await expect(site.privacyDialog).toBeVisible();
      await expect(page.locator('#privacy-dialog-title')).toHaveText(title);
      expect(
        new URL(page.url()).pathname + new URL(page.url()).search + new URL(page.url()).hash,
      ).toBe(expected);
    });
  }

  test('open from the link in the footer of a legal page', async ({ site, page }) => {
    await page.goto('/cookies/');
    await page.locator('.legal-footer a[href="/?preferencias"]').click();
    await page.waitForFunction(() => window.eklund !== undefined);
    await expect(site.privacyDialog).toBeVisible();
    await expect(page).toHaveURL('/');
  });

  test('open from the command palette', async ({ site }) => {
    await site.open('/');
    await site.openPalette();
    await site.paletteInput.fill(PT_BR.palette.commands.privacyPreferences.title);
    await site.paletteSelected.click();
    await expect(site.privacyDialog).toBeVisible();
  });

  test('the palette leads to each legal page', async ({ site, page }) => {
    await site.open('/');
    await site.openPalette();
    await site.paletteInput.fill(PT_BR.palette.commands.cookiePolicy.title);
    await site.paletteSelected.click();
    await expect(page).toHaveURL(PT_BR.footer.legal.cookiesAddress);
  });
});
