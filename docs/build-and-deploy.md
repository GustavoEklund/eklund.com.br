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

## The collector

The collector of real visits is a Cloudflare Worker on `workers.dev`, in [`edge/`](../edge/) ([0009](decisions/0009-measurement-on-a-cloudflare-worker.md)). It is not part of the site, and it goes online by itself: the [`Edge`](../.github/workflows/edge.yml) workflow runs when a push to `main` changes `edge/`. It tests the collector, applies the D1 migrations that have not run yet, and deploys the Worker. Every release stays online in its folder, so a change to what a page may send keeps the older forms working.

The collector has two limits, both answered with 429, a `Retry-After` and nothing stored. One client may send 60 reports a minute in each Cloudflare location, through Cloudflare's rate limiting binding (`SEND_LIMIT` in `edge/wrangler.jsonc`); a page sends a few reports per load, so that leaves room for a dozen pages a minute and for several visitors behind one address. And the collector writes at most 40,000 rows a day in D1 (`DailyCeiling`), counted in `daily_writes` in the same batch as each report, so that the uptime monitor, the lab job and the retention always have room under the free plan's 100,000. The binding needs nothing created beforehand: its `namespace_id` is any number unique in the account.

The Worker also watches the site. Every five minutes it checks the home page, the English page, the mirror and the folder of the release the home page names: each must answer 200 with HTML, a Content-Security-Policy and Strict-Transport-Security. Every check is stored for 90 days. When a page fails twice in a row, it opens an issue in the private repository `GustavoEklund/eklund.com.br-operations`, and when the page answers again it says for how long it was down and closes the issue. A Worker cannot see the certificate of a site it fetches, so the lab job checks when the certificate expires.

## The lab job

Every night at 04:23 in Brazil, the [`Lab`](../.github/workflows/lab.yml) workflow runs [`tools/lab-run.mjs`](../tools/lab-run.mjs), which measures the site from outside and sends what it found to the collector:

- PageSpeed Insights, five runs of `/` and of `/en/`, on mobile and on desktop. Every run's score, LCP, FCP, CLS, TBT, Speed Index and server response time go to D1, and the full Lighthouse report of the run in the middle by score goes to R2, at `lab/<day>/<page>-<form factor>.json`.
- CrUX, the 75th percentile and the shares of good, needs-improvement and poor loads of the last 28 days, for the origin and each page, on phones and on desktops. A page with too few visits has no reading, and that is not an error.
- Google Search Console, the clicks, impressions and position of each page, query, country and device on the day three days back, the first one whose numbers have settled.
- Bing Webmaster Tools, the clicks and impressions of each day and of each query.
- The certificate of `eklund.com.br` and of `gustavo.eklund.com.br`, over a connection that validates it as a browser does: when it expires and who issued it, or, when the connection refuses it (expired, not yet valid, for another name, from an unknown authority), the code Node gives the problem, such as `CERT_HAS_EXPIRED`. A refused certificate is a row like any other, so it shows up in the data; a host that does not answer fails the job.

The rows go to `POST /v1/lab` and the reports to `PUT /v1/lab/report/<key>`, both with the token `LAB_TOKEN`. What a batch may hold is [`tests/contract/schemas/lab-batch.schema.json`](../tests/contract/schemas/lab-batch.schema.json), checked by the tool's tests and by the collector. A source whose key is missing is left out with a note in the log, and a source that fails makes the job fail after the others are sent. Running the workflow again on the same day writes the same rows over the old ones.

### Set the lab up once

1. The R2 bucket for the reports, in the EU jurisdiction, before `edge/wrangler.jsonc` with its `REPORTS` binding reaches `main`: the deploy fails on a bucket that does not exist. R2 needs a payment method on the account, even on the free plan.

   ```sh
   pnpm exec wrangler r2 bucket create eklund --jurisdiction eu
   ```

2. The token of the lab routes: a long random value, given to the Worker and to the `lab` environment. Without it in the Worker, the lab routes answer 404.

   ```sh
   openssl rand -hex 32                                                       # the value, copied into both prompts below
   pnpm exec wrangler secret put LAB_TOKEN --config edge/wrangler.jsonc
   ```

3. A Google Cloud project with an API key limited to the PageSpeed Insights API and the Chrome UX Report API, and a service account for Search Console. The organization forbids service account keys, so the workflow signs in as that account through Workload Identity Federation: Google trusts the tokens GitHub gives a job of this repository's `lab` environment, and nothing else. The repository uses GitHub's immutable subjects (`repo:GustavoEklund@49698654/eklund.com.br@1424732018:environment:lab`), so the condition reads the repository's number, which survives a rename, and the environment. With `PROJECT_ID` and `PROJECT_NUMBER` of the project:

   ```sh
   gcloud services enable pagespeedonline.googleapis.com chromeuxreport.googleapis.com searchconsole.googleapis.com \
     iamcredentials.googleapis.com sts.googleapis.com --project PROJECT_ID
   gcloud iam service-accounts create eklund-lab --display-name "eklund.com.br lab" --project PROJECT_ID
   gcloud iam workload-identity-pools create github --location global --display-name GitHub --project PROJECT_ID
   gcloud iam workload-identity-pools providers create-oidc eklund-com-br --location global --workload-identity-pool github \
     --issuer-uri https://token.actions.githubusercontent.com \
     --attribute-mapping google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.environment=assertion.environment \
     --attribute-condition "assertion.repository_id == '1424732018' && assertion.environment == 'lab'" --project PROJECT_ID
   gcloud iam service-accounts add-iam-policy-binding eklund-lab@PROJECT_ID.iam.gserviceaccount.com \
     --role roles/iam.workloadIdentityUser --project PROJECT_ID \
     --member "principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository_id/1424732018"
   ```

   The service account needs no role in the project, and has no key. The provider is `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/eklund-com-br`.

4. The domain property `eklund.com.br` in Search Console, verified with a TXT record in the DNS, with the service account's address (`eklund-lab@PROJECT_ID.iam.gserviceaccount.com`) added as a user with restricted access.
5. The site in Bing Webmaster Tools (it can be imported from Search Console) and its API key, under Settings, API access.
6. The `lab` environment of the repository, with three secrets and the two variables that name the provider and the service account ([`repository-settings.md`](repository-settings.md#the-lab)).

### Run the lab by hand

`gh workflow run lab.yml` runs it on GitHub. On a machine, `pnpm run lab` does the same with the keys in its environment, and `LAB_ENDPOINT=http://127.0.0.1:8787` sends to the collector of `pnpm run edge:dev` instead.

## IndexNow

When a release is online, the last job of the [`Release`](../.github/workflows/release.yml) workflow runs [`tools/index-now.mjs`](../tools/index-now.mjs), which posts `/`, `/en/` and the folder of the release to IndexNow. Bing and the other engines that take IndexNow fetch those pages again without waiting for their next visit. The key is the name and the content of the text file at the root of `source/`, which the build copies as it is: it is public by design, since it only proves that the list came from the site.

### Set the collector up once

1. A Cloudflare account on the free plan, and the `workers.dev` subdomain that the dashboard asks for the first time Workers is opened.
2. An API token made from the template "Edit Cloudflare Workers", with "D1: Edit" added, limited to that account and to no zone.
3. The database, created in the EU jurisdiction, whose id then goes into [`edge/wrangler.jsonc`](../edge/wrangler.jsonc):

   ```sh
   pnpm exec wrangler login
   pnpm exec wrangler d1 create eklund --jurisdiction=eu
   ```

4. The `cloudflare` environment of the repository, with the token and the account id ([`repository-settings.md`](repository-settings.md#the-collector)).
5. For the issues of an outage: the private repository `GustavoEklund/eklund.com.br-operations`, and a fine-grained token that reaches only that repository with "Issues: Read and write", stored in the Worker. Without it the checks are still stored, and no one is told.

   ```sh
   pnpm exec wrangler secret put OPERATIONS_TOKEN --config edge/wrangler.jsonc
   ```

### Run the collector locally

```sh
pnpm exec wrangler d1 migrations apply DB --local --config edge/wrangler.jsonc   # once, for the local D1 in edge/.wrangler/
pnpm run edge:dev        # the Worker at http://127.0.0.1:8787, taking reports from the dev server and the preview
pnpm run test:edge       # its tests, with the Worker in workerd
pnpm exec wrangler dev --config edge/wrangler.jsonc --var LAB_TOKEN:local   # the same, with the lab routes open to the token local
```

## The readings

The Worker serves what it has stored to an AI agent, and to me, at two addresses ([0013](decisions/0013-reading-the-data-without-the-agents-sdk.md)):

- `https://eklund.eklund.workers.dev/mcp`, a read-only MCP server with twelve tools: `overview`, `vitals`, `compare_vitals`, `events`, `errors`, `uptime`, `lab`, `compare_lab`, `lab_change_points`, `crux`, `search` and `certificates`.
- `https://eklund.eklund.workers.dev/api/v1/<tool>?…`, the same readings as JSON, with the tool's inputs as query parameters. `GET /api/v1` lists them.

Both need a token of the OAuth provider in front of the Worker, and it only issues one after a GitHub sign-in by a login of `ALLOWED_GITHUB_LOGINS` in [`edge/wrangler.jsonc`](../edge/wrangler.jsonc). An MCP client registers itself, opens a page that names it and asks for consent, and goes through GitHub. The token lasts an hour, and the client renews it for 30 days. Every input is a closed list, a day or a version, and every answer says how large its sample is and whether that reaches the minimum of `Sample`: 20 values in each group of a comparison, 14 nights in a series.

### Set the readings up once

1. The KV namespace where the OAuth provider keeps clients, grants and tokens, whose id then goes into `edge/wrangler.jsonc` in place of the zeros. KV has no jurisdiction, and nothing in it is about a visitor.

   ```sh
   pnpm exec wrangler kv namespace create OAUTH_KV
   ```

2. A GitHub OAuth App, under Settings, Developer settings, OAuth Apps: homepage `https://eklund.eklund.workers.dev/`, callback URL `https://eklund.eklund.workers.dev/callback`. It asks for no scope, so it reads only the public profile. Its client id and a new client secret go to the Worker; without them, signing in answers 503.

   ```sh
   pnpm exec wrangler secret put GITHUB_CLIENT_ID --config edge/wrangler.jsonc
   pnpm exec wrangler secret put GITHUB_CLIENT_SECRET --config edge/wrangler.jsonc
   ```

### Read with Claude Code

```sh
claude mcp add --transport http eklund https://eklund.eklund.workers.dev/mcp
```

The first use opens the consent page in the browser. The JSON API takes the same tokens, as `Authorization: Bearer <token>`, from any OAuth client that registers itself and signs in the same way. Removing a login from `ALLOWED_GITHUB_LOGINS` and deploying shuts its tokens out at once, because each request checks the login again.

## Lighthouse

CI runs Lighthouse on the production build, mobile profile, five times on `/` and five times on `/en/`. [`tools/production-server.mjs`](../tools/production-server.mjs) serves the build the way the hosting does: HTTP/2 over TLS, brotli, and the headers and cache rules of the `.htaccess` files. Every assertion reads the median run, the one whose performance metrics sit in the middle, and not the best of the five.

Chrome runs in Portuguese (`--accept-lang=pt-BR`), the language of the page at `/`, so Lighthouse measures what a reader of Portuguese gets, without the offer of the English page. Before [0012](decisions/0012-no-redirect-by-browser-language.md), the head script sent an English browser from `/` to `/en/`, and Lighthouse measured both pages in one run: the fonts, the script and the stylesheet were downloaded twice, 557 kB instead of 286 kB.

A pull request fails when:

- accessibility or SEO drops from 100, or best practices under 90;
- layout shift goes above 0.02, or the console shows an error;
- the page weighs more than 360 kB, its scripts more than 70 kB or its fonts more than 200 kB, or it makes more than 12 requests;
- the page cannot be restored from the back/forward cache.

Performance warns below 75, LCP above 2.5 s and TBT above 200 ms. The limits are in [`lighthouserc.json`](../lighthouserc.json). Measured in CI on 2026-10-28, median run of `/`: accessibility 100, SEO 100, best practices 96, performance 80, LCP 2.6 s, TBT 663 ms, layout shift 0, 286 kB in 9 requests (58 kB of script, 185 kB of fonts). On a laptop the same median gives performance 93 and TBT 232 ms: the CI machine is slower, and the blocking time is what moves. The 4 points of best practices are the audit "legible font sizes" (about half of the text is under 12 px, which is a design choice), and the missing performance points are the blocking time described above.
