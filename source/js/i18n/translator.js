import { Dom } from '../shared/dom.js';
import { DocumentMetadata } from './document-metadata.js';
import { Locale } from './locale.js';

const TEXT_SELECTOR = '[data-i18n]';
const HTML_SELECTOR = '[data-i18n-html]';
const ATTRIBUTE_SELECTOR = '[data-i18n-attr]';

/**
 * Looks strings up in the active dictionary and rewrites the markup that asks for them.
 * Markup contract, all values being dictionary keys: data-i18n (text), data-i18n-html (inline markup),
 * data-i18n-attr (attribute:key pairs separated by semicolons).
 */
export class Translator {
  #dictionaries;
  #locale;
  #pluralRules;
  #listeners = new Set();
  #reportedKeys = new Set();

  constructor({ dictionaries, locale }) {
    this.#dictionaries = dictionaries;
    this.#locale = locale;
    this.#pluralRules = new Intl.PluralRules(locale);
  }

  get locale() {
    return this.#locale;
  }

  /** Translates the initial markup and the document head; call once before mounting features. */
  mount() {
    this.#updateDocument();
    this.applyTo(document);
    return this;
  }

  /** Listener receives the new locale after the markup is already translated. */
  onChange(listener) {
    this.#listeners.add(listener);
  }

  setLocale(locale) {
    if (!this.#dictionaries[locale] || locale === this.#locale) return;
    this.#locale = locale;
    this.#pluralRules = new Intl.PluralRules(locale);
    this.#updateDocument();
    this.applyTo(document);
    for (const listener of this.#listeners) listener(locale);
  }

  /** Sets the element's text and records the key, so every later locale change retranslates it. */
  bind(element, key) {
    element.dataset.i18n = key;
    Dom.setText(element, this.t(key));
  }

  has(key) {
    return Translator.#lookup(this.#dictionaries[this.#locale], key) !== undefined;
  }

  t(key, params) {
    let value = Translator.#lookup(this.#dictionaries[this.#locale], key);
    if (value === undefined) {
      this.#report(key);
      value = Translator.#lookup(this.#dictionaries[Locale.DEFAULT], key);
    }
    if (typeof value !== 'string') return value === undefined ? key : String(value);
    return params ? value.replace(/\{(\w+)\}/g, (match, name) => params[name] ?? match) : value;
  }

  /** Picks `key.one` / `key.other` (any CLDR category the entry defines) by the count; `{count}` is filled in. */
  plural(key, count, params) {
    const category = this.#pluralRules.select(count);
    const entry = this.has(`${key}.${category}`) ? `${key}.${category}` : `${key}.other`;
    return this.t(entry, { count, ...params });
  }

  applyTo(root = document) {
    for (const element of Translator.#elementsIn(root, TEXT_SELECTOR))
      Dom.setText(element, this.t(element.dataset.i18n));
    for (const element of Translator.#elementsIn(root, HTML_SELECTOR))
      element.innerHTML = this.t(element.dataset.i18nHtml);
    for (const element of Translator.#elementsIn(root, ATTRIBUTE_SELECTOR)) {
      for (const [attribute, key] of Translator.#parseAttributes(element.dataset.i18nAttr))
        element.setAttribute(attribute, this.t(key));
    }
  }

  /** The title is dictionary text; the description and social tags are markup with data-i18n-attr, translated by applyTo. */
  #updateDocument() {
    DocumentMetadata.apply(this.#locale);
    document.title = this.t('meta.title');
  }

  static #lookup(dictionary, key) {
    let node = dictionary;
    for (const part of key.split('.')) {
      if (node == null || typeof node !== 'object') return undefined;
      node = node[part];
    }
    return node;
  }

  #report(key) {
    if (this.#reportedKeys.has(key)) return;
    this.#reportedKeys.add(key);
    console.warn(`[i18n] missing "${key}" in ${this.#locale}`);
  }

  static #elementsIn(root, selector) {
    const inside = Dom.queryAll(selector, root);
    return root.matches?.(selector) ? [root, ...inside] : inside;
  }

  static #parseAttributes(value) {
    return value
      .split(';')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const separator = pair.indexOf(':');
        return [pair.slice(0, separator).trim(), pair.slice(separator + 1).trim()];
      });
  }
}
