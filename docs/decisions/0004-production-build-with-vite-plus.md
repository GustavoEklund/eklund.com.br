# 0004. The site runs from source in development and ships as a Vite+ build

Status: accepted, 2026-10-18.

## Context

The site started as native ES modules with a hand-written `<link rel="modulepreload">` for every module, which needs no build step to develop. A cold load asked for 90 files: 64 scripts, 21 stylesheets and the rest. The project already uses Vite+ for tests, lint and formatting.

## Decision

- Development and the tests run against `source/` as it is.
- What is deployed is `dist/`, made by `pnpm run build` with Vite+ (Rolldown, the Oxc minifier and Lightning CSS): one hashed script (with the load test worker next to it), one hashed stylesheet, hashed fonts, images and manifest, and minified markup, structured data and manifest.
- What Vite+ does not do is in `tools/site-build.mjs`: drop the preload list, copy the files nothing links to, rewrite the manifest icons.
- The whole end-to-end suite also runs against `dist/` (`SITE_ROOT=dist`), and `tests/build/` checks the output.

## Consequences

- Measured with `pnpm run measure:build`: requests 90 to 7, bytes on the wire 344 kB to 282 kB, and on a phone profile the first paint 31% sooner. See [`build-and-deploy.md`](../build-and-deploy.md).
- A cost was measured too: on a fast connection the first paint comes after the scripts (80 ms to 188 ms) because the bundle arrives with the page and runs in one task of about 110 ms. It is a startup question for `App.start()` and not a build option, and it is open.
- The footer no longer says "just open the source with Ctrl U", since that shows a minified bundle. The source link points to the repository instead.
- A hashed file name can be cached for a year. The pages are cached for ten minutes because they are what names the files.
