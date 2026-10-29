# 0009. Measurement goes to a Cloudflare Worker of my own, outside the site's host

Status: accepted, 2026-10-28.

## Context

The site measures itself only inside the visitor's browser: `PageReadings` feeds the status page and the trace viewer, and nothing leaves the page. Lighthouse CI judges each pull request on the best of three runs, and nothing watches the site once it is online. To improve it from one release to the next, I need to know how it loads and how it is used by real visitors, how it does in the lab every night, how people find it and whether it is up, and an AI agent has to be able to read all of that.

The site stays static, so that any host can serve it, and everything has to fit free plans. Hostinger's Single plan has PHP and MySQL, but no SSH, a deploy account that sees only `public_html`, and a CDN whose security filter can answer 403 to API requests with no way to exempt a path.

## Decision

- **The collector.** A Cloudflare Worker named `eklund`, on `workers.dev` and the free plan, receives what the pages send. D1 keeps the rows and R2 keeps the files, both created in the EU jurisdiction. Nothing runs at the site's host, and the DNS stays at Hostinger.
- **Sending.** The pages send JSON with `fetch` to `/v1/...` paths, which pass the filter lists, and never with `sendBeacon`, which EasyPrivacy blocks for every other host. The Content-Security-Policy gains the Worker's origin in `connect-src` and nothing else. The Worker accepts requests from eklund.com.br, gustavo.eklund.com.br and the local servers, and leaves robots and Lighthouse runs out.
- **What it keeps.** Visits, engagement events, Core Web Vitals with their attribution, errors, and, with consent, session recordings and clicks, as [0010](0010-privacy-by-the-anpd-guidance.md) sets out. The country comes from Cloudflare. No IP address and no identifier are stored.
- **Every release online.** Release folders stay online ([0008](0008-deploy-each-release-over-ftps.md)), so the Worker accepts every payload version a release has sent, and a contract test proves it. `/1.2.0/en/` counts as `/en/` with its release, and the mirror counts as its own host.
- **The lab.** Lighthouse CI asserts on the median of five runs against the build served as production serves it, with HTTP/2 and brotli. Script and font sizes, the request count and the back/forward cache fail a pull request, and LCP and TBT warn. A nightly job runs PageSpeed Insights on `/` and `/en/`, mobile and desktop, median of five, reads CrUX, Search Console and Bing Webmaster Tools, and sends it all to the Worker, with the full reports in R2. A change is judged with statistics: a Mann-Whitney U test between runs, and change-point detection on the nightly series. Each release pings IndexNow.
- **Uptime.** A Cron Trigger checks `/`, `/en/`, `gustavo.eklund.com.br` and the current release's folder every five minutes, and opens an issue in a private operations repository when the site goes down and when it comes back.
- **Reading the data.** The Worker serves a read-only MCP server, and the same data as JSON, behind OAuth with GitHub that admits only my account. A private dashboard, with the recordings and the heat map, sits behind Cloudflare Access. A weekly Claude Code routine compares the current release with the previous one and opens an issue in the operations repository. A comparison needs a minimum sample, and the report says when there is none.
- **Code and deploy.** The Worker lives in `edge/`, under the rules of [0001](0001-no-framework-everything-is-a-class.md) and [0007](0007-supply-chain-policy.md), with JSON Schemas in `tests/contract/` for what the pages send and a test on each side. It deploys from `main` through a GitHub environment, apart from the site's releases.

The alternatives:

- **Laravel 13 on Hostinger.** Same origin, and the data stays in Brazil. But without SSH, Composer cannot run on the server, the code and its `.env` would sit inside `public_html`, the CDN filter could block the API, and the API would tie the site to a paid host.
- **PostHog Cloud for everything.** Recordings and dashboards come ready, but its SDK weighs 113 to 217 kB gzip, its Web Vitals carry no attribution, it sets a cookie by default, its terms allow training on de-identified data unless that is turned off, and the filter lists block its domain.
- **Cloudflare Web Analytics.** Free, and with Web Vitals attribution, but no events of my own, a script from another host that the lists block, and data aggregated after seven days.
- **Umami, Plausible, GoatCounter or Matomo.** Umami's free cloud has no API, Plausible's cloud is paid, GoatCounter only counts, and Matomo measures no Web Vitals.
- **A subdomain of eklund.com.br for the Worker.** It would be first-party, but it needs the whole DNS zone on Cloudflare, which turns Hostinger's CDN off.

## Consequences

- Real visits, lab runs, search data and uptime end up in one SQL store that an agent can query, and the site still has no server code.
- The page now asks one other host for something. SECURITY.md and the README say so, and the Worker's code is public here.
- The free plans set the ceiling: 100,000 requests and 100,000 written rows a day, 500 MB per D1 database, 10 GB in R2 and five Cron Triggers. The site uses a small part of it.
- If a filter list blocks the Worker, the visits of the people who use that list are lost. Renaming the endpoint to escape a list is not an option.
- Cloudflare, Google, Bing and GitHub each need an account, a key or an app, and none of them can deploy the site.
