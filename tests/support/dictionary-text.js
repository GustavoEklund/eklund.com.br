import { Dictionaries } from '@site/js/i18n/dictionaries.js';

/** Looks entries up in the real dictionaries and fills their {placeholders}, so tests check wiring without freezing copy. */
export class DictionaryText {
  static #lookup(locale, key) {
    return key.split('.').reduce((node, part) => node[part], Dictionaries.BY_LOCALE[locale]);
  }

  static entry(locale, key) {
    return DictionaryText.#lookup(locale, key);
  }

  static fill(locale, key, params = {}) {
    return DictionaryText.#lookup(locale, key).replace(/\{(\w+)\}/g, (match, name) =>
      String(params[name] ?? match),
    );
  }

  /** The `one` or `other` form of a plural entry, filled with {count} and any extra params. */
  static plural(locale, key, count, params = {}) {
    const form = new Intl.PluralRules(locale).select(count);
    const entry = DictionaryText.#lookup(locale, key);
    return (entry[form] ?? entry.other).replace(/\{(\w+)\}/g, (match, name) =>
      String({ count, ...params }[name] ?? match),
    );
  }
}
