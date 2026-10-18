import { PT_BR } from '../../../source/js/i18n/locales/pt-br.js';
import { EN_US } from '../../../source/js/i18n/locales/en-us.js';

const DICTIONARIES = { 'pt-BR': PT_BR, 'en-US': EN_US };
const GROUP_SEPARATORS = { 'pt-BR': '.', 'en-US': ',' };
const PLACEHOLDER = /\{(\w+)\}/;
const TAG = /<[^>]+>/g;

/** The expected strings, taken from the dictionaries the site itself ships. */
export class DictionaryText {
  static of(locale) {
    return DICTIONARIES[locale];
  }

  /** A template as the visitor reads it: placeholders filled in and inline markup removed. */
  static plain(template, params = {}) {
    return template
      .replace(new RegExp(PLACEHOLDER, 'g'), (placeholder, name) =>
        String(params[name] ?? placeholder),
      )
      .replace(TAG, '');
  }

  /**
   * Reads the placeholder values back out of a rendered line, using the template's own literal text as the
   * separators, and throws when the line does not follow the template. Callers rebuild the line with `plain`
   * and compare it whole, so the literal text is still asserted exactly.
   */
  static extract(template, renderedText) {
    const parts = template.replace(TAG, '').split(PLACEHOLDER); // literal, name, literal, name, ..., literal
    const values = {};
    let position = 0;
    if (!renderedText.startsWith(parts[0]))
      throw new Error(`"${renderedText}" does not start with "${parts[0]}"`);
    position = parts[0].length;
    for (let index = 1; index < parts.length; index += 2) {
      const name = parts[index],
        following = parts[index + 1];
      const end =
        following === '' && index + 2 >= parts.length
          ? renderedText.length
          : renderedText.indexOf(following, position);
      if (end < 0) throw new Error(`"${renderedText}" has no "${following}" after "${name}"`);
      values[name] = renderedText.slice(position, end);
      position = end + following.length;
    }
    return values;
  }

  static pluralKey(locale, entry, count) {
    return `${entry}.${new Intl.PluralRules(locale).select(count)}`;
  }

  static parseInteger(text, locale) {
    return Number(text.split(GROUP_SEPARATORS[locale]).join(''));
  }

  static formatInteger(value, locale) {
    return new Intl.NumberFormat(locale).format(Math.round(value));
  }
}
