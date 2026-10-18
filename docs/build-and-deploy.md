# Build and deploy

`source/` runs as it is (native ES modules, one request per file), which is how it is developed and tested. What goes to Hostinger is the production build:

```sh
pnpm run build              # source/ -> dist/ (vite.build.config.js, tools/site-build.mjs)
pnpm run preview            # builds, then serves dist/ at http://127.0.0.1:8737 with the headers production sends
pnpm run measure:build      # source against dist: requests, bytes and load times (needs openssl and a fresh build)
pnpm run test:build         # 37 tests on what the build produced
pnpm run test:e2e:dist      # the whole Playwright suite against dist/ instead of source/
pnpm run screenshots        # redraws the pictures of the README into docs/images (needs a fresh build)
```

What the build does:

- One JavaScript bundle (Rolldown and the Oxc minifier, for Chrome 123, Edge 123, Firefox 129 and Safari 17.5) with the load test worker next to it, and one stylesheet (Lightning CSS), both named by content hash under `assets/`.
- Fonts, images and the icon sprite are hashed too and never inlined, because the CSP only allows `data:` for images.
- The markup, the JSON-LD and the web manifest are minified. The inline script in the head stays byte for byte, since the CSP allows it by its hash; the manifest icons point at the built addresses.
- The hand-written `modulepreload` list is dropped, one bundle needs none.
- `.htaccess` (root and `/en/`), `robots.txt`, `sitemap.xml`, `favicon.ico`, `security.txt` and `assets/brand/` are copied as they are.

If the inline script in the head of `source/index.html` changes, the hash in `source/.htaccess` changes with it; `pnpm run test:contract` prints the new value. `tests/build/` fails when the built pages and the headers disagree.

What it saves, measured with `pnpm run measure:build` (cold cache, HTTP/2 and brotli, median of 7 loads, Chromium on software GL, so read the times as a comparison and not as absolute values):

| Cold load of the home page  | source                     | dist                    | change      |
| --------------------------- | -------------------------- | ----------------------- | ----------- |
| Requests                    | 90                         | 7                       | -92%        |
| Bytes on the wire (brotli)  | 344.1 kB                   | 282.3 kB                | -18%        |
| Bytes after decoding        | 716.6 kB                   | 527.8 kB                | -26%        |
| JavaScript (wire / decoded) | 64 files, 104.6 / 323.7 kB | 1 file, 57.6 / 180.7 kB | -45% / -44% |
| CSS (wire / decoded)        | 21 files, 29.3 / 119.8 kB  | 1 file, 15.6 / 81.4 kB  | -47% / -32% |
| HTML (wire / decoded)       | 13.2 / 60.1 kB             | 12.2 / 52.7 kB          | -8% / -12%  |

The fonts (185.1 kB) are the same in both and are now 66% of what goes over the wire.

| Median time               | no throttling | Fast 4G (9 Mbit/s, 60 ms) | phone, Slow 4G, CPU 4x slower |
| ------------------------- | ------------- | ------------------------- | ----------------------------- |
| First contentful paint    | 80 → 188 ms   | 560 → 548 ms              | 1460 → 1012 ms (-31%)         |
| Largest contentful paint  | 216 → 188 ms  | 596 → 548 ms              | 1460 → 1012 ms (-31%)         |
| Scripts run (`app:ready`) | 175 → 145 ms  | 469 → 433 ms              | 1823 → 1625 ms (-11%)         |
| `load` event              | 192 → 160 ms  | 508 → 446 ms              | 2324 → 1719 ms (-26%)         |
| Blocking time             | 50 → 58 ms    | 54 → 59 ms                | 244 → 275 ms                  |

Two results are worse in the build. On a fast connection the first paint now comes after the scripts instead of before them: the bundle arrives with the page and runs in one task of about 110 ms (48 to 162 ms with software GL) before the browser paints, while the unbundled modules arrive later and lose the race to the paint. And blocking time went up by 5 to 31 ms, because that one task is longer in the build (about 110 ms) than the one the unbundled site has (about 97 ms). The change I would try is in `App.start()`, giving the browser a frame before the globe and the observability panels are mounted; it is not a build option, and it is not done.

## Deploy to Hostinger

1. `pnpm run build`.
2. hPanel → File Manager → `public_html`. Upload the contents of `dist/`, hidden files included (`.htaccess`, `en/.htaccess`, `.well-known/`). The `assets/` folder goes first and the HTML last, so a visitor never gets a page that points at files that are not there yet.
3. The first time, delete the old `css/`, `js/` and `fonts/` folders, `icon.svg`, `apple-touch-icon.png` and `site.webmanifest` from `public_html` (the build keeps them under `assets/`, with a hash in the name). Later deploys leave older hashed files in `assets/`, which is harmless, and they can be deleted a few days later.
4. Caching is set by `.htaccess`: hashed files for a year with `immutable`, HTML for ten minutes, `robots.txt`, `sitemap.xml`, `favicon.ico` and `security.txt` for one day. Check compression with `curl -sI -H 'Accept-Encoding: br' https://eklund.com.br/ | grep -i content-encoding`.

Each release also publishes the same files as a zip. Download `eklund.com.br-vX.Y.Z.zip` from the [releases page](https://github.com/GustavoEklund/eklund.com.br/releases), check it, and upload it to `public_html` with the same order and the same clean-up (hPanel's File Manager can extract a zip):

```sh
sha256sum --check eklund.com.br-vX.Y.Z.zip.sha256
gh attestation verify eklund.com.br-vX.Y.Z.zip --repo GustavoEklund/eklund.com.br
```

The second command proves that the zip was built by this repository's release workflow from the tagged commit. The CI job `build` also keeps `dist/` of every run as the artifact `site`. Automatic deployment is not set up yet.

## Lighthouse

CI runs Lighthouse on the production build (mobile profile, three runs per page) and fails when accessibility or SEO drops from 100, best practices under 90, layout shift above 0.02, the page weighs more than 360 kB or the console shows an error. Performance only warns below 75. The limits are in [`lighthouserc.json`](../lighthouserc.json). Measured on 2026-10-18: accessibility 100, SEO 100, best practices 96, performance 84, layout shift 0. The 4 points of best practices are the audit "legible font sizes" (about half of the text is under 12 px, which is a design choice), and the missing performance points are the blocking time described above.
