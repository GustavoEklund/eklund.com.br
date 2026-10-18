import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Locale } from '@site/js/i18n/locale.js';

const pathSegment = fc.stringMatching(/^[a-z0-9]{0,8}$/);
const extraQuery = fc.array(
  fc.tuple(fc.stringMatching(/^[a-km-z]{1,5}$/), fc.stringMatching(/^[a-z0-9]{0,5}$/)),
  { maxLength: 3 },
);
const hash = fc.stringMatching(/^(#[a-z]{1,8})?$/);
const pageUrl = (segment, query, fragment = '') => {
  const url = new URL(`https://eklund.com.br/${segment}${fragment}`);
  for (const [name, value] of query) url.searchParams.set(name, value);
  return url;
};

describe('Locale properties', () => {
  it('normalize returns a supported tag or null, never anything else', () =>
    fc.assert(
      fc.property(fc.string(), (tag) => {
        const expected = ['pt', 'en'].includes(tag.toLowerCase().split(/[-_]/)[0])
          ? { pt: 'pt-BR', en: 'en-US' }[tag.toLowerCase().split(/[-_]/)[0]]
          : null;
        expect(Locale.normalize(tag)).toBe(expected);
      }),
    ));

  it('normalize leaves each supported tag as it is', () =>
    fc.assert(
      fc.property(fc.constantFrom(...Locale.SUPPORTED), (tag) => {
        expect(Locale.normalize(tag)).toBe(tag);
      }),
    ));

  it('the address built for a locale is detected back as that locale', () =>
    fc.assert(
      fc.property(
        fc.constantFrom(...Locale.SUPPORTED),
        pathSegment,
        extraQuery,
        (locale, segment, query) => {
          const built = new URL(
            Locale.urlFor(locale, pageUrl(segment, query).href),
            'https://eklund.com.br',
          );
          expect(Locale.detect({ pathname: built.pathname })).toBe(locale);
        },
      ),
    ));

  it('urlFor is the page of the locale with every foreign parameter and the hash kept, and no lang', () =>
    fc.assert(
      fc.property(
        fc.constantFrom(...Locale.SUPPORTED),
        pathSegment,
        extraQuery,
        hash,
        fc.boolean(),
        (locale, segment, query, fragment, withLang) => {
          const base = pageUrl(segment, query, fragment);
          if (withLang) base.searchParams.set('lang', 'pt');
          const built = new URL(Locale.urlFor(locale, base.href), 'https://eklund.com.br');
          const kept = pageUrl(segment, query, fragment);
          expect([built.pathname, built.search, built.hash]).toStrictEqual([
            locale === 'en-US' ? '/en/' : '/',
            kept.search,
            kept.hash,
          ]);
        },
      ),
    ));
});
