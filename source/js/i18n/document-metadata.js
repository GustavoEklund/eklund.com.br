import { Dom } from '../shared/dom.js';
import { Locale } from './locale.js';

/**
 * The parts of the document head that follow the language without being translated text: the lang attribute, the
 * language of the social-card tags (og:locale and its alternates) and the address of this language's version
 * (canonical link and og:url). Titles and descriptions are dictionary text and go through the markup contract of Translator.
 */
export class DocumentMetadata {
  static apply(locale) {
    document.documentElement.lang = locale;
    DocumentMetadata.#applyOpenGraphLocales(locale);
    DocumentMetadata.#applyVersionAddress(locale);
  }

  /** A language tag as Open Graph writes it, with an underscore: pt-BR becomes pt_BR. */
  static openGraphLocale(locale) {
    return locale.replace('-', '_');
  }

  static #applyOpenGraphLocales(locale) {
    const primary = Dom.query('meta[property="og:locale"]');
    if (!primary) return;
    primary.setAttribute('content', DocumentMetadata.openGraphLocale(locale));
    const alternates = Locale.SUPPORTED.filter((supported) => supported !== locale).map(
      DocumentMetadata.openGraphLocale,
    );
    const tags = Dom.queryAll('meta[property="og:locale:alternate"]');
    let previous = primary;
    alternates.forEach((value, index) => {
      const tag = tags[index] ?? DocumentMetadata.#createAlternateAfter(previous);
      tag.setAttribute('content', value);
      previous = tag;
    });
    for (const extra of tags.slice(alternates.length)) extra.remove();
  }

  static #createAlternateAfter(previous) {
    const tag = document.createElement('meta');
    tag.setAttribute('property', 'og:locale:alternate');
    previous.after(tag);
    return tag;
  }

  /** The canonical link and og:url name the URL of the version being shown: the bare address for pt-BR, /en/ for en-US. */
  static #applyVersionAddress(locale) {
    const canonical = Dom.query('link[rel=canonical]');
    if (!canonical) return;
    const address = new URL(Locale.urlFor(locale, canonical.href), canonical.href).href;
    canonical.setAttribute('href', address);
    Dom.query('meta[property="og:url"]')?.setAttribute('content', address);
  }
}
