import { test, expect } from './support/fixtures.js';
import { PageHealth } from './support/page-health.js';
import { DictionaryText } from './support/dictionary-text.js';

const PT_BR = DictionaryText.of('pt-BR');
const EN_US = DictionaryText.of('en-US');
const EMAIL = 'gustavo@eklund.com.br';

test.describe('contact', () => {
  test('the big e-mail link is a mailto link that carries the address to copy', async ({
    site,
  }) => {
    await site.open('/');
    await expect(site.emailLink).toHaveText(EMAIL);
    await expect(site.emailLink).toHaveAttribute('href', `mailto:${EMAIL}`);
    await expect(site.emailLink).toHaveAttribute('data-copy', EMAIL);
    await expect(site.section('contato').locator('.lead')).toHaveText(PT_BR.contact.lead);
  });

  test('clicking it copies the address and shows the toast, which then goes away', async ({
    site,
    page,
    health,
  }) => {
    await site.open('/');
    await expect(site.copiedToast).toBeHidden();
    await site.emailLink.scrollIntoViewIfNeeded();
    await site.emailLink.click();
    await expect(site.copiedToast).toBeVisible();
    await expect(site.copiedToast).toHaveText(PT_BR.contact.copied);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(EMAIL);
    await expect(site.copiedToast).toBeHidden(); // hidden again after 1800 ms
    await expect(page).toHaveURL('http://127.0.0.1:8735/');
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('the address in the hero copies too', async ({ site, page }) => {
    await site.open('/');
    await expect(site.heroEmailButton).toHaveText(EMAIL);
    await site.heroEmailButton.click();
    await expect(site.copiedToast).toHaveText(PT_BR.contact.copied);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(EMAIL);
  });

  test('the palette command copies it as well', async ({ site, page }) => {
    await site.open('/');
    await site.openPalette();
    await site.paletteInput.fill('copiar');
    await expect(site.paletteSelected).toHaveText(
      PT_BR.palette.commands.copyEmail.title + PT_BR.palette.tags.action,
    );
    await page.keyboard.press('Enter');
    await expect(site.copiedToast).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(EMAIL);
  });

  test('the toast speaks English on the English page', async ({ site }) => {
    await site.open('/en/');
    await site.emailLink.scrollIntoViewIfNeeded();
    await site.emailLink.click();
    await expect(site.copiedToast).toHaveText(EN_US.contact.copied);
  });

  test('a control-click leaves the mailto link alone and copies nothing', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await page.evaluate(() => navigator.clipboard.writeText('untouched'));
    await site.emailLink.scrollIntoViewIfNeeded();
    // Ctrl-click would open the mail client; stop the navigation so the test only observes what the page did.
    await page.evaluate(() => addEventListener('click', (event) => event.preventDefault(), true));
    await site.emailLink.click({ modifiers: ['Control'] });
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('untouched');
    await expect(site.copiedToast).toBeHidden();
  });

  test('links to GitHub and LinkedIn open in a new tab without giving the opener away', async ({
    site,
  }) => {
    await site.open('/');
    const links = site.section('contato').locator('.social-links a');
    await expect(links).toHaveText(['GitHub ', 'LinkedIn ']);
    await expect(links).toHaveCount(2);
    expect(
      await links.evaluateAll((anchors) =>
        anchors.map((anchor) => [
          anchor.getAttribute('href'),
          anchor.getAttribute('target'),
          anchor.getAttribute('rel'),
        ]),
      ),
    ).toStrictEqual([
      ['https://github.com/GustavoEklund', '_blank', 'noopener'],
      ['https://www.linkedin.com/in/gustavo-eklund', '_blank', 'noopener'],
    ]);
  });
});
