// @vitest-environment happy-dom
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { PT_BR } from '@site/js/i18n/locales/pt-br.js';
import { EN_US } from '@site/js/i18n/locales/en-us.js';
import { Locale } from '@site/js/i18n/locale.js';
import { SiteSource, DictionaryLeaves } from '../support/site-source.js';
import { HtaccessHeaders } from './support/htaccess-headers.js';

const ORIGIN = 'https://eklund.com.br';
const DICTIONARIES = { 'pt-BR': PT_BR, 'en-US': EN_US };

/**
 * Strings that are the same in both dictionaries on purpose: names of services, Central Bank terms and protocol
 * identifiers, loan words and units. Anything else that is identical is Portuguese text that was left untranslated.
 */
const SAME_IN_BOTH_LANGUAGES = [
  'nav.status',
  'scrollbar.status',
  'status.checks.layoutShift.name',
  'trace.meta.spans',
  'trace.services.script',
  'trace.columns.span',
  'trace.attributes.status',
  'trace.attributes.redirects',
  'trace.attributes.host',
  'trace.attributes.tls',
  'trace.attributes.shaders',
  'trace.attributes.drawCalls',
  'trace.attributes.dpr',
  'trace.attributes.canvas',
  'trace.attributes.spans',
  'trace.attributes.webgl2',
  'trace.values.handshake',
  'profile.board.title',
  'profile.board.volume',
  'profile.board.uptime',
  'profile.board.base',
  'dashboard.throughput.title',
  'dashboard.uptime.fullDay',
  'architecture.zones.aws',
  'architecture.zones.cluster',
  'architecture.nodes.apiPix.title',
  'architecture.nodes.apiPix.subtitle',
  'architecture.nodes.apps.title',
  'architecture.nodes.apps.subtitle',
  'architecture.nodes.openFinance.title',
  'architecture.nodes.openFinance.subtitle',
  'architecture.nodes.webhooksOut.title',
  'architecture.nodes.gateway.title',
  'architecture.nodes.gateway.subtitle',
  'architecture.nodes.charges.subtitle',
  'architecture.nodes.recurrence.subtitle',
  'architecture.nodes.pixOut.title',
  'architecture.nodes.pixOut.subtitle',
  'architecture.nodes.dictService.title',
  'architecture.nodes.dictGateway.title',
  'architecture.nodes.ledger.title',
  'architecture.nodes.webhooks.title',
  'architecture.nodes.webhooks.subtitle',
  'architecture.nodes.pixIn.title',
  'architecture.nodes.pixIn.subtitle',
  'architecture.nodes.spiGateway.title',
  'architecture.nodes.spiGateway.subtitle',
  'architecture.nodes.keycloak.title',
  'architecture.nodes.keycloak.subtitle',
  'architecture.nodes.postgres.title',
  'architecture.nodes.postgres.subtitle',
  'architecture.nodes.redis.title',
  'architecture.nodes.s3.title',
  'architecture.nodes.sqs.title',
  'architecture.nodes.grafana.title',
  'architecture.nodes.grafana.subtitle',
  'architecture.nodes.hsm.title',
  'architecture.nodes.dict.title',
  'architecture.nodes.spi.title',
  'architecture.nodes.spi.subtitle',
  'architecture.nodes.str.title',
  'architecture.nodes.str.subtitle',
  'architecture.walkthrough.debited',
  'architecture.walkthrough.settled',
  'loadTest.log.workers.one',
  'loadTest.log.workers.other',
  'history.jobs.esatto.event1Note',
  'palette.tags.external',
];

const leaves = (locale) => Object.fromEntries(DictionaryLeaves.of(DICTIONARIES[locale]));

describe('internationalization', () => {
  let page;
  beforeAll(() => {
    page = SiteSource.html();
  });
  const all = (selector) => [...page.querySelectorAll(selector)];

  describe('the language of the document', () => {
    it('is declared on the root element as the default language, and every supported tag is canonical BCP 47', () => {
      expect([
        page.documentElement.getAttribute('lang'),
        Locale.DEFAULT,
        Intl.getCanonicalLocales(Locale.SUPPORTED),
        Locale.SUPPORTED,
      ]).toStrictEqual(['pt-BR', 'pt-BR', ['pt-BR', 'en-US'], ['pt-BR', 'en-US']]);
    });

    it('is the same everywhere the markup states it: the root element, the manifest, the Content-Language header and the primary Open Graph locale', () => {
      const manifest = JSON.parse(SiteSource.read('site.webmanifest'));
      const header = HtaccessHeaders.forFilesMatching(SiteSource.read('.htaccess'), '\\.html?$')[
        'Content-Language'
      ];
      const openGraph = page.querySelector('meta[property="og:locale"]').getAttribute('content');
      expect([
        page.documentElement.getAttribute('lang'),
        manifest.lang,
        header,
        openGraph.replace('_', '-'),
      ]).toStrictEqual(['pt-BR', 'pt-BR', 'pt-BR', 'pt-BR']);
    });

    it('is declared by a charset meta that comes first in the head, so the encoding is known before any text', () => {
      const source = SiteSource.read('index.html');
      expect([
        page.head.firstElementChild.outerHTML,
        source.indexOf('<meta charset="utf-8">') < 1024,
        source.includes('<meta http-equiv="Content-Language"'),
      ]).toStrictEqual(['<meta charset="utf-8">', true, false]);
    });

    it('needs no dir attribute because every supported language is written left to right', () => {
      const directions = Locale.SUPPORTED.map((tag) => {
        const locale = new Intl.Locale(tag);
        return (locale.getTextInfo?.() ?? locale.textInfo).direction;
      });
      expect([directions, page.documentElement.hasAttribute('dir')]).toStrictEqual([
        ['ltr', 'ltr'],
        false,
      ]);
    });
  });

  describe('alternate versions', () => {
    it('are announced with hreflang in the head: Portuguese at the root, English at /en/, and x-default for everyone else', () => {
      expect(
        all('link[rel=alternate][hreflang]').map((link) => [
          link.getAttribute('hreflang'),
          link.getAttribute('href'),
        ]),
      ).toStrictEqual([
        ['pt-BR', `${ORIGIN}/`],
        ['en', `${ORIGIN}/en/`],
        ['x-default', `${ORIGIN}/`],
      ]);
    });

    it('point at exactly the addresses the locale module builds for each language', () => {
      expect(Locale.SUPPORTED.map((tag) => Locale.urlFor(tag, `${ORIGIN}/`))).toStrictEqual([
        '/',
        '/en/',
      ]);
    });
  });

  describe('language of parts', () => {
    it('marks the elements whose language differs from the rest: the language links and the English metric name, nothing else', () => {
      expect(
        all('[lang]').map((element) => [
          element.tagName.toLowerCase(),
          element.getAttribute('lang'),
        ]),
      ).toStrictEqual([
        ['html', 'pt-BR'],
        ['a', 'pt-BR'],
        ['a', 'en-US'],
        ['small', 'en'],
      ]);
      expect(
        Intl.getCanonicalLocales(all('[lang]').map((element) => element.getAttribute('lang'))),
      ).toStrictEqual(['pt-BR', 'en-US', 'en']);
    });

    it('names each language in that language, starting with the label the link shows, so voice control and screen readers agree, and links to the page in that language', () => {
      expect(
        all('.locale-switcher a').map((link) => [
          link.getAttribute('lang'),
          link.textContent,
          link.getAttribute('aria-label'),
          link.getAttribute('title'),
          link.getAttribute('aria-current'),
          link.getAttribute('href'),
          link.getAttribute('hreflang'),
        ]),
      ).toStrictEqual([
        ['pt-BR', 'PT', 'PT, Português (Brasil)', 'Português (Brasil)', 'true', '/', 'pt-BR'],
        [
          'en-US',
          'EN',
          'EN, English (United States)',
          'English (United States)',
          null,
          '/en/',
          'en',
        ],
      ]);
    });

    it('keeps names, code and keys away from automatic translation with translate="no"', () => {
      expect(
        all('[translate=no]').map((element) => [
          element.tagName.toLowerCase(),
          element.className || element.id || element.textContent,
        ]),
      ).toStrictEqual([
        ['a', 'logo'],
        ['h1', 'hero-name'],
        ['kbd', 'modifier-key'],
        ['kbd', 'K'],
        ['small', 'first contentful paint'],
        ['div', 'marquee'],
        ['span', 'terminal-command'],
        ['pre', 'quiet-scroller'],
        ['kbd', '↑'],
        ['kbd', '↓'],
        ['kbd', '↵'],
        ['kbd', 'esc'],
      ]);
    });
  });

  describe('the two dictionaries', () => {
    it('leave in the same words only what is meant to be the same: service names, Central Bank terms, loan words and units', () => {
      const portuguese = leaves('pt-BR');
      const english = leaves('en-US');
      expect(
        Object.keys(english).filter(
          (key) => JSON.stringify(english[key]) === JSON.stringify(portuguese[key]),
        ),
      ).toStrictEqual(SAME_IN_BOTH_LANGUAGES);
    });

    it('keep Portuguese letters out of the English text except in names and the command that switches to Portuguese', () => {
      const english = Object.entries(leaves('en-US')).filter(
        ([key]) =>
          !SAME_IN_BOTH_LANGUAGES.includes(key) && key !== 'palette.commands.switchLocale.title',
      );
      const accented = english
        .filter(([, value]) =>
          /[\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]/.test(
            String(value).replace(/Taubaté|Pix Automático|résumé/g, ''),
          ),
        )
        .map(([key]) => key);
      expect([
        accented,
        leaves('en-US')['palette.commands.switchLocale.title'],
        leaves('pt-BR')['palette.commands.switchLocale.title'],
      ]).toStrictEqual([[], 'Mudar para português', 'Switch to English']);
    });

    it('write every plural with the two categories the code looks up, which both languages define', () => {
      const groups = (dictionary) =>
        Object.keys(dictionary)
          .filter((path) => path.endsWith('.one'))
          .map((path) => path.slice(0, -4));
      const portuguese = groups(leaves('pt-BR'));
      expect(portuguese).toStrictEqual(groups(leaves('en-US')));
      expect([
        ...new Set(
          Object.keys(leaves('pt-BR'))
            .filter((path) => portuguese.some((group) => path.startsWith(`${group}.`)))
            .map((path) => path.split('.').at(-1)),
        ),
      ]).toStrictEqual(['one', 'other']);
      expect(
        Locale.SUPPORTED.map((tag) =>
          ['one', 'other'].every((category) =>
            new Intl.PluralRules(tag).resolvedOptions().pluralCategories.includes(category),
          ),
        ),
      ).toStrictEqual([true, true]);
    });
  });

  describe('formatting and text', () => {
    const scripts = SiteSource.files('js').filter(
      (file) => file.endsWith('.js') && !file.endsWith('land-bitset.js'),
    );

    it('goes through Intl and the formatter only: no hand-made separators, no toLocale call, no number-to-text trick', () => {
      const offenders = scripts.filter((file) =>
        /\.toLocale\w*String\(|\.replace\(\s*(?:'\.'|"\."|\/\\\.\/g?)\s*,\s*['"],['"]\s*\)/.test(
          SiteSource.read(file),
        ),
      );
      expect(offenders).toStrictEqual([]);
    });

    it('builds every Intl formatter from a locale it was given: Intl is used in the formatter and the translator only', () => {
      expect(scripts.filter((file) => /\bIntl\./.test(SiteSource.read(file)))).toStrictEqual([
        'js/i18n/translator.js',
        'js/shared/format.js',
      ]);
    });

    it('names a language tag nowhere outside js/i18n/, so adding a language is one dictionary and one list', () => {
      expect(
        scripts.filter(
          (file) => !file.startsWith('js/i18n/') && /pt-BR|en-US/.test(SiteSource.read(file)),
        ),
      ).toStrictEqual([]);
    });

    it('draws no words inside the icon sprite, which could not be translated', () => {
      expect([
        SiteSource.read('assets/icons.svg').includes('<text'),
        SiteSource.read('icon.svg').includes('<text'),
      ]).toStrictEqual([false, false]);
    });

    it('keeps the dictionaries as the only place for text: no stray Portuguese word in the scripts outside js/i18n/', () => {
      const portugueseWords =
        /\b(?:Carregando|Verificando|Nenhum|Erro|Voltar|Fechar|Abrir|Enviar|Copiado|Indisponível)\b/;
      expect(
        scripts.filter(
          (file) => !file.startsWith('js/i18n/') && portugueseWords.test(SiteSource.read(file)),
        ),
      ).toStrictEqual([]);
    });
  });

  describe('files', () => {
    it('keep every translatable file inside the one folder, js/i18n/locales/, one per supported language', () => {
      expect(readdirSync(join(SiteSource.root, 'js', 'i18n', 'locales')).sort()).toStrictEqual([
        'en-us.js',
        'pt-br.js',
      ]);
    });
  });
});
