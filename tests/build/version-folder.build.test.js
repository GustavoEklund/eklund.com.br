// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BuiltSite } from '../support/built-site.js';
import { RepositoryFiles } from '../support/repository-files.js';

const { version } = JSON.parse(RepositoryFiles.read('package.json'));
const FOLDER = `/${version}/`;
const PAGES = ['index.html', 'en/index.html'];

const parse = (html) =>
  new DOMParser().parseFromString(
    html.replaceAll('rel="stylesheet"', 'rel="stylesheet-not-loaded"'),
    'text/html',
  );
/** A file name with its hash taken out: main-AbCdEfGh.js and main-12345678.js are the same file built twice. */
const unhashed = (path) => path.replace(/-[\w-]{8}(\.[a-z0-9]+)$/, '$1');
/** Every address of a page that starts at the root of the host (/…, never //host/…), as it is written. */
const rootAddresses = (html) =>
  [...parse(html).querySelectorAll('[href], [src]')]
    .map((element) => element.getAttribute('href') ?? element.getAttribute('src'))
    .filter((address) => address.startsWith('/') && !address.startsWith('//'));
/** A text that names a file of assets/ from the root of the host, which a copy in a folder would load from the live site. */
const rootAssets = (text) => [...text.matchAll(/(?<=[\s"'`(=,])\/assets\/[^\s"'`)]*/g)].map(String);
const inlineScript = (html) =>
  [...html.matchAll(/<script(?![^>]*\s(?:src|type)=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    ([, code]) => code,
  );
const metadata = (html) =>
  [...parse(html).head.querySelectorAll('meta, link[rel=canonical], link[rel=alternate]')].map(
    (element) => element.outerHTML,
  );

describe('the copy of the version for its own folder, which pnpm run build writes to dist/<version>/', () => {
  let root, copy, asset;
  beforeAll(() => {
    root = BuiltSite.build();
    copy = BuiltSite.build({ mode: 'version' });
    asset = (pattern) => `assets/${copy.hashedAssets().find((name) => pattern.test(name))}`;
  }, 240_000);
  afterAll(() => {
    root?.remove();
    copy?.remove();
  });

  it('is made of the same files as the build for the root of the site', () => {
    expect(copy.files().map(unhashed)).toStrictEqual(root.files().map(unhashed));
  });

  it.each(PAGES)(
    'names every file and page of %s from inside the folder, and each one exists in the copy',
    (path) => {
      const addresses = rootAddresses(copy.read(path)).map((address) => address.split(/[?#]/)[0]);
      expect({
        outside: addresses.filter((address) => !address.startsWith(FOLDER)),
        missing: addresses
          .map((address) => address.slice(FOLDER.length))
          .map((file) => (file === '' || file.endsWith('/') ? `${file}index.html` : file))
          .filter((file) => !copy.exists(file)),
      }).toStrictEqual({ outside: [], missing: [] });
    },
  );

  it.each(PAGES)('links %s to the page of each language in the folder', (path) => {
    const links = [...parse(copy.read(path)).querySelectorAll('.locale-switcher a')].map((link) =>
      link.getAttribute('href'),
    );
    expect(links).toStrictEqual([FOLDER, `${FOLDER}en/`]);
  });

  it('names the fonts in the stylesheet and the load test worker in the script from inside the folder', () => {
    const css = copy.read(asset(/^main-.*\.css$/));
    const js = copy.read(asset(/^main-.*\.js$/));
    const worker = [...js.matchAll(/new Worker\(new URL\(`?"?([^`"',]+)/g)].map(
      ([, address]) => address,
    );
    expect({
      fromRoot: [...rootAssets(css), ...rootAssets(js)],
      fonts: [...css.matchAll(/url\(([^)]+\.woff2)\)/g)].every(([, address]) =>
        address.replace(/["']/g, '').startsWith(`${FOLDER}assets/`),
      ),
      worker: worker.map((address) => [
        unhashed(address),
        copy.exists(address.slice(FOLDER.length)),
      ]),
    }).toStrictEqual({
      fromRoot: [],
      fonts: true,
      worker: [[`${FOLDER}assets/pix-engine.worker.js`, true]],
    });
  });

  it('gives the web manifest the folder as its own address, and names its icons inside it', () => {
    const manifest = JSON.parse(copy.read(asset(/^site-.*\.webmanifest$/)));
    expect({
      id: manifest.id,
      start: manifest.start_url,
      scope: manifest.scope,
      icons: manifest.icons.map((icon) => [
        icon.src.startsWith(FOLDER),
        copy.exists(icon.src.slice(FOLDER.length)),
      ]),
    }).toStrictEqual({
      id: FOLDER,
      start: FOLDER,
      scope: FOLDER,
      icons: manifest.icons.map(() => [true, true]),
    });
  });

  it.each(PAGES)(
    'keeps the text, the inline script and the addresses of eklund.com.br in the head of %s as the build for the root has them',
    (path) => {
      const read = (site) => {
        const html = site.read(path);
        return [
          parse(html).body.textContent.replace(/\s+/g, ' ').trim(),
          inlineScript(html),
          metadata(html),
        ];
      };
      expect(read(copy)).toStrictEqual(read(root));
    },
  );

  it('carries the same .htaccess files, so the Content-Security-Policy of the copy allows its inline script', () => {
    expect(
      ['.htaccess', 'en/.htaccess', 'assets/brand/.htaccess'].filter(
        (path) => !copy.bytes(path).equals(root.bytes(path)),
      ),
    ).toStrictEqual([]);
  });
});
