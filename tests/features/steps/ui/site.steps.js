import assert from 'node:assert/strict';
import { Given, When, Then, defineParameterType } from '@cucumber/cucumber';
import { expect as playwrightExpect } from '@playwright/test';
import { SiteSource } from '../../support/site-source.js';
import { BrowserSession } from '../../support/browser-session.js';

const expect = playwrightExpect.configure({ timeout: 20_000 });
const { PT_BR } = await SiteSource.load('js/i18n/locales/pt-br.js');
const { EN_US } = await SiteSource.load('js/i18n/locales/en-us.js');
const DICTIONARIES = { 'pt-BR': PT_BR, 'en-US': EN_US };
const LOAD_TEST_TIMEOUT_MS = 150_000;

defineParameterType({
  name: 'navegador',
  regexp: /português|inglês/,
  transformer: (text) => ({ português: 'pt-BR', inglês: 'en-US' })[text],
});

/** The pieces of the page the scenarios talk about. */
class Site {
  /** The app sets window.eklund when everything is mounted; until then the page is not usable. */
  static async open(page, path) {
    await page.goto(path, { waitUntil: 'domcontentloaded' }).catch((error) => {
      // The root address sends a reader of English to /en/ from the head of the page, which interrupts this navigation with that one.
      if (!/interrupted by another navigation/.test(error.message)) throw error;
    });
    await page.waitForFunction(() => window.eklund !== undefined, null, { timeout: 30_000 });
  }

  static languageLink(page, label) {
    return page.locator('.locale-switcher a', { hasText: new RegExp(`^${label}$`) });
  }
}

Given('que o navegador do visitante está em {navegador}', async function (locale) {
  await this.closeBrowser();
  await this.openBrowser({ locale });
});

Given('que o visitante abre o site', async function () {
  await Site.open(this.page, '/');
});

When('o visitante abre o site', async function () {
  await Site.open(this.page, '/');
});

When('o visitante abre {string}', async function (path) {
  await Site.open(this.page, path);
});

When('o visitante recarrega a página', async function () {
  await this.page.reload({ waitUntil: 'domcontentloaded' });
  await this.page.waitForFunction(() => window.eklund !== undefined, null, { timeout: 30_000 });
});

When('o visitante clica em {string} no seletor de idioma', async function (label) {
  await Site.languageLink(this.page, label).click();
});

When('o visitante clica no botão de tema', async function () {
  await this.page.locator('#theme-toggle').click();
});

When('o visitante aperta Ctrl+K', async function () {
  await this.page.keyboard.press('Control+K');
});

When('o visitante digita {string} e aperta Enter', async function (text) {
  await this.page.locator('#command-palette-input').fill(text);
  await this.page.keyboard.press('Enter');
});

When(
  'o visitante vai até o teste de carga e espera ele terminar',
  { timeout: LOAD_TEST_TIMEOUT_MS + 30_000 },
  async function () {
    await this.page.evaluate(() => document.querySelector('#carga').scrollIntoView());
    await this.page
      .waitForFunction(
        () => document.querySelector('#load-test').matches('.is-running, .is-done'),
        null,
        { timeout: 8_000 },
      )
      .catch(() => this.page.locator('#load-test-run').click());
    await this.page.waitForFunction(
      () => document.querySelector('#load-test').classList.contains('is-done'),
      null,
      { timeout: LOAD_TEST_TIMEOUT_MS },
    );
  },
);

Then('a página está em {string}', async function (locale) {
  await expect(this.page.locator('html')).toHaveAttribute('lang', locale);
});

Then('o link {string} do seletor de idioma está marcado como atual', async function (label) {
  await expect(Site.languageLink(this.page, label)).toHaveAttribute('aria-current', 'true');
});

Then('o endereço é {string}', async function (path) {
  await expect(this.page).toHaveURL(new URL(path, BrowserSession.baseUrl).href);
});

Then('o título da página é o do dicionário {string}', async function (locale) {
  await expect(this.page).toHaveTitle(DICTIONARIES[locale].meta.title);
});

Then('o tema da página é {string}', async function (theme) {
  await expect(this.page.locator('html')).toHaveAttribute('data-theme', theme);
});

Then('a paleta de comandos está aberta', async function () {
  await expect(this.page.locator('#command-palette')).toBeVisible();
});

Then('a paleta de comandos está fechada', async function () {
  await expect(this.page.locator('#command-palette')).toBeHidden();
});

Then('a janela está mostrando a seção {string}', async function (id) {
  const sectionAtTheCenter = () =>
    this.page.evaluate(
      () =>
        document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('section')?.id ?? null,
    );
  await expect.poll(sectionAtTheCenter, { timeout: 30_000 }).toBe(id);
});

Then('o resumo mostra {string} nos checks', async function (text) {
  const shown = await this.page
    .locator('#load-test-summary [data-metric="checks"] dd')
    .evaluate((value) => value.firstChild.textContent);
  assert.strictEqual(shown, text);
});

Then(
  'o terminal mostra {int} checks aprovados e {int} reprovados',
  async function (approved, failed) {
    const lines = await this.page.evaluate(() => ({
      approved: document.querySelectorAll('#load-test-terminal .terminal-line.is-ok').length,
      failed: document.querySelectorAll('#load-test-terminal .terminal-line.is-fail').length,
    }));
    assert.deepStrictEqual(lines, { approved, failed });
  },
);
