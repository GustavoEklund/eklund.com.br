import { test, expect } from './support/fixtures.js';
import { PageHealth } from './support/page-health.js';
import { DictionaryText } from './support/dictionary-text.js';
import { SectionLanding } from './support/section-landing.js';
import { SitePage } from './support/site-page.js';

const PT_BR = DictionaryText.of('pt-BR');
const ORIGIN = 'http://127.0.0.1:8735';
const NAV_LABELS = {
  status: PT_BR.nav.status,
  perfil: PT_BR.nav.profile,
  arquitetura: PT_BR.nav.architecture,
  carga: PT_BR.nav.load,
  historico: PT_BR.nav.history,
  contato: PT_BR.nav.contact,
};

test.describe('header links (desktop)', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'the header links are hidden below 1000 px; the mobile project uses the hero button instead',
  );

  test('lists the six sections, in order, with the dictionary labels', async ({ site }) => {
    await site.open('/');
    await expect(site.page.locator('.site-nav .nav-link')).toHaveText(
      SitePage.SECTION_IDS.map((id) => NAV_LABELS[id]),
    );
    await expect(site.page.locator('.site-nav .nav-link')).toHaveCount(6);
  });

  for (const id of SitePage.SECTION_IDS) {
    test(`#${id}: the link updates the address and scrolls the section to the top`, async ({
      site,
      health,
    }) => {
      await site.open('/');
      await site.navLink(id).click();
      await expect(site.page).toHaveURL(`${ORIGIN}/#${id}`);
      expect(await SectionLanding.miss(site, id)).toBe(0);
      expect(health.problems).toStrictEqual(PageHealth.NONE);
    });
  }

  test('the second trip to a section lands exactly, once the page around it has been rendered', async ({
    site,
  }) => {
    await site.open('/');
    await site.navLink('historico').click();
    await site.landedOn('historico');
    await site.navLink('arquitetura').click();
    await site.landedOn('arquitetura');
    await site.navLink('historico').click();
    expect(await site.landedOn('historico')).toBe(true);
    expect(await site.sectionTop('historico')).toBe(await site.sectionScrollMargin('historico'));
  });

  test('the logo returns to the top and clears the hash', async ({ site, page }) => {
    await site.open('/');
    await site.navLink('contato').click();
    await expect(page).toHaveURL(`${ORIGIN}/#contato`);
    await site.logo.click();
    await expect(page).toHaveURL(`${ORIGIN}/`);
    expect(await site.waitForScrollToStop()).toBe(0);
  });

  test('a link with a modifier key is left to the browser', async ({ site, page }) => {
    await site.open('/');
    await site.navLink('perfil').click({ modifiers: ['Control'] });
    await expect(page).toHaveURL(`${ORIGIN}/`);
  });

  test('the custom scrollbar reads 0% at the top and 100% at the bottom, with one mark per section plus the top', async ({
    site,
  }) => {
    await site.open('/');
    await expect(site.scrollbarPercent).toHaveText('0%');
    await expect(site.scrollbarMarks).toHaveCount(7);
    await site.scrollThroughPage();
    await expect(site.scrollbarPercent).toHaveText('100%');
  });

  test('a mark on the custom scrollbar scrolls to its section', async ({ site }) => {
    await site.open('/');
    await site.scrollbarMarks.nth(6).click();
    expect(await SectionLanding.miss(site, 'contato')).toBe(0);
  });
});

test.describe('hero button (mobile)', () => {
  test.skip(({ isMobile }) => !isMobile, 'covered by the header links on desktop');

  test('the history button scrolls to the history section and updates the address', async ({
    site,
  }) => {
    await site.open('/');
    await site.page.locator('.hero-actions a.btn[href="#historico"]').click();
    await expect(site.page).toHaveURL(`${ORIGIN}/#historico`);
    expect(await SectionLanding.miss(site, 'historico')).toBe(0);
  });

  test('the logo goes back to the top', async ({ site, page }) => {
    await site.open('/');
    await page.evaluate(() => scrollTo({ top: 1500, behavior: 'instant' }));
    await site.logo.click();
    await expect(page).toHaveURL(`${ORIGIN}/`);
    expect(await site.waitForScrollToStop()).toBe(0);
  });
});
