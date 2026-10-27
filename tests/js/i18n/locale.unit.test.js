import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Locale } from '@site/js/i18n/locale.js';
import { Preferences } from '@site/js/shared/storage.js';

describe('Locale constants', () => {
  it('defaults to Brazilian Portuguese', () => expect(Locale.DEFAULT).toBe('pt-BR'));
  it('supports exactly pt-BR and en-US, in that order', () =>
    expect(Locale.SUPPORTED).toStrictEqual(['pt-BR', 'en-US']));
});

describe('Locale.normalize', () => {
  it.each([
    ['en', 'en-US'],
    ['en-US', 'en-US'],
    ['en-GB', 'en-US'],
    ['EN-au', 'en-US'],
    ['en_CA', 'en-US'],
    ['pt', 'pt-BR'],
    ['pt-BR', 'pt-BR'],
    ['pt-PT', 'pt-BR'],
    ['PT_br', 'pt-BR'],
  ])('maps %s to %s', (tag, expected) => expect(Locale.normalize(tag)).toBe(expected));

  it.each([['fr'], ['es-ES'], ['english'], ['ptx'], ['de-DE'], ['']])(
    'does not translate %j',
    (tag) => expect(Locale.normalize(tag)).toBeNull(),
  );
  it.each([[null], [undefined]])('returns null for %s', (tag) =>
    expect(Locale.normalize(tag)).toBeNull(),
  );
  it('accepts non-string input by converting it to text', () =>
    expect(Locale.normalize({ toString: () => 'en-GB' })).toBe('en-US'));
});

describe('Locale.detect', () => {
  let read;

  beforeEach(() => {
    localStorage.clear();
    read = vi.spyOn(Preferences, 'read');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    history.replaceState(null, '', '/');
  });

  it.each([
    ['/', 'pt-BR'],
    ['/index.html', 'pt-BR'],
    ['/en/', 'en-US'],
    ['/en', 'en-US'],
    ['/en/index.html', 'en-US'],
    ['/en/anything/deeper', 'en-US'],
    ['/pt/', 'pt-BR'],
    ['/english', 'pt-BR'],
    ['/enigma/', 'pt-BR'],
    ['/1.1.0/', 'pt-BR'],
    ['/1.1.0/index.html', 'pt-BR'],
    ['/1.1.0/en/', 'en-US'],
    ['/1.1.0/en', 'en-US'],
    ['/1.1.0/en/index.html', 'en-US'],
    ['/1.1.0-rc.1/en/', 'en-US'],
    ['/1.1.0/english/', 'pt-BR'],
  ])('puts the page at %s in %s: the address says which language it is', (pathname, expected) =>
    expect(Locale.detect({ pathname })).toBe(expected),
  );

  it('does not read the saved choice or the browser languages: the head script of index.html decides where a visitor lands, and the address decides after that', () => {
    localStorage.setItem('lang', 'en-US');
    vi.stubGlobal('navigator', { languages: ['en-US'] });
    expect(Locale.detect({ pathname: '/' })).toBe('pt-BR');
    expect(read).toHaveBeenCalledTimes(0);
  });

  it('ignores a ?lang query, which the server and the head script turn into an address', () => {
    history.replaceState(null, '', '/?lang=en');
    expect(Locale.detect()).toBe('pt-BR');
  });

  it('reads location.pathname when called without arguments', () => {
    history.replaceState(null, '', '/en/#carga');
    expect(Locale.detect()).toBe('en-US');
  });
});

describe('Locale.remember', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('writes the choice under "lang" through Preferences, once: the head script reads it on the next visit', () => {
    const write = vi.spyOn(Preferences, 'write');
    Locale.remember('en-US');
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenNthCalledWith(1, 'lang', 'en-US');
    expect(localStorage.getItem('lang')).toBe('en-US');
  });
});

describe('Locale.urlFor', () => {
  it('is /en/ for English', () =>
    expect(Locale.urlFor('en-US', 'https://eklund.com.br/')).toBe('/en/'));
  it('is the root for the default language', () =>
    expect(Locale.urlFor('pt-BR', 'https://eklund.com.br/en/')).toBe('/'));
  it('keeps the other parameters and the hash', () => {
    expect(Locale.urlFor('en-US', 'https://eklund.com.br/?x=1#carga')).toBe('/en/?x=1#carga');
    expect(Locale.urlFor('pt-BR', 'https://eklund.com.br/en/?x=1&y=2#carga')).toBe(
      '/?x=1&y=2#carga',
    );
  });
  it('drops the ?lang the page was reached with', () => {
    expect(Locale.urlFor('en-US', 'https://eklund.com.br/?lang=pt')).toBe('/en/');
    expect(Locale.urlFor('pt-BR', 'https://eklund.com.br/?lang=en&x=1')).toBe('/?x=1');
  });
  it('never includes the host', () =>
    expect(Locale.urlFor('en-US', 'https://other.example:8443/x')).toBe('/en/'));
  it('stays in the folder of a version: its English page is its en/ folder, and its Portuguese page the folder itself', () =>
    expect([
      Locale.urlFor('en-US', 'https://eklund.com.br/1.1.0/'),
      Locale.urlFor('en-US', 'https://eklund.com.br/1.1.0/index.html?x=1#carga'),
      Locale.urlFor('pt-BR', 'https://eklund.com.br/1.1.0/en/'),
      Locale.urlFor('pt-BR', 'https://eklund.com.br/1.1.0/en/index.html?lang=en#carga'),
      Locale.urlFor('en-US', 'https://eklund.com.br/1.1.0/en/'),
      Locale.urlFor('pt-BR', 'https://eklund.com.br/1.1.0/'),
    ]).toStrictEqual([
      '/1.1.0/en/',
      '/1.1.0/en/?x=1#carga',
      '/1.1.0/',
      '/1.1.0/#carga',
      '/1.1.0/en/',
      '/1.1.0/',
    ]));
  it('defaults to the current location', () => {
    history.replaceState(null, '', '/?z=9#top');
    expect(Locale.urlFor('en-US')).toBe('/en/?z=9#top');
    history.replaceState(null, '', '/');
  });
});
