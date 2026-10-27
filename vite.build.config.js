// The production build, with Vite+: `pnpm run build` writes the site to dist/, which is what goes to the hosting.
// It is a separate file from vite.config.js (tests, lint, formatter) because the build has its own root, source/, and the
// development of the site needs none of this: source/ runs as it is, as native ES modules.
// `--mode version` builds the same site a second time, for the folder named after the version in package.json, into
// dist/1.1.0/: every release leaves that copy of itself online at eklund.com.br/1.1.0/ (docs/build-and-deploy.md).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite-plus';
import { SiteBuild } from './tools/site-build.mjs';

const SOURCE = resolve(import.meta.dirname, 'source');
const DIST = resolve(import.meta.dirname, 'dist');
const { version } = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8'));

export default defineConfig(({ mode }) => {
  const folder = mode === 'version' ? `${version}/` : '';
  return {
    root: SOURCE,
    base: `/${folder}`,
    publicDir: false, // what must be copied as it is is listed in SiteBuild, so the dev server and the build agree on what a file is
    plugins: [
      SiteBuild.withoutModulePreloads(),
      SiteBuild.staticFiles(SOURCE),
      SiteBuild.pageLinks(),
      SiteBuild.minifiedHtml(),
      SiteBuild.manifest(),
    ],
    css: { lightningcss: { targets: SiteBuild.CSS_TARGETS } },
    build: {
      outDir: resolve(DIST, folder),
      emptyOutDir: true,
      target: SiteBuild.JS_TARGET,
      cssMinify: 'lightningcss',
      // Nothing is inlined as a data: URL: the Content-Security-Policy allows data: images only, never fonts or scripts.
      assetsInlineLimit: 0,
      sourcemap: false,
      reportCompressedSize: true,
      rolldownOptions: {
        input: {
          index: resolve(SOURCE, 'index.html'),
          en: resolve(SOURCE, 'en/index.html'),
        },
      },
    },
  };
});
