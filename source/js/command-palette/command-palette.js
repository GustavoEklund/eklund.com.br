import { Numbers } from '../shared/math.js';
import { FuzzyMatch } from './fuzzy-match.js';

/**
 * ⌘K palette over a <dialog>. Commands are { title, keywords, tag, run } objects
 * registered from outside; the palette knows nothing about what they do.
 */
export class CommandPalette {
  #dialog;
  #input;
  #list;
  #emptyMessage;
  #openButton;
  #onResults;
  #commands = [];
  #visible = [];
  #selectedIndex = 0;

  constructor({ dialog, input, list, emptyMessage, openButton, onResults }) {
    this.#dialog = dialog;
    this.#input = input;
    this.#list = list;
    this.#emptyMessage = emptyMessage;
    this.#openButton = openButton;
    this.#onResults = onResults;
  }

  /** Swaps the whole command list (titles and keywords change with the language). */
  replace(commands) {
    this.#commands = commands;
    if (this.#dialog.open) this.#render();
  }

  install() {
    this.#openButton.addEventListener('click', () => this.open());
    addEventListener('keydown', (event) => this.#onKeyDown(event));
    this.#input.addEventListener('input', () => {
      this.#selectedIndex = 0;
      this.#render();
      this.#onResults?.(this.#visible.length);
    });
    this.#list.addEventListener('pointermove', (event) => {
      const item = event.target.closest('li[data-index]');
      if (item && +item.dataset.index !== this.#selectedIndex) {
        this.#selectedIndex = +item.dataset.index;
        this.#render();
      }
    });
    this.#list.addEventListener('click', (event) => {
      const item = event.target.closest('li[data-index]');
      if (item) this.#visible[+item.dataset.index].run();
    });
    this.#dialog.addEventListener('click', (event) => {
      if (event.target === this.#dialog) this.close();
    });
  }

  open() {
    if (this.#dialog.open) return;
    this.#selectedIndex = 0;
    this.#input.value = '';
    this.#render();
    this.#dialog.showModal();
    this.#input.focus();
  }

  close() {
    this.#dialog.close();
  }

  #onKeyDown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (this.#dialog.open) this.close();
      else this.open();
    }
    if (!this.#dialog.open) return;
    const count = this.#visible.length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.#selectedIndex = (this.#selectedIndex + 1) % count;
      this.#render();
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.#selectedIndex = (this.#selectedIndex - 1 + count) % count;
      this.#render();
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.#visible[this.#selectedIndex]?.run();
    }
  }

  static #optionId(index) {
    return `command-palette-option-${index}`;
  }

  #render() {
    const queryText = FuzzyMatch.normalize(this.#input.value.trim());
    this.#visible = queryText
      ? this.#commands
          .map((command) => ({
            command,
            score: Math.max(
              FuzzyMatch.score(queryText, FuzzyMatch.normalize(command.title)),
              FuzzyMatch.score(queryText, FuzzyMatch.normalize(command.keywords)) * 0.6,
            ),
          }))
          .filter((entry) => entry.score >= 0)
          .sort((a, b) => b.score - a.score)
          .map((entry) => entry.command)
      : this.#commands;
    this.#selectedIndex = Numbers.clamp(
      this.#selectedIndex,
      0,
      Math.max(0, this.#visible.length - 1),
    );
    this.#list.innerHTML = this.#visible
      .map(
        (command, index) =>
          `<li role="option" id="${CommandPalette.#optionId(index)}" aria-selected="${index === this.#selectedIndex}" data-index="${index}"${command.lang ? ` lang="${command.lang}"` : ''}>${command.title}<span>${command.tag}</span></li>`,
      )
      .join('');
    this.#emptyMessage.hidden = this.#visible.length > 0;
    this.#input.setAttribute('aria-expanded', String(this.#visible.length > 0));
    if (this.#visible.length)
      this.#input.setAttribute(
        'aria-activedescendant',
        CommandPalette.#optionId(this.#selectedIndex),
      );
    else this.#input.removeAttribute('aria-activedescendant');
    this.#list.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
  }
}
