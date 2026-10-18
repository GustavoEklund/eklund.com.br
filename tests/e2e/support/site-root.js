import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Which folder the E2E run serves: source/ (the site as it is written, native ES modules) or dist/ (the production build),
 * chosen with the SITE_ROOT environment variable. A few facts differ between the two, and this class says which.
 */
export class SiteRoot {
  static get name() {
    return process.env.SITE_ROOT ?? 'source';
  }

  static get isBuilt() {
    return SiteRoot.name === 'dist';
  }

  static get folder() {
    return fileURLToPath(new URL(`../../../${SiteRoot.name}/`, import.meta.url));
  }

  /** The address of a font file by its name without the extension: /fonts/<name>.woff2 in source/, /assets/<name>-<hash>.woff2 in dist/. */
  static fontPath(name) {
    if (!SiteRoot.isBuilt) return `/fonts/${name}.woff2`;
    const file = readdirSync(`${SiteRoot.folder}assets`).find((entry) =>
      new RegExp(`^${name}-[\\w-]{8}\\.woff2$`).test(entry),
    );
    if (!file) throw new Error(`No ${name} font in dist/assets: build the site first`);
    return `/assets/${file}`;
  }
}
