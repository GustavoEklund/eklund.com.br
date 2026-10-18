import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = fileURLToPath(new URL('../../../source/', import.meta.url));
// main.js is the entry script and the engine files are loaded by the Web Worker, so none of them is preloaded.
const NOT_PRELOADED = [
  'js/main.js',
  'js/load-test/pix-engine.worker.js',
  'js/load-test/pix-engine.js',
];

/** What the source folder holds, so the page can be checked against the files that exist. */
export class SourceTree {
  static preloadedModules() {
    return SourceTree.#files(join(SOURCE, 'js'))
      .filter((path) => !NOT_PRELOADED.includes(path))
      .sort();
  }

  static #files(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? SourceTree.#files(path) : [relative(SOURCE, path)];
    });
  }
}
