import { Environment } from '../shared/environment.js';

const TOAST_MS = 1800;

/** Click-to-copy on every [data-copy] link, plus a magnetic pull on the big email link. */
export class EmailActions {
  #emailLink;
  #toast;
  #onCopied;

  constructor({ emailLink, toast, onCopied }) {
    this.#emailLink = emailLink;
    this.#toast = toast;
    this.#onCopied = onCopied;
  }

  install() {
    for (const link of document.querySelectorAll('[data-copy]')) {
      link.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        this.copyEmail();
      });
    }
    if (!Environment.hasFinePointer) return;
    const link = this.#emailLink;
    link.addEventListener('pointermove', (event) => {
      if (Environment.prefersReducedMotion) return; // the button stays put while motion is off, and leans again when it is back on
      const rect = link.getBoundingClientRect();
      link.style.translate = `${(event.clientX - (rect.left + rect.width / 2)) * 0.12}px ${(event.clientY - (rect.top + rect.height / 2)) * 0.25}px`;
    });
    link.addEventListener('pointerleave', () => {
      link.style.translate = '0 0';
    });
  }

  async copyEmail() {
    try {
      await navigator.clipboard.writeText(this.#emailLink.dataset.copy);
      this.#toast.showPopover?.();
      this.#onCopied?.();
      setTimeout(() => this.#toast.hidePopover?.(), TOAST_MS);
    } catch {
      /* clipboard unavailable: the mailto: href still works */
    }
  }
}
