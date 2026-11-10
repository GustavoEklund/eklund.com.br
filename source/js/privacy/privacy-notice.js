/**
 * The first layer of the privacy notice (0010): a card fixed at the bottom of the screen with the text, a link to the privacy
 * policy and three buttons of the same size and style, "Accept all", "Refuse all" and "Choose". It has no close button: it
 * goes away once a choice is saved, wherever that happens.
 *
 * The inline script in the head shows it before the first paint, by setting data-privacy="ask" on the root element, so it
 * never moves the layout. While it shows, its height is the --privacy-notice-height of the root, which the stylesheet turns
 * into room at the bottom of the scroll area and of the footer, so the focused control is never hidden under it (WCAG 2.4.11).
 */
export class PrivacyNotice {
  #root;
  #choice;
  #onChoose;
  #focusAfter;
  #resizeObserver = null;

  /**
   * @param {object} options
   * @param {HTMLElement} options.root the card
   * @param {import('./privacy-choice.js').PrivacyChoice} options.choice
   * @param {() => void} options.onChoose opens the preferences
   * @param {HTMLElement} options.focusAfter takes the focus when the card closes while holding it
   */
  constructor({ root, choice, onChoose, focusAfter }) {
    this.#root = root;
    this.#choice = choice;
    this.#onChoose = onChoose;
    this.#focusAfter = focusAfter;
  }

  install() {
    if (this.#choice.decided) {
      this.#close();
      return this;
    }
    this.#documentElement.dataset.privacy = 'ask';
    this.#root.addEventListener('click', (event) => this.#act(event));
    const stop = this.#choice.onChange(() => {
      stop();
      this.#close();
    });
    if (typeof ResizeObserver === 'function') {
      this.#resizeObserver = new ResizeObserver(() => this.#reserveRoom());
      this.#resizeObserver.observe(this.#root);
    }
    this.#reserveRoom();
    return this;
  }

  get open() {
    return this.#documentElement.dataset.privacy === 'ask';
  }

  get #documentElement() {
    return this.#root.ownerDocument.documentElement;
  }

  #act(event) {
    const action = event.target.closest('[data-privacy-action]')?.dataset.privacyAction;
    if (action === 'accept') this.#choice.acceptAll();
    else if (action === 'refuse') this.#choice.refuseAll();
    else if (action === 'choose') this.#onChoose();
  }

  /** The distance from the top of the card to the bottom of the window: the card and the gap under it. */
  #reserveRoom() {
    const viewport = this.#documentElement.clientHeight;
    const top = this.#root.getBoundingClientRect().top;
    this.#documentElement.style.setProperty(
      '--privacy-notice-height',
      `${Math.max(0, Math.ceil(viewport - top))}px`,
    );
  }

  /** Hides the card and gives back its room; when it held the focus, hands it on without scrolling the page. */
  #close() {
    const focused = this.#root.contains(this.#root.ownerDocument.activeElement);
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    delete this.#documentElement.dataset.privacy;
    this.#documentElement.style.removeProperty('--privacy-notice-height');
    if (focused) this.#focusAfter.focus({ preventScroll: true });
  }
}
