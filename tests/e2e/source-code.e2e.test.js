import { test, expect } from './support/fixtures.js';
import { PageHealth } from './support/page-health.js';
import { DictionaryText } from './support/dictionary-text.js';

const REPOSITORY = 'https://github.com/GustavoEklund/eklund.com.br';
const LANGUAGES = [
  ['Portuguese', '/', DictionaryText.of('pt-BR')],
  ['English', '/en/', DictionaryText.of('en-US')],
];

/** What an anchor says about where it goes and how, as the browser reads it. */
const destination = (locator) =>
  locator.evaluate((anchor) => [
    anchor.getAttribute('href'),
    anchor.getAttribute('target'),
    anchor.getAttribute('rel'),
  ]);

for (const [language, path, text] of LANGUAGES) {
  test.describe(`the link to the source code, in ${language}`, () => {
    test('is a button in the header, with the name the dictionary gives it, and opens the repository in a new tab', async ({
      site,
      health,
    }) => {
      await site.open(path);
      await expect(site.sourceButton).toHaveAttribute('aria-label', text.nav.sourceLabel);
      await expect(site.sourceButton).toHaveAttribute('title', text.nav.sourceTitle);
      await expect(site.sourceButton).toHaveAttribute('data-cursor', text.cursor.open);
      expect(await destination(site.sourceButton)).toStrictEqual([
        REPOSITORY,
        '_blank',
        'noopener',
      ]);
      expect(health.problems).toStrictEqual(PageHealth.NONE);
    });

    test('is a text link in the footer, with the same destination', async ({ site }) => {
      await site.open(path);
      await expect(site.sourceLink).toHaveText(text.footer.source);
      await expect(site.sourceLink).toHaveAttribute('data-cursor', text.cursor.open);
      expect(await destination(site.sourceLink)).toStrictEqual([REPOSITORY, '_blank', 'noopener']);
    });
  });
}

test.describe('the link to the source code, from the command palette', () => {
  test('"view the site source code" opens the repository in a new tab', async ({
    site,
    page,
    context,
  }) => {
    const texts = DictionaryText.of('pt-BR');
    await context.route('https://github.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>repository</title>' }),
    );
    await site.open('/');
    await site.openPalette();
    await site.paletteInput.fill('codigo-fonte');
    await expect(site.paletteSelected).toHaveText(
      texts.palette.commands.source.title + texts.palette.tags.external,
    );
    const [tab] = await Promise.all([context.waitForEvent('page'), page.keyboard.press('Enter')]);
    await tab.waitForURL(REPOSITORY);
    expect(tab.url()).toBe(REPOSITORY);
    await expect(site.palette).toBeHidden();
  });
});
