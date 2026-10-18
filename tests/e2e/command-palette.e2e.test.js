import { test, expect } from './support/fixtures.js';
import { PageHealth } from './support/page-health.js';
import { DictionaryText } from './support/dictionary-text.js';
import { SectionLanding } from './support/section-landing.js';

const PT_BR = DictionaryText.of('pt-BR');
const COMMANDS = PT_BR.palette.commands;
const TAGS = PT_BR.palette.tags;
// In the order App.#commands() registers them: the visible text is the title followed by the tag.
const ALL_COMMANDS = [
  COMMANDS.status.title + TAGS.go,
  COMMANDS.profile.title + TAGS.go,
  COMMANDS.architecture.title + TAGS.go,
  COMMANDS.followPix.title + TAGS.map,
  COMMANDS.load.title + TAGS.go,
  COMMANDS.runLoad.title + TAGS.action,
  COMMANDS.history.title + TAGS.go,
  COMMANDS.contact.title + TAGS.go,
  COMMANDS.copyEmail.title + TAGS.action,
  COMMANDS.toggleTheme.title + TAGS.theme,
  COMMANDS.randomHue.title + TAGS.theme,
  DictionaryText.plain(COMMANDS.goHome.title, { city: 'Taubaté' }) + TAGS.globe,
  COMMANDS.shader.title + TAGS.code,
  COMMANDS.github.title + TAGS.external,
  COMMANDS.source.title + TAGS.external,
  COMMANDS.linkedin.title + TAGS.external,
  COMMANDS.switchLocale.title + TAGS.language,
  COMMANDS.pauseMotion.title + TAGS.action,
  COMMANDS.hueUp.title + TAGS.globe,
  COMMANDS.hueDown.title + TAGS.globe,
  COMMANDS.speedUp.title + TAGS.globe,
  COMMANDS.speedDown.title + TAGS.globe,
  COMMANDS.pointsUp.title + TAGS.globe,
  COMMANDS.pointsDown.title + TAGS.globe,
  COMMANDS.spinGlobe.title + TAGS.globe,
];

test.describe('command palette', () => {
  test('Ctrl+K opens it with an empty search and every command listed', async ({
    site,
    health,
  }) => {
    await site.open('/');
    await expect(site.palette).toBeHidden();
    await site.pressPaletteShortcut();
    await expect(site.palette).toBeVisible();
    await expect(site.paletteInput).toBeFocused();
    await expect(site.paletteInput).toHaveValue('');
    await expect(site.paletteInput).toHaveAttribute('placeholder', PT_BR.palette.placeholder);
    await expect(site.paletteOptions).toHaveText(ALL_COMMANDS);
    await expect(site.paletteEmpty).toBeHidden();
    await expect(site.paletteSelected).toHaveText(ALL_COMMANDS[0]);
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('the header button opens it as well', async ({ site }) => {
    await site.open('/');
    await site.paletteButton.click();
    await expect(site.palette).toBeVisible();
    await expect(site.paletteOptions).toHaveText(ALL_COMMANDS);
  });

  test('typing filters the commands and ranks the best match first', async ({ site }) => {
    await site.open('/');
    await site.openPalette();
    await site.paletteInput.fill('github');
    await expect(site.paletteOptions).toHaveText([
      COMMANDS.github.title + TAGS.external,
      COMMANDS.source.title + TAGS.external,
    ]);
    await site.paletteInput.fill('');
    await expect(site.paletteOptions).toHaveText(ALL_COMMANDS);
  });

  test('ignores accents and case when matching', async ({ site }) => {
    await site.open('/');
    await site.openPalette();
    await site.paletteInput.fill('HISTORICO');
    await expect(site.paletteOptions.first()).toHaveText(COMMANDS.history.title + TAGS.go);
  });

  test('shows the empty message when nothing matches', async ({ site }) => {
    await site.open('/');
    await site.openPalette();
    await site.paletteInput.fill('zzzzzz');
    await expect(site.paletteOptions).toHaveCount(0);
    await expect(site.paletteEmpty).toBeVisible();
    await expect(site.paletteEmpty).toHaveText(PT_BR.palette.empty);
  });

  test('the arrow keys move the selection and wrap around', async ({ site, page }) => {
    await site.open('/');
    await site.openPalette();
    await page.keyboard.press('ArrowDown');
    await expect(site.paletteSelected).toHaveText(ALL_COMMANDS[1]);
    await page.keyboard.press('ArrowDown');
    await expect(site.paletteSelected).toHaveText(ALL_COMMANDS[2]);
    await page.keyboard.press('ArrowUp');
    await expect(site.paletteSelected).toHaveText(ALL_COMMANDS[1]);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(site.paletteSelected).toHaveText(ALL_COMMANDS.at(-1));
    await page.keyboard.press('ArrowDown');
    await expect(site.paletteSelected).toHaveText(ALL_COMMANDS[0]);
  });

  test('Enter runs the selected command and closes the palette', async ({ site, page }) => {
    await site.open('/');
    await site.openPalette();
    await site.paletteInput.fill('aleatorio');
    await expect(site.paletteOptions).toHaveText([COMMANDS.randomHue.title + TAGS.theme]);
    await page.keyboard.press('Enter');
    await expect(site.palette).toBeHidden();
    // The hue is random, so its value is unknown; the command ran when the saved hue and the hue applied to the page are the same number.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const saved = localStorage.getItem('hue'),
            applied = document.documentElement.style.getPropertyValue('--hue');
          return saved !== null && saved === applied && String(Math.round(Number(saved))) === saved;
        }),
      )
      .toBe(true);
  });

  test('clicking a command runs it', async ({ site }) => {
    await site.open('/');
    await site.openPalette();
    await site.paletteOptions.filter({ hasText: COMMANDS.toggleTheme.title }).click();
    await expect(site.html).toHaveAttribute('data-theme', 'light');
    await expect(site.palette).toBeHidden();
  });

  test('a "go to" command scrolls that section to the top of the page', async ({ site, page }) => {
    await site.open('/');
    await site.openPalette();
    await site.paletteInput.fill('contato');
    await expect(site.paletteSelected).toHaveText(COMMANDS.contact.title + TAGS.go);
    await page.keyboard.press('Enter');
    await expect(site.palette).toBeHidden();
    expect(await SectionLanding.miss(site, 'contato')).toBe(0);
  });

  test('Escape closes it, and Ctrl+K toggles it', async ({ site, page }) => {
    await site.open('/');
    await site.openPalette();
    await page.keyboard.press('Escape');
    await expect(site.palette).toBeHidden();
    await site.pressPaletteShortcut();
    await expect(site.palette).toBeVisible();
    await site.pressPaletteShortcut();
    await expect(site.palette).toBeHidden();
  });

  test('clicking the backdrop closes it', async ({ site, page }) => {
    await site.open('/');
    await site.openPalette();
    await page.mouse.click(2, 2);
    await expect(site.palette).toBeHidden();
  });

  test('is labelled by the dictionary', async ({ site }) => {
    await site.open('/');
    await expect(site.palette).toHaveAttribute('aria-label', PT_BR.palette.label);
    await expect(site.paletteInput).toHaveAttribute('aria-label', PT_BR.palette.search);
  });
});
