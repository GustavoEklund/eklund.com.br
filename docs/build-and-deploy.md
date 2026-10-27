# Build and deploy

`source/` runs as it is (native ES modules, one request per file), which is how it is developed and tested. What goes to Hostinger is the production build:

```sh
pnpm run build              # source/ -> dist/, and the copy of the version -> dist/1.1.0/ (vite.build.config.js, tools/site-build.mjs)
pnpm run preview            # builds, then serves dist/ at http://127.0.0.1:8737 with the headers production sends
pnpm run measure:build      # source against dist: requests, bytes and load times (needs openssl and a fresh build)
pnpm run test:build         # 48 tests on what the build produced
pnpm run test:e2e:dist      # the whole Playwright suite against dist/ instead of source/
pnpm run screenshots        # redraws the pictures of the README into docs/images (needs a fresh build)
```

What the build does:

- One JavaScript bundle (Rolldown and the Oxc minifier, for Chrome 123, Edge 123, Firefox 129 and Safari 17.5) with the load test worker next to it, and one stylesheet (Lightning CSS), both named by content hash under `assets/`.
- Fonts, images and the icon sprite are hashed too and never inlined, because the CSP only allows `data:` for images.
- The markup, the JSON-LD and the web manifest are minified. The inline script in the head stays byte for byte, since the CSP allows it by its hash; the manifest icons point at the built addresses.
- The hand-written `modulepreload` list is dropped, one bundle needs none.
- `.htaccess` (root and `/en/`), `robots.txt`, `sitemap.xml`, `favicon.ico`, `security.txt` and `assets/brand/` are copied as they are.
- The same site is built a second time for the folder named after the version in `package.json`, into `dist/1.1.0/`, which a release leaves online at `eklund.com.br/1.1.0/`. Every address in that copy starts with `/1.1.0/`: its files, the links between its two pages and the addresses of its web manifest, so it loads nothing from the live site and keeps working after the next release. Its canonical, alternate and social addresses still name the pages at the root, and the head script sends no reader of English anywhere from a folder.

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

Every release goes online by itself. Once the [`Release`](../.github/workflows/release.yml) workflow publishes a release, it calls [`Deploy`](../.github/workflows/deploy.yml), which:

1. downloads the zip of the release, and checks it against its checksum and against the provenance attestation that `Release` signed for it from the tag;
2. sends it over FTP with TLS ([`tools/deploy.mjs`](../tools/deploy.mjs)) to `public_html/gustavo/`, the folder of `gustavo.eklund.com.br`, which mirrors the site, and then to `public_html`;
3. compares every page online with the page of the release, byte for byte, and checks its Content-Security-Policy, which allows its script.

The zip carries the copy of the version for its own folder. So each release stays online at `eklund.com.br/1.1.0/` and `gustavo.eklund.com.br/1.1.0/` after the next ones. A pre-release (`v1.2.0-rc.1`) goes only to its own folder, never to the root. The plan of the hosting has FTP and no SSH: [ADR 0008](decisions/0008-deploy-each-release-over-ftps.md) says why the deploy works this way.

In each folder, the deploy:

- **Skips what is already there.** A hashed file the server already has, with the same size, is not sent again, since the hash in its name says it is the same file. Every other file is sent each time, because FTP has no checksum to compare.
- **Never shows a file half written.** Every file goes up under a temporary name, `.deploy-<token>-<name>`, and is renamed once all are up. The renames go in order: the hashed files first, then the other files, then the `.htaccess` files and the pages, with the page at the root last. So a visitor never gets a page that names a file the server does not have yet.
- **Deletes what the release no longer has, with one exception.** The files of the release that was online before stay until the next deploy. Its pages can still be open in a browser, or come back from the browser cache for a day (`stale-while-revalidate`), and they name its files.
- **Leaves alone the copies of the other versions and the mirror folder.**
- **Stops at a folder that is not this site.** If a folder holds files but not the `.htaccess` of this site, the deploy leaves it as it is and stops. So a wrong FTP folder, such as the home folder above `public_html`, is never emptied.

### Set it up once

1. In hPanel, go to Files and then FTP Accounts, and create an FTP account whose folder is `/public_html`. The deploy uses this account and nothing else does, so its password can change without touching the main account.
2. Create the `production` environment with the address, the user and the password of that account ([`repository-settings.md`](repository-settings.md#deploy)).
3. Run a dry run with the tag of the newest release, as described below, and read what the first deploy would delete. Anything that has to stay in `public_html` and is not a version folder or `gustavo/` has to go into the release, or be kept somewhere else.

### Run it by hand

Go to Actions, Deploy, Run workflow, or use the command line:

```sh
gh workflow run deploy.yml -f tag=v1.1.0                  # a dry run: it connects, compares and says what it would send and delete
gh workflow run deploy.yml -f tag=v1.1.0 -f dry-run=false # puts v1.1.0 online, also to put an older release back
```

A run by hand is a dry run unless `dry-run` is `false`. A run that stops halfway leaves the pages it had not renamed as they were. Running it again finishes the deploy, and deletes the temporary files the first run left.

### Without the workflow

Each release publishes the zip that the workflow deploys. Download `eklund.com.br-vX.Y.Z.zip` from the [releases page](https://github.com/GustavoEklund/eklund.com.br/releases) and check it:

```sh
sha256sum --check eklund.com.br-vX.Y.Z.zip.sha256
gh attestation verify eklund.com.br-vX.Y.Z.zip --repo GustavoEklund/eklund.com.br
```

The second command proves that the zip was built by this repository's release workflow from the tagged commit. Then, in hPanel's File Manager, upload its contents to `public_html` and to `public_html/gustavo/`, hidden files included (`.htaccess`, `en/.htaccess`, `.well-known/`). The `assets/` folders go first and the pages last. The File Manager can extract a zip. The CI job `build` also keeps `dist/` of every run as the artifact `site`.

Caching is set by `.htaccess`: hashed files for a year with `immutable`, HTML for ten minutes, and `robots.txt`, `sitemap.xml`, `favicon.ico` and `security.txt` for one day. Check compression with `curl -sI -H 'Accept-Encoding: br' https://eklund.com.br/ | grep -i content-encoding`.

## Lighthouse

CI runs Lighthouse on the production build (mobile profile, three runs per page) and fails when accessibility or SEO drops from 100, best practices under 90, layout shift above 0.02, the page weighs more than 360 kB or the console shows an error. Performance only warns below 75. The limits are in [`lighthouserc.json`](../lighthouserc.json). Measured on 2026-10-18: accessibility 100, SEO 100, best practices 96, performance 84, layout shift 0. The 4 points of best practices are the audit "legible font sizes" (about half of the text is under 12 px, which is a design choice), and the missing performance points are the blocking time described above.
