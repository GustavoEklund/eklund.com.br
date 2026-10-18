import { describe, it, expect } from 'vitest';
import { HeadScript } from '../support/head-script.js';
import { Locale } from '@site/js/i18n/locale.js';

const redirect = (visitor) => HeadScript.run(visitor).redirectedTo;
const GOOGLEBOT =
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/130 Safari/537.36';

describe('the inline script in the head of index.html', () => {
  describe('on the Portuguese page, where English readers are sent to /en/', () => {
    it.each([
      ['a browser in Portuguese', { languages: ['pt-BR'] }, null],
      ['a browser in English', { languages: ['en-US'] }, '/en/'],
      ['a browser in British English', { languages: ['en-GB'] }, '/en/'],
      ['a browser that lists English first', { languages: ['en-GB', 'pt-BR'] }, '/en/'],
      ['a browser that lists Portuguese first', { languages: ['pt-PT', 'en-US'] }, null],
      ['a browser in a language the site is not translated into', { languages: ['fr-FR'] }, null],
      ['a browser that lists no language', { languages: [] }, null],
      [
        'English chosen on an earlier visit, in a browser in Portuguese',
        { saved: { lang: 'en-US' }, languages: ['pt-BR'] },
        '/en/',
      ],
      [
        'Portuguese chosen on an earlier visit, in a browser in English',
        { saved: { lang: 'pt-BR' }, languages: ['en-US'] },
        null,
      ],
      [
        'a saved choice the site does not know, in a browser in English',
        { saved: { lang: 'klingon' }, languages: ['en-US'] },
        '/en/',
      ],
      [
        'a saved choice the site does not know, in a browser in Portuguese',
        { saved: { lang: 'klingon' }, languages: ['pt-BR'] },
        null,
      ],
      [
        'a browser that lists a language the site does not translate before English',
        { languages: ['de', 'en-AU'] },
        '/en/',
      ],
      [
        '?lang=fr, which the site does not translate: the browser decides',
        { search: '?lang=fr', languages: ['en-GB'] },
        '/en/',
      ],
      [
        '?lang=fr in a browser in Portuguese, whatever else was chosen',
        { search: '?lang=fr', saved: { lang: 'pt-BR' }, languages: ['en-GB'] },
        null,
      ],
      [
        '?lang=en, whatever was chosen before',
        { search: '?lang=en', saved: { lang: 'pt-BR' }, languages: ['pt-BR'] },
        '/en/',
      ],
      ['?lang=pt in a browser in English', { search: '?lang=pt', languages: ['en-US'] }, null],
      [
        '?lang=pt over a saved English choice',
        { search: '?lang=pt', saved: { lang: 'en-US' } },
        null,
      ],
      ['the same address as /', { pathname: '/index.html', languages: ['en-US'] }, '/en/'],
    ])('%s', (_description, visitor, expected) => {
      expect(redirect(visitor)).toBe(expected);
    });

    it.each([
      ['/#carga', '/en/#carga'],
      ['/?utm=x#carga', '/en/?utm=x#carga'],
      ['/?utm=x&lang=en&y=2#carga', '/en/?utm=x&y=2#carga'],
    ])('keeps what the address carries, except lang: %s goes to %s', (address, expected) => {
      const { pathname, search, hash } = new URL(address, 'https://eklund.com.br');
      expect(redirect({ pathname, search, hash, languages: ['en-US'] })).toBe(expected);
    });

    it('leaves a crawler where it is, so the Portuguese page is the one that gets indexed at /', () => {
      expect(redirect({ userAgent: GOOGLEBOT, languages: ['en-US'] })).toBeNull();
    });

    it('still sends a crawler that follows an explicit ?lang=en link, which is an address and not a guess', () => {
      expect(redirect({ userAgent: GOOGLEBOT, search: '?lang=en', languages: ['en-US'] })).toBe(
        '/en/',
      );
    });

    it('goes by the browser language when localStorage is blocked', () => {
      expect([
        redirect({ storageBlocked: true, languages: ['en-US'] }),
        redirect({ storageBlocked: true, languages: ['pt-BR'] }),
      ]).toStrictEqual(['/en/', null]);
    });

    it('agrees with Locale.normalize about which tags are English', () => {
      const tags = [
        'en',
        'en-US',
        'en-GB',
        'EN-au',
        'en_CA',
        'pt',
        'pt-BR',
        'pt-PT',
        'fr',
        'es-ES',
        'de-DE',
        'english',
        'ptx',
        '',
      ];
      expect(tags.map((tag) => redirect({ languages: [tag] }) === '/en/')).toStrictEqual(
        tags.map((tag) => Locale.normalize(tag) === 'en-US'),
      );
    });
  });

  describe('on the English page and anywhere else', () => {
    it.each([
      ['/en/', { languages: ['pt-BR'] }],
      ['/en/', { languages: ['en-US'] }],
      ['/en/', { search: '?lang=en', saved: { lang: 'en-US' } }],
      ['/en/index.html', { languages: ['en-US'] }],
      ['/anything-else', { languages: ['en-US'] }],
    ])('does not redirect at %s', (pathname, visitor) => {
      expect(redirect({ pathname, ...visitor })).toBeNull();
    });
  });

  describe('the motion setting', () => {
    it.each([
      ['a saved pause', { saved: { motion: 'paused' } }, 'paused'],
      ['a saved play', { saved: { motion: 'full' } }, 'full'],
      [
        'a saved play on a system that asks for less motion',
        { saved: { motion: 'full' }, reducedMotion: true },
        'full',
      ],
      [
        'a saved pause on a system that asks for nothing',
        { saved: { motion: 'paused' }, reducedMotion: false },
        'paused',
      ],
      ['nothing saved', {}, 'full'],
      ['nothing saved, on a system that asks for less motion', { reducedMotion: true }, 'paused'],
      ['a saved value that is neither', { saved: { motion: 'maybe' } }, 'full'],
      [
        'a saved value that is neither, on a system that asks for less motion',
        { saved: { motion: 'maybe' }, reducedMotion: true },
        'paused',
      ],
      ['localStorage blocked', { storageBlocked: true }, 'full'],
      [
        'localStorage blocked, on a system that asks for less motion',
        { storageBlocked: true, reducedMotion: true },
        'paused',
      ],
    ])('%s: data-motion is %s before the first paint', (_description, visitor, expected) => {
      expect(HeadScript.run(visitor).dataset.motion).toBe(expected);
    });
  });

  describe('the theme and the hue', () => {
    it('applies the saved ones, and marks the page as scripted', () => {
      const { dataset, properties, classes } = HeadScript.run({
        saved: { theme: 'light', hue: '200' },
      });
      expect([dataset.theme, properties['--hue'], classes]).toStrictEqual(['light', '200', ['js']]);
    });

    it('leaves the markup as it is when nothing was saved', () => {
      const { dataset, properties } = HeadScript.run({});
      expect([dataset.theme, properties]).toStrictEqual([undefined, {}]);
    });
  });
});
