import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SOURCE = join(import.meta.dirname, '..', '..', 'source');

/** Reads the shipped site from disk: the HTML, the file tree and the static import graph of the modules. */
export class SiteSource {
  static get root() {
    return SOURCE;
  }

  static read(path) {
    return readFileSync(join(SOURCE, path), 'utf8');
  }

  static bytes(path) {
    return readFileSync(join(SOURCE, path));
  }

  static exists(path) {
    return existsSync(join(SOURCE, path));
  }

  /** The page as a document. Stylesheet links are renamed to rel="stylesheet-not-loaded" so the parser does not try to fetch them. */
  static html() {
    return new DOMParser().parseFromString(
      SiteSource.read('index.html').replaceAll('rel="stylesheet"', 'rel="stylesheet-not-loaded"'),
      'text/html',
    );
  }

  /** Every file under a folder, as paths relative to source/, sorted. */
  static files(folder) {
    const found = [];
    const walk = (directory) => {
      for (const name of readdirSync(join(SOURCE, directory)).sort()) {
        const path = join(directory, name);
        if (statSync(join(SOURCE, path)).isDirectory()) walk(path);
        else found.push(path);
      }
    };
    walk(folder);
    return found;
  }

  /** The modules reachable from an entry through static `import ... from './x.js'`, entry first, then sorted. */
  static reachableFrom(entry) {
    const seen = new Set();
    const visit = (file) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const [, specifier] of SiteSource.read(file).matchAll(
        /^import\s[^;]*?from\s+'(\.[^']+)'/gm,
      ))
        visit(join(dirname(file), specifier));
    };
    visit(entry);
    return [entry, ...[...seen].filter((file) => file !== entry).sort()];
  }

  /** Relative imports a module makes, as written. */
  static importsOf(file) {
    return [...SiteSource.read(file).matchAll(/^import\s[^;]*?from\s+'(\.[^']+)'/gm)].map(
      ([, specifier]) => specifier,
    );
  }
}

/** Dictionary leaves as [path, value] pairs, in definition order; arrays are leaves. */
export class DictionaryLeaves {
  static of(dictionary, prefix = '') {
    return Object.entries(dictionary).flatMap(([key, value]) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? DictionaryLeaves.of(value, `${prefix}${key}.`)
        : [[`${prefix}${key}`, value]],
    );
  }

  static placeholders(text) {
    return [...text.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();
  }
}
