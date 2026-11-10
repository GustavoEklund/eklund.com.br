import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HeadScript } from '../support/head-script.js';
import { Locale } from '@site/js/i18n/locale.js';
import { PrivacyChoice } from '@site/js/privacy/privacy-choice.js';

const redirect = (visitor) => HeadScript.run(visitor).redirectedTo;
const GOOGLEBOT =
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/130 Safari/537.36';

describe('the inline script in the head of index.html', () => {
  describe('on the Portuguese page, where only a choice of English sends a visitor to /en/ (0012)', () => {
    it.each([
      ['a browser in Portuguese', { languages: ['pt-BR'] }, null],
      ['a browser in English, which gets the offer instead', { languages: ['en-US'] }, null],
      ['a browser that lists English first', { languages: ['en-GB', 'pt-BR'] }, null],
      ['a browser that lists no language', { languages: [] }, null],
      [
        'English chosen on an earlier visit, in a browser in Portuguese',
        { saved: { lang: 'en-US' }, languages: ['pt-BR'] },
        '/en/',
      ],
      [
        'English chosen on an earlier visit, saved as a bare tag',
        { saved: { lang: 'en' }, languages: ['pt-BR'] },
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
        null,
      ],
      [
        '?lang=fr, which the site does not translate, in a browser in English',
        { search: '?lang=fr', languages: ['en-GB'] },
        null,
      ],
      [
        '?lang=fr over a saved English choice: the choice decides',
        { search: '?lang=fr', saved: { lang: 'en-US' } },
        '/en/',
      ],
      [
        '?lang=en, whatever was chosen before',
        { search: '?lang=en', saved: { lang: 'pt-BR' }, languages: ['pt-BR'] },
        '/en/',
      ],
      [
        '?lang=pt over a saved English choice',
        { search: '?lang=pt', saved: { lang: 'en-US' } },
        null,
      ],
      ['the same address as /', { pathname: '/index.html', saved: { lang: 'en-US' } }, '/en/'],
    ])('%s', (_description, visitor, expected) => {
      expect(redirect(visitor)).toBe(expected);
    });

    it.each([
      ['/#carga', '/en/#carga'],
      ['/?utm=x#carga', '/en/?utm=x#carga'],
      ['/?utm=x&lang=en&y=2#carga', '/en/?utm=x&y=2#carga'],
    ])('keeps what the address carries, except lang: %s goes to %s', (address, expected) => {
      const { pathname, search, hash } = new URL(address, 'https://eklund.com.br');
      expect(redirect({ pathname, search, hash, saved: { lang: 'en-US' } })).toBe(expected);
    });

    it('leaves a crawler where it is, so the Portuguese page is the one that gets indexed at /', () => {
      expect(redirect({ userAgent: GOOGLEBOT, languages: ['en-US'] })).toBeNull();
    });

    it('still sends a crawler that follows an explicit ?lang=en link, which is an address and not a guess', () => {
      expect(redirect({ userAgent: GOOGLEBOT, search: '?lang=en', languages: ['en-US'] })).toBe(
        '/en/',
      );
    });

    it('sends no one when localStorage is blocked, except by the address', () => {
      expect([
        redirect({ storageBlocked: true, languages: ['en-US'] }),
        redirect({ storageBlocked: true, search: '?lang=en' }),
      ]).toStrictEqual([null, '/en/']);
    });

    it('agrees with Locale.normalize about which saved tags are English', () => {
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
      expect(tags.map((tag) => redirect({ saved: { lang: tag } }) === '/en/')).toStrictEqual(
        tags.map((tag) => Locale.normalize(tag) === 'en-US'),
      );
    });

    it('never reads the browser languages', () => {
      const tags = ['en-US', 'en-GB', 'pt-BR', 'fr', 'de'];
      expect(tags.map((tag) => redirect({ languages: [tag] }))).toStrictEqual(tags.map(() => null));
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

  describe('the privacy notice (0010), decided before the first paint', () => {
    const NOW = Date.UTC(2026, 10, 9, 12);
    const stored = (fields) =>
      JSON.stringify({
        version: PrivacyChoice.VERSION,
        measurement: true,
        recording: false,
        expires: NOW + 1000,
        ...fields,
      });
    /** Whether the notice shows, by the script in the head and by PrivacyChoice, for the same browser. */
    const asks = ({ saved = {}, globalPrivacyControl, storageBlocked = false }) => {
      const head = HeadScript.run({ saved, globalPrivacyControl, storageBlocked }).dataset.privacy;
      const choice = new PrivacyChoice({
        storage: {
          read: (key) => (storageBlocked ? null : (saved[key] ?? null)),
          write: () => {},
        },
        now: () => NOW,
        globalPrivacyControl,
      });
      return [head === 'ask', !choice.decided];
    };

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      ['nothing saved', {}, true],
      ['a current choice', { saved: { privacy: stored() } }, false],
      ['a current refusal', { saved: { privacy: stored({ measurement: false }) } }, false],
      [
        'a choice that ran out this very moment',
        { saved: { privacy: stored({ expires: NOW }) } },
        true,
      ],
      ['a choice that ran out', { saved: { privacy: stored({ expires: NOW - 1 }) } }, true],
      ['a choice of an older version', { saved: { privacy: stored({ version: 0 }) } }, true],
      [
        'a choice of a newer version',
        { saved: { privacy: stored({ version: PrivacyChoice.VERSION + 1 }) } },
        true,
      ],
      ['a choice with no expiry', { saved: { privacy: stored({ expires: undefined }) } }, true],
      ['a value that is not JSON', { saved: { privacy: 'yes' } }, true],
      ['a value that is JSON but no object', { saved: { privacy: '1' } }, true],
      ['localStorage blocked', { storageBlocked: true }, true],
      ['Global Privacy Control, nothing saved', { globalPrivacyControl: true }, false],
      [
        'Global Privacy Control over a choice that ran out',
        { globalPrivacyControl: true, saved: { privacy: stored({ expires: NOW - 1 }) } },
        false,
      ],
      ['Global Privacy Control turned off', { globalPrivacyControl: false }, true],
      ['a Global Privacy Control that is not true', { globalPrivacyControl: '1' }, true],
    ])('%s: shows the notice is %s, as PrivacyChoice says', (_description, visitor, expected) => {
      expect(asks(visitor)).toStrictEqual([expected, expected]);
    });

    it('leaves data-privacy out when nothing has to be asked, so the stylesheet keeps the notice hidden', () => {
      expect(
        Object.hasOwn(HeadScript.run({ saved: { privacy: stored() } }).dataset, 'privacy'),
      ).toBe(false);
    });

    it('still applies the theme and the motion when the saved choice is not JSON', () => {
      const { dataset } = HeadScript.run({
        saved: { privacy: '{', theme: 'light', motion: 'paused' },
      });
      expect([dataset.theme, dataset.motion, dataset.privacy]).toStrictEqual([
        'light',
        'paused',
        'ask',
      ]);
    });
  });
});
