import { fileURLToPath } from 'node:url';

const SOURCE = new URL('../../../source/', import.meta.url);

/** The browser code under test, loaded into Node through its real ES modules. */
export class SiteSource {
  static get projectRoot() {
    return fileURLToPath(new URL('../../../', import.meta.url));
  }

  static load(relativePath) {
    return import(new URL(relativePath, SOURCE).href);
  }
}
