import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const EDGE = join(import.meta.dirname, '..', '..', 'edge');

/** Reads the collector of edge/ from disk: its modules and their imports. */
export class EdgeSource {
  static get root() {
    return EDGE;
  }

  static read(path) {
    return readFileSync(join(EDGE, path), 'utf8');
  }

  /** The modules of edge/src, as paths relative to edge/, sorted. */
  static modules() {
    return readdirSync(join(EDGE, 'src'))
      .sort()
      .map((name) => `src/${name}`);
  }

  /** Every import specifier of a module, relative or not, as written. */
  static importsOf(path) {
    return [...EdgeSource.read(path).matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map(
      ([, specifier]) => specifier,
    );
  }
}
