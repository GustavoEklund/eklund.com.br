import { Locale } from './locale.js';

const CRAWLER = /bot|crawl|spider|slurp|facebookexternalhit|preview/i;

/**
 * A quiet note under the header of the Portuguese page that offers the English one, to a browser that prefers English and
 * a visitor who never chose a language. The site no longer sends such a visitor to /en/ by itself (0012), so this is how
 * they learn the page exists. Taking the offer switches the page as the header link does; declining it saves Portuguese
 * as the visitor's choice, so the note does not come back.
 */
export class LanguageOffer {
  #root;
  #translator;
  #visitor;
  #onAccept;
  #onDecline;
  #focusAfter;

  /**
   * @param {object} options
   * @param {HTMLElement} options.root the note, hidden in the markup
   * @param {{ locale: string, onChange: Function }} options.translator
   * @param {{ page: string, chosen: string | null, languages: string[], userAgent: string }} options.visitor
   * @param {(locale: string) => void} options.onAccept switches to that language
   * @param {(locale: string) => void} options.onDecline saves that language as the visitor's choice
   * @param {HTMLElement} options.focusAfter takes the focus when the note closes while holding it
   */
  constructor({ root, translator, visitor, onAccept, onDecline, focusAfter }) {
    this.#root = root;
    this.#translator = translator;
    this.#visitor = visitor;
    this.#onAccept = onAccept;
    this.#onDecline = onDecline;
    this.#focusAfter = focusAfter;
  }

  /**
   * Whether a visitor sees the note: on the page in the default language, with no choice made, a browser whose first
   * translated language is another one (English), and a person.
   */
  static wanted({ page, chosen, languages, userAgent }) {
    const preferred = Locale.preferred(languages);
    return (
      page === Locale.DEFAULT &&
      chosen === null &&
      !CRAWLER.test(userAgent) &&
      preferred !== null &&
      preferred !== Locale.DEFAULT
    );
  }

  install() {
    if (!LanguageOffer.wanted(this.#visitor)) return this;
    this.#root.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-locale]');
      if (link && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
        event.preventDefault();
        this.#onAccept(link.dataset.locale);
      } else if (event.target.closest('button')) {
        this.#onDecline(Locale.DEFAULT);
        this.#close();
      }
    });
    this.#translator.onChange((locale) => {
      if (locale !== Locale.DEFAULT) this.#close();
    });
    this.#root.hidden = false;
    return this;
  }

  get open() {
    return !this.#root.hidden;
  }

  /** Hides the note and, when it held the focus, hands it on, so the keyboard is not left on nothing. */
  #close() {
    const focused = this.#root.contains(this.#root.ownerDocument.activeElement);
    this.#root.hidden = true;
    if (focused) this.#focusAfter.focus();
  }
}
