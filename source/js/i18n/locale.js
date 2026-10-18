import { Preferences } from '../shared/storage.js';

const STORAGE_KEY = 'lang';

/**
 * The language tags the site is translated into. Each language has its own page, and the address says which one this is
 * (/ is Portuguese, /en/ is English). Which page a visitor lands on is decided before the first paint by the inline script in
 * the head of index.html: the language they chose on an earlier visit (localStorage `lang`, written by `remember`), else
 * the language of their browser, else Portuguese.
 */
export class Locale {
  static DEFAULT = 'pt-BR';
  static SUPPORTED = ['pt-BR', 'en-US'];
  static #PATHS = { 'pt-BR': '/', 'en-US': '/en/' };

  /** The language of the page at this address: /en/ is English, everything else is the default language. */
  static detect({ pathname = location.pathname } = {}) {
    return pathname === '/en' || pathname.startsWith('/en/') ? 'en-US' : Locale.DEFAULT;
  }

  /** Maps 'en', 'en-GB', 'pt_PT'… to a supported tag; null when the language is not translated. */
  static normalize(tag) {
    if (!tag) return null;
    const language = String(tag).toLowerCase().split(/[-_]/)[0];
    if (language === 'en') return 'en-US';
    if (language === 'pt') return 'pt-BR';
    return null;
  }

  static remember(locale) {
    Preferences.write(STORAGE_KEY, locale);
  }

  /** The path of the page in `locale`, with the query and the hash of `href` kept (the old ?lang is dropped). */
  static urlFor(locale, href = location.href) {
    const url = new URL(href);
    url.searchParams.delete('lang');
    return Locale.#PATHS[locale] + url.search + url.hash;
  }
}
