import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { SiteSource } from '../../support/site-source.js';
import { HeadScript } from '../../../support/head-script.js';

const { Locale } = await SiteSource.load('js/i18n/locale.js');
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const visitorAt = (address, saved, languages, userAgent) => {
  const { pathname, search, hash } = new URL(
    address === '' ? '/' : address,
    'https://eklund.com.br',
  );
  return {
    pathname,
    search,
    hash,
    saved: saved === '' ? {} : { lang: saved },
    languages: languages === '' ? [] : languages.split(','),
    ...(userAgent ? { userAgent } : {}),
  };
};

Given('a página no endereço {string}', function (address) {
  this.pathname = address;
});

Given(
  'um visitante em {string}, com a escolha salva {string} e o navegador com {string}',
  function (address, saved, languages) {
    this.visitor = visitorAt(address, saved, languages);
    this.localeStubs.install({ saved });
  },
);

Given('um robô de busca em {string} com o navegador com {string}', function (address, languages) {
  this.visitor = visitorAt(address, '', languages, GOOGLEBOT);
});

When('o site detecta o idioma', function () {
  this.detectedLocale = Locale.detect({ pathname: this.pathname });
});

When('a página começa a abrir', function () {
  this.landing = HeadScript.run(this.visitor);
});

When('o visitante escolhe {string}', function (locale) {
  Locale.remember(locale);
  this.visitor = { ...this.visitor, saved: { lang: locale } };
});

When('o site monta o link de {string} em {string}', function (page, locale) {
  this.link = Locale.urlFor(locale, page);
});

Then('o idioma é {string}', function (locale) {
  assert.strictEqual(this.detectedLocale, locale);
});

Then('o visitante vai para {string}', function (destination) {
  assert.strictEqual(this.landing.redirectedTo, destination);
});

Then('o visitante fica onde está', function () {
  assert.strictEqual(this.landing.redirectedTo, null);
});

Then('a escolha salva é {string}', function (locale) {
  assert.strictEqual(this.localeStubs.savedChoice, locale);
});

Then(
  'ao voltar com o mesmo navegador à página em português, o visitante vai para {string}',
  function (destination) {
    assert.strictEqual(HeadScript.run(this.visitor).redirectedTo, destination);
  },
);

Then('o link é {string}', function (link) {
  assert.strictEqual(this.link, link);
});
