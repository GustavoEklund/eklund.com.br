import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const EDGE = join(import.meta.dirname, '..', '..', 'edge');
/**
 * Where edge/ keeps its own code: the collector, the owner's panel, and the scripts the panel sends to the browser. The
 * panel's vendor/ folder holds npm's files as they are, and is not here.
 */
const FOLDERS = ['src', 'panel', 'panel/browser'];

/** Reads the Workers of edge/ from disk: their modules and their imports. */
export class EdgeSource {
  static FOLDERS = FOLDERS;

  static get root() {
    return EDGE;
  }

  static read(path) {
    return readFileSync(join(EDGE, path), 'utf8');
  }

  /** The modules of edge/, as paths relative to edge/, sorted. */
  static modules() {
    return FOLDERS.flatMap((folder) =>
      readdirSync(join(EDGE, folder), { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
        .map((entry) => `${folder}/${entry.name}`),
    ).sort();
  }

  /** Whether a module of edge/ has this file name, in any of its folders. */
  static has(name) {
    return EdgeSource.modules().some((path) => basename(path) === name);
  }

  /** Every import specifier of a module, relative or not, as written. */
  static importsOf(path) {
    return [...EdgeSource.read(path).matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map(
      ([, specifier]) => specifier,
    );
  }
}
