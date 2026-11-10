const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Markup that is already safe: what PanelHtml.html builds, and nothing a reading returned. */
class SafeHtml {
  constructor(text) {
    this.text = text;
  }

  toString() {
    return this.text;
  }
}

/**
 * The markup of the panel's pages. Every value put into `PanelHtml.html` is escaped unless it is markup that `html` built,
 * and a list is joined, so text that came from a visitor (an attribution target, an error message, a referrer) is only
 * ever text.
 */
export class PanelHtml {
  /** A tagged template: `PanelHtml.html\`<p>${text}</p>\``. Null, undefined and false write nothing. */
  static html(strings, ...values) {
    return new SafeHtml(
      strings.reduce((out, part, index) => out + PanelHtml.#value(values[index - 1]) + part),
    );
  }

  /** Markup written by the panel itself, such as a vendored stylesheet's link, taken as it is. */
  static raw(text) {
    return new SafeHtml(String(text));
  }

  static escape(text) {
    return String(text).replace(/[&<>"']/g, (character) => ESCAPES[character]);
  }

  static #value(value) {
    if (value === null || value === undefined || value === false) return '';
    if (value instanceof SafeHtml) return value.text;
    if (Array.isArray(value)) return value.map((item) => PanelHtml.#value(item)).join('');
    return PanelHtml.escape(value);
  }
}
