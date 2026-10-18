/**
 * Header control with one link per language, each to the page in that language. A click switches in place, without a
 * reload (and the address follows); the browser still follows the link when the click has a modifier key or the scripts
 * did not run. The current language carries aria-current.
 */
export class LocaleSwitcher {
  #root;
  #translator;
  #onSelect;

  constructor({ root, translator, onSelect }) {
    this.#root = root;
    this.#translator = translator;
    this.#onSelect = onSelect;
  }

  install() {
    this.#root.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-locale]');
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      this.#onSelect(link.dataset.locale);
    });
    this.#translator.onChange(() => this.render());
    this.render();
    return this;
  }

  render() {
    for (const link of this.#root.querySelectorAll('a[data-locale]')) {
      if (link.dataset.locale === this.#translator.locale)
        link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  }
}
