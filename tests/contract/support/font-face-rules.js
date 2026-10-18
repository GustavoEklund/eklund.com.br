/** The @font-face rules of a stylesheet, as plain objects: each descriptor under its name, `src` as a list of sources. */
export class FontFaceRules {
  static parse(css) {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    return [...withoutComments.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) =>
      FontFaceRules.#descriptors(body),
    );
  }

  static #descriptors(body) {
    const rule = {};
    for (const declaration of body
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)) {
      const separator = declaration.indexOf(':');
      const name = declaration.slice(0, separator).trim();
      const value = declaration
        .slice(separator + 1)
        .replace(/\s+/g, ' ')
        .trim();
      rule[name] =
        name === 'src' ? FontFaceRules.#sources(value) : value.replace(/^(["'])(.*)\1$/, '$2');
    }
    return rule;
  }

  /** `url("a.woff2") format("woff2"), local("Arial")` (single quotes work too) becomes [{ url: 'a.woff2', format: 'woff2' }, { local: 'Arial' }]. */
  static #sources(value) {
    return value
      .split(/,(?![^(]*\))/)
      .map((part) => part.trim())
      .map((part) => {
        const url = part.match(/^url\(["']?([^"')]+)["']?\)(?:\s+format\(["']?([^"')]+)["']?\))?$/);
        if (url) return url[2] ? { url: url[1], format: url[2] } : { url: url[1] };
        const local = part.match(/^local\(["']?([^"')]+)["']?\)$/);
        if (local) return { local: local[1] };
        throw new Error(`Unrecognized font source: ${part}`);
      });
  }
}
