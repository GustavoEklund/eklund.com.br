import { Preferences } from '../shared/storage.js';

const STORAGE_KEY = 'lang';

/**
 * The language tags the site is translated into. Each language has its own page, and the address says which one this is: the
 * folder the site lives in is Portuguese, and its en/ folder is English. That folder is / on eklund.com.br and /1.1.0/ in
 * the copy of version 1.1.0. Which page a visitor lands on is decided before the first paint by the inline script in the
 * head of index.html: the language they chose on an earlier visit (localStorage `lang`, written by `remember`), else the
 * language of their browser, else Portuguese.
 */
export class Locale {
  static DEFAULT = 'pt-BR';
  static SUPPORTED = ['pt-BR', 'en-US'];
  static #PAGES = { 'pt-BR': '', 'en-US': 'en/' };

  /** The language of the page at this address: anything inside an en/ folder is English, everything else the default language. */
  static detect({ pathname = location.pathname } = {}) {
    return /\/en(?:\/|$)/.test(pathname) ? 'en-US' : Locale.DEFAULT;
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

  /** The path of the page in `locale`, in the folder of `href`, with its query and hash kept (the old ?lang is dropped). */
  static urlFor(locale, href = location.href) {
    const url = new URL(href);
    url.searchParams.delete('lang');
    return Locale.#folderOf(url.pathname) + Locale.#PAGES[locale] + url.search + url.hash;
  }

  /** The folder the site lives in: the one around en/ on an English page, the folder of the page on any other. */
  static #folderOf(pathname) {
    const english = /^(.*\/)en(?:\/.*)?$/.exec(pathname);
    return english ? english[1] : pathname.slice(0, pathname.lastIndexOf('/') + 1);
  }
}
