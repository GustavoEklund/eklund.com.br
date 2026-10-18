import { Formatter } from '../shared/format.js';

const MAX_LINES = 60;

/**
 * The k6-like terminal: a title bar with the command, a timestamp gutter, a
 * blinking cursor while the run is active, and the last lines kept on screen.
 * Lines are appended, never re-rendered, so logging stays cheap.
 */
export class TerminalLog {
  #element;
  #output;
  #cursor;

  constructor(element) {
    this.#element = element;
    this.#output = element.querySelector('.terminal-output');
    this.#cursor = element.querySelector('.terminal-cursor');
  }

  clear() {
    this.#output.replaceChildren();
  }

  /** Appends a line; `kind` picks the glyph and color: command, info, running, ok, fail, metric, dim. */
  write(text, kind = 'info') {
    const time = Formatter.clock(new Date());
    this.#append(
      `terminal-line is-${kind}`,
      `<time>${time}</time><i aria-hidden="true"></i><span>${text}</span>`,
    );
  }

  blank() {
    this.#append('terminal-line is-blank', '');
  }

  setPlaceholder(text) {
    this.clear();
    this.write(text, 'dim');
  }

  setBusy(busy) {
    this.#cursor.classList.toggle('is-blinking', busy);
    this.#element.scrollTop = this.#element.scrollHeight;
  }

  #append(className, html) {
    const line = document.createElement('div');
    line.className = className;
    line.innerHTML = html;
    this.#output.append(line);
    while (this.#output.childElementCount > MAX_LINES) this.#output.firstElementChild.remove();
    this.#element.scrollTop = this.#element.scrollHeight;
  }
}
