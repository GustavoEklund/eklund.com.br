// The English version of the page, en/index.html, generated from index.html and the en-US dictionary: the same markup with every
// default text written in English, the language and the address of this version declared, and the paths made absolute (the page
// is one folder down, so css/site.css would no longer be found). Crawlers and social cards read this file as it is; the
// scripts then take over exactly as they do on the Portuguese page.
import { HtmlDefaults } from './html-defaults.mjs';

export class EnglishPage {
  static ORIGIN = 'https://eklund.com.br';
  static PATH = '/en/';

  /** @param {string} portugueseHtml index.html with its defaults in sync  @param {Map<string, string>} english the en-US dictionary, flattened */
  static render(portugueseHtml, english) {
    let html = HtmlDefaults.sync(portugueseHtml, english).html;
    html = EnglishPage.#declareLanguage(html);
    html = EnglishPage.#pointToThisVersion(html);
    html = EnglishPage.#markCurrentLanguage(html);
    return EnglishPage.#makePathsAbsolute(html);
  }

  static #declareLanguage(html) {
    return html
      .replace('<html lang="pt-BR"', '<html lang="en-US"')
      .replace(
        '<meta property="og:locale" content="pt_BR">',
        '<meta property="og:locale" content="en_US">',
      )
      .replace(
        '<meta property="og:locale:alternate" content="en_US">',
        '<meta property="og:locale:alternate" content="pt_BR">',
      );
  }

  /** The canonical link and og:url name this version, not the Portuguese one. */
  static #pointToThisVersion(html) {
    const address = `${EnglishPage.ORIGIN}${EnglishPage.PATH}`;
    return html
      .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${address}$2`)
      .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${address}$2`);
  }

  /** The language links of the header: the one for this page is the current one. */
  static #markCurrentLanguage(html) {
    return html
      .replace(/(<a [^>]*data-locale="pt-BR"[^>]*?) aria-current="true"/, '$1')
      .replace(/(<a [^>]*data-locale="en-US"[^>]*?)>/, '$1 aria-current="true">');
  }

  /** Every href and src that points into the site, starting from the root; addresses, anchors and mail links stay. */
  static #makePathsAbsolute(html) {
    return html.replace(/(\s(?:href|src)=")(?![a-z][a-z0-9+.-]*:|\/|#)([^"]*)(")/g, '$1/$2$3');
  }
}
