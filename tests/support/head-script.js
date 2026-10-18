import { SiteSource } from './site-source.js';

/**
 * The inline script in the head of a page, run against a stand-in browser: what it settles before the first paint.
 * It sets the theme, the hue and the motion setting on the root element and, on the Portuguese page, sends English readers
 * to /en/. The script is the real one from the file; only the browser around it is made up.
 */
export class HeadScript {
  /** The code of the one inline classic script of a page. */
  static source(html = SiteSource.read('index.html')) {
    const scripts = [
      ...html.matchAll(/<script(?![^>]*\s(?:src|type)=)[^>]*>([\s\S]*?)<\/script>/g),
    ];
    if (scripts.length !== 1)
      throw new Error(`Expected one inline script, found ${scripts.length}`);
    return scripts[0][1];
  }

  /**
   * @param {object} visitor what the stand-in browser holds
   * @param {string} [visitor.pathname] @param {string} [visitor.search] @param {string} [visitor.hash]
   * @param {Record<string, string>} [visitor.saved] localStorage, by key
   * @param {string[]} [visitor.languages] navigator.languages
   * @param {string} [visitor.userAgent] @param {boolean} [visitor.reducedMotion] the system asks for less motion
   * @param {boolean} [visitor.storageBlocked] localStorage throws, as in a private window of some browsers
   * @returns {{ redirectedTo: string | null, dataset: object, classes: string[], properties: object }}
   */
  static run({
    pathname = '/',
    search = '',
    hash = '',
    saved = {},
    languages = [],
    userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36',
    reducedMotion = false,
    storageBlocked = false,
    html,
  } = {}) {
    const classes = [];
    const properties = {};
    const dataset = {};
    let redirectedTo = null;
    const document = {
      documentElement: {
        classList: { add: (name) => classes.push(name) },
        dataset,
        style: { setProperty: (name, value) => (properties[name] = value) },
      },
    };
    const localStorage = {
      getItem: (key) => {
        if (storageBlocked) throw new Error('localStorage is blocked');
        return saved[key] ?? null;
      },
    };
    const location = {
      pathname,
      search,
      hash,
      replace: (address) => {
        redirectedTo = address;
      },
    };
    const matchMedia = (query) => ({ matches: reducedMotion && query.includes('reduce') });
    const navigator = { languages, language: languages[0] ?? '', userAgent };
    new Function(
      'document',
      'localStorage',
      'location',
      'matchMedia',
      'navigator',
      HeadScript.source(html),
    )(document, localStorage, location, matchMedia, navigator);
    return { redirectedTo, dataset, classes, properties };
  }
}
