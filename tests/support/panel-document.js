import { Window } from 'happy-dom';

/** The markup of a page of the panel, read as a browser reads it, for tests that look at its text and its tables. */
export class PanelDocument {
  /** A document whose body holds `markup`, or the whole page when it starts with a doctype. */
  static parse(markup) {
    const window = new Window({ settings: { disableJavaScriptEvaluation: true } });
    const text = String(markup);
    if (text.startsWith('<!doctype')) window.document.write(text);
    else window.document.body.innerHTML = text;
    return window.document;
  }

  /** The text of each element `selector` finds, with its white space collapsed. */
  static texts(root, selector) {
    return [...root.querySelectorAll(selector)].map((element) => PanelDocument.text(element));
  }

  /** The cells of each row of each table under `root`, header rows included. */
  static tables(root) {
    return [...root.querySelectorAll('table')].map((table) =>
      [...table.querySelectorAll('tr')].map((row) => PanelDocument.texts(row, 'th, td')),
    );
  }

  static text(element) {
    return element.textContent.replace(/\s+/g, ' ').trim();
  }
}
