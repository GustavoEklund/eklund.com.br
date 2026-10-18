import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentMetadata } from '@site/js/i18n/document-metadata.js';
import { Locale } from '@site/js/i18n/locale.js';

const HEAD = `
  <link rel="canonical" href="https://eklund.com.br/">
  <meta property="og:url" content="https://eklund.com.br/">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:locale:alternate" content="en_US">
  <meta property="og:image" content="https://eklund.com.br/card.png">`;
const read = (selector, attribute) =>
  [...document.querySelectorAll(selector)].map((element) => element.getAttribute(attribute));
const metaLocales = () => read('meta[property^="og:locale"]', 'content');

describe('DocumentMetadata', () => {
  beforeEach(() => {
    document.head.innerHTML = HEAD;
    document.documentElement.removeAttribute('lang');
  });

  describe('openGraphLocale', () => {
    it.each([
      ['pt-BR', 'pt_BR'],
      ['en-US', 'en_US'],
    ])('writes %s as %s', (tag, expected) => {
      expect(DocumentMetadata.openGraphLocale(tag)).toBe(expected);
    });
  });

  describe('apply', () => {
    it('sets the lang attribute of the document', () => {
      DocumentMetadata.apply('en-US');
      expect(document.documentElement.lang).toBe('en-US');
    });

    it('swaps the primary og:locale and its alternate when the language changes, in that order', () => {
      DocumentMetadata.apply('en-US');
      expect(metaLocales()).toStrictEqual(['en_US', 'pt_BR']);
      DocumentMetadata.apply('pt-BR');
      expect(metaLocales()).toStrictEqual(['pt_BR', 'en_US']);
    });

    it('creates the alternate tag right after og:locale when the page has none', () => {
      document.head.innerHTML = HEAD.replace(
        '<meta property="og:locale:alternate" content="en_US">',
        '',
      );
      DocumentMetadata.apply('pt-BR');
      expect(
        Array.from(
          document.head.children,
          (element) => element.getAttribute('property') ?? element.getAttribute('rel'),
        ),
      ).toStrictEqual(['canonical', 'og:url', 'og:locale', 'og:locale:alternate', 'og:image']);
      expect(metaLocales()).toStrictEqual(['pt_BR', 'en_US']);
    });

    it('creates several missing alternates in the order of the supported languages, each after the one before', () => {
      const supported = [...Locale.SUPPORTED];
      Locale.SUPPORTED.push('es-ES');
      try {
        document.head.innerHTML = HEAD.replace(
          '<meta property="og:locale:alternate" content="en_US">',
          '',
        );
        DocumentMetadata.apply('pt-BR');
        expect(metaLocales()).toStrictEqual(['pt_BR', 'en_US', 'es_ES']);
      } finally {
        Locale.SUPPORTED.splice(0, Locale.SUPPORTED.length, ...supported);
      }
    });

    it('removes alternate tags beyond the supported languages', () => {
      document.head.innerHTML = `${HEAD}<meta property="og:locale:alternate" content="es_ES"><meta property="og:locale:alternate" content="fr_FR">`;
      DocumentMetadata.apply('pt-BR');
      expect(metaLocales()).toStrictEqual(['pt_BR', 'en_US']);
    });

    it('points the canonical link and og:url at the root in Portuguese and at /en/ in English', () => {
      DocumentMetadata.apply('en-US');
      expect([
        read('link[rel=canonical]', 'href'),
        read('meta[property="og:url"]', 'content'),
      ]).toStrictEqual([['https://eklund.com.br/en/'], ['https://eklund.com.br/en/']]);
      DocumentMetadata.apply('pt-BR');
      expect([
        read('link[rel=canonical]', 'href'),
        read('meta[property="og:url"]', 'content'),
      ]).toStrictEqual([['https://eklund.com.br/'], ['https://eklund.com.br/']]);
    });

    it('keeps the origin the canonical link declares, whatever address the page is served from', () => {
      document.head.innerHTML = HEAD.replaceAll('https://eklund.com.br/', 'https://example.test/');
      DocumentMetadata.apply('en-US');
      expect(read('link[rel=canonical]', 'href')).toStrictEqual(['https://example.test/en/']);
    });

    it('leaves other social tags alone', () => {
      DocumentMetadata.apply('en-US');
      expect(read('meta[property="og:image"]', 'content')).toStrictEqual([
        'https://eklund.com.br/card.png',
      ]);
    });

    it('only sets lang when the head has no social or canonical tags', () => {
      document.head.innerHTML = '';
      DocumentMetadata.apply('en-US');
      expect([document.documentElement.lang, document.head.innerHTML]).toStrictEqual(['en-US', '']);
    });

    it('updates the canonical link even without og:url', () => {
      document.head.innerHTML = '<link rel="canonical" href="https://eklund.com.br/">';
      DocumentMetadata.apply('en-US');
      expect(read('link[rel=canonical]', 'href')).toStrictEqual(['https://eklund.com.br/en/']);
    });
  });
});
