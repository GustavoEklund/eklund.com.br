// The dictionaries as flat key -> text maps, and the text the markup carries by default: every element with a data-i18n,
// data-i18n-html or data-i18n-attr key holds its text in the page's own language, written from the dictionary by
// `node tools/i18n-check.mjs --fix-html` (index.html in pt-BR, en/index.html in en-US).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOURCE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'source');
const ROOT = SOURCE_ROOT;

export class DictionaryLoader {
  /** The dictionaries are plain ES modules without imports; load them through a data: URL so no package.json is needed. */
  static async load(file, exportName) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    const module = await import(
      `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
    );
    return module[exportName];
  }
}

export class KeyFlattener {
  static flatten(node, prefix = '', keys = new Map()) {
    for (const [name, value] of Object.entries(node)) {
      const key = prefix ? `${prefix}.${name}` : name;
      if (value && typeof value === 'object') KeyFlattener.flatten(value, key, keys);
      else keys.set(key, String(value));
    }
    return keys;
  }
}

/** The default copy in a page is generated from the dictionary: this finds and rewrites every place it appears. */
export class HtmlDefaults {
  static #escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  static #escapeAttribute = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

  /** Returns { html, differences }: the html with every default replaced and the keys whose text was different. */
  static sync(html, portuguese) {
    const differences = [];
    const text = (key) => portuguese.get(key) ?? `[missing ${key}]`;
    const note = (key, found, expected) => {
      if (found !== expected) differences.push(key);
    };
    html = html.replace(
      /(<(\w+)\b[^<>]*?\sdata-i18n="([^"]+)"[^<>]*>)([^<]*)(<\/\2>)/g,
      (match, open, tag, key, inner, close) => {
        note(key, inner, HtmlDefaults.#escape(text(key)));
        return `${open}${HtmlDefaults.#escape(text(key))}${close}`;
      },
    );
    html = html.replace(
      /(<(\w+)\b[^<>]*?\sdata-i18n-html="([^"]+)"[^<>]*>)([\s\S]*?)(<\/\2>)/g,
      (match, open, tag, key, inner, close) => {
        note(key, inner, text(key));
        return `${open}${text(key)}${close}`;
      },
    );
    html = html.replace(
      /<(\w+)\b[^<>]*?\sdata-i18n-attr="([^"]+)"[^<>]*>/g,
      (tagText, tag, pairs) => {
        for (const pair of pairs.split(';').filter(Boolean)) {
          const separator = pair.indexOf(':');
          const attribute = pair.slice(0, separator).trim(),
            key = pair.slice(separator + 1).trim();
          const pattern = new RegExp(`(\\s${attribute}=")([^"]*)(")`);
          if (!pattern.test(tagText)) {
            differences.push(`${key} (attribute ${attribute} missing in markup)`);
            continue;
          }
          tagText = tagText.replace(pattern, (m, before, value, after) => {
            note(key, value, HtmlDefaults.#escapeAttribute(text(key)));
            return `${before}${HtmlDefaults.#escapeAttribute(text(key))}${after}`;
          });
        }
        return tagText;
      },
    );
    const head = [
      [/(<title>)([^<]*)(<\/title>)/, 'meta.title', HtmlDefaults.#escape],
      [
        /(<meta name="description" content=")([^"]*)(")/,
        'meta.description',
        HtmlDefaults.#escapeAttribute,
      ],
      [
        /(<meta property="og:title" content=")([^"]*)(")/,
        'meta.title',
        HtmlDefaults.#escapeAttribute,
      ],
      [
        /(<meta property="og:description" content=")([^"]*)(")/,
        'meta.description',
        HtmlDefaults.#escapeAttribute,
      ],
    ];
    for (const [pattern, key, escape] of head) {
      html = html.replace(pattern, (match, before, value, after) => {
        note(key, value, escape(text(key)));
        return `${before}${escape(text(key))}${after}`;
      });
    }
    return { html, differences: [...new Set(differences)] };
  }
}
