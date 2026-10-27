// The parts of the production build (vite.build.config.js) that Vite+ does not do by itself:
// - the hand-written <link rel="modulepreload"> list of index.html, which keeps the unbundled site from loading its modules one
//   after another, makes way for the one bundle Vite writes (and for the preload links it adds itself);
// - the files that nothing in the HTML or the CSS points at (.htaccess, robots.txt, the sitemap, the manifest icons and the
//   social card, whose address is written inside a JSON file and a meta tag), copied as they are;
// - the markup, the JSON-LD and the web manifest, minified (the CSS and the JavaScript are minified by Vite+);
// - the links between the pages and the addresses in the web manifest, moved into the folder a build is for (vite.build.config.js
//   builds each version a second time for /1.1.0/, the copy of it that stays online), since Vite moves only the files it builds.
// Every piece is a function that returns a Vite plugin: the state they need is the argument they close over.
import { readFile, readdir } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';
import { minify } from 'html-minifier-terser';

export class SiteBuild {
  /** The browsers the site is written for. Its CSS needs light-dark(), which is Chrome 123, Safari 17.5 and Firefox 120. */
  static JS_TARGET = ['chrome123', 'edge123', 'firefox129', 'safari17.5'];

  /** The same browsers as Lightning CSS reads them: major in the high 16 bits, minor in the next 8. */
  static CSS_TARGETS = {
    chrome: 123 << 16,
    edge: 123 << 16,
    firefox: 129 << 16,
    safari: (17 << 16) | (5 << 8),
  };

  /** Files copied as they are, relative to source/. */
  static STATIC_FILES = [
    '.htaccess',
    'en/.htaccess',
    'robots.txt',
    'sitemap.xml',
    'favicon.ico',
    '.well-known/security.txt',
  ];

  /** Folders copied as they are, with everything in them, relative to source/. */
  static STATIC_FOLDERS = ['assets/brand'];

  /**
   * What the markup minifier may do. Whitespace collapses to one space and never disappears (a space between two inline
   * elements is text), the inline script of the head stays byte for byte (the Content-Security-Policy allows it by its hash),
   * quotes stay on attributes, and no attribute is dropped for being empty (alt="" says something).
   */
  static HTML_OPTIONS = {
    collapseWhitespace: true,
    conservativeCollapse: true,
    collapseBooleanAttributes: true,
    removeComments: true,
    useShortDoctype: true,
    keepClosingSlash: true,
    minifyJS: false,
    minifyCSS: false,
    removeAttributeQuotes: false,
    removeEmptyAttributes: false,
    sortAttributes: false,
    sortClassName: false,
  };

  /** Takes the preload list of index.html out before Vite reads the page: every link in it would be built as a module of its own. */
  static withoutModulePreloads() {
    return {
      name: 'site:without-module-preloads',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) => SiteBuild.removeModulePreloads(html),
      },
    };
  }

  static removeModulePreloads(html) {
    return html.replace(/^[ \t]*<link rel="modulepreload"[^>]*>[ \t]*\n/gm, '');
  }

  /** Copies the files and folders nothing links to, hidden ones included, to the same place in the output. */
  static staticFiles(root) {
    return {
      name: 'site:static-files',
      async generateBundle() {
        const paths = [...SiteBuild.STATIC_FILES];
        for (const folder of SiteBuild.STATIC_FOLDERS)
          paths.push(...(await SiteBuild.#filesUnder(root, folder)));
        for (const path of paths)
          this.emitFile({
            type: 'asset',
            fileName: path,
            source: await readFile(join(root, path)),
          });
      },
    };
  }

  /** Every file under a folder, as paths with slashes relative to `root`. */
  static async #filesUnder(root, folder) {
    const found = [];
    for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
      const path = posix.join(folder, entry.name);
      if (entry.isDirectory()) found.push(...(await SiteBuild.#filesUnder(root, path)));
      else found.push(relative(root, join(root, path)).split(sep).join('/'));
    }
    return found.sort();
  }

  /**
   * The links between the pages, which the source writes from the root (the language links of the header, / and /en/), in the
   * folder the build is for: /1.1.0/ and /1.1.0/en/ in the copy of version 1.1.0. Vite already did this for the stylesheet, the
   * scripts, the fonts and the images, but a page is not a file it builds.
   */
  static pageLinks() {
    let base = '/';
    return {
      name: 'site:page-links',
      configResolved(config) {
        base = config.base;
      },
      transformIndexHtml: {
        order: 'post',
        handler: (html) => SiteBuild.linkPagesIn(base, html),
      },
    };
  }

  /** Every link of the page whose address starts at the root, starting at `base` instead (a folder that ends with a slash). */
  static linkPagesIn(base, html) {
    return html.replace(/(<a\b[^>]*?\shref=")\/(?!\/)/g, `$1${base}`);
  }

  /** Minifies the page once Vite has written its links into it. */
  static minifiedHtml() {
    return {
      name: 'site:minified-html',
      transformIndexHtml: {
        order: 'post',
        handler: async (html) => SiteBuild.minifyJsonLd(await minify(html, SiteBuild.HTML_OPTIONS)),
      },
    };
  }

  /** The JSON-LD block as data without its whitespace: the same document, parsed and written back. */
  static minifyJsonLd(html) {
    return html.replace(
      /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g,
      (_block, open, json, close) => `${open}${JSON.stringify(JSON.parse(json))}${close}`,
    );
  }

  /**
   * The web manifest as data without its whitespace, with the icons it names at the addresses they have in the build. The
   * manifest is a hashed file of assets/ like the others, so an icon named relative to it ("icon.svg") would be looked for
   * beside it, and the icon is a hashed file of its own; the icons under assets/brand/ keep their names and are left as they are.
   * Its own addresses (id, start_url, scope) are the folder the build is for, like the icons.
   */
  static manifest() {
    let base = '/';
    return {
      name: 'site:manifest',
      configResolved(config) {
        base = config.base;
      },
      generateBundle(_options, bundle) {
        const assets = Object.values(bundle).filter((file) => file.type === 'asset');
        for (const file of assets) {
          if (!file.fileName.endsWith('.webmanifest')) continue;
          const manifest = JSON.parse(String(file.source));
          for (const member of ['id', 'start_url', 'scope'])
            if (manifest[member]?.startsWith('/'))
              manifest[member] = base + manifest[member].slice(1);
          for (const icon of manifest.icons ?? [])
            icon.src = SiteBuild.builtAddress(icon.src, bundle, assets, base);
          file.source = JSON.stringify(manifest);
        }
      },
    };
  }

  /**
   * Where a file named in the source ends up, as an address from `base` (the folder the build is for): where it was copied to
   * when it is copied as it is, else where the asset built from a file of that name is.
   */
  static builtAddress(address, bundle, assets, base = '/') {
    const copied = address.replace(/^\//, '');
    if (bundle[copied]) return `${base}${copied}`;
    const name = posix.basename(address);
    const built = assets.filter((file) => (file.names ?? []).includes(name));
    return built.length === 1 ? `${base}${built[0].fileName}` : address;
  }
}
