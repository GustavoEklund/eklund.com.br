# 0015. The panel is a second Worker behind Cloudflare Access, and checks the Access token itself

Status: accepted, 2026-11-10. It amends [0009](0009-measurement-on-a-cloudflare-worker.md), which put a private dashboard behind Cloudflare Access without saying where it runs.

## Context

[0009](0009-measurement-on-a-cloudflare-worker.md) has the recordings, the heat map and the rest of the data read in a private dashboard behind Cloudflare Access. Access guards a Worker's whole `workers.dev` address, and the collector `eklund` has to stay open: pages send to `/v1/*`, and the readings of [0013](0013-reading-the-data-without-the-agents-sdk.md) sign MCP clients in through GitHub. Zero Trust's free plan covers up to 50 users, and a Worker can read the identity of a request that Access let through.

Cloudflare's guidance is that an origin behind Access validates the token Access adds, `Cf-Access-Jwt-Assertion`, instead of trusting that every request came through Access. Workers also expose `ctx.access` for a request that Access authenticated, but it is undefined when Access is off, which is the state of a new Worker until its owner turns Access on.

## Decision

- **A second Worker.** The panel is `eklund-panel`, in `edge/panel/`, deployed from `edge/panel.wrangler.jsonc` to its own `workers.dev` address, with `preview_urls` off. It has no public route: everything it serves, a stylesheet or `robots.txt` included, is behind Access.
- **The same data, read only.** It binds the collector's D1 (`DB`) and R2 (`REPORTS`), and reaches them only through `ReadOnlyBindings`: a database that prepares one `SELECT` at a time and a bucket that can only get. The collector's deploy keeps the migrations. The pages ask `ReadingQueries`, the same class that answers the MCP tools and the JSON API, with inputs checked by the same `ReadingInputs`, so a number reads the same in the panel and in an agent's answer.
- **Its own check of the token.** Every request must carry a token that the Worker verifies with WebCrypto: RS256, signed by a key of the team's `/cdn-cgi/access/certs` (kept in memory for an hour, read again at most once a minute for a key id it lacks), issued by `https://<ACCESS_TEAM_DOMAIN>`, for the application's AUD tag (`ACCESS_AUD`), not expired, and naming an email of `ALLOWED_EMAILS`. Anything else, or a setting that is missing, answers 403. The check stands on its own and does not read `ctx.access`.
- **Access in front.** An Access application on the panel's `workers.dev` address admits only the owner's email, through a one-time PIN. The team domain is a variable, because the team can be renamed; the AUD tag and the allow-list are secrets the owner sets, so no address is in the repository.
- **Server-rendered pages.** HTML and inline SVG charts drawn by classes of the Worker, under a Content-Security-Policy with no inline script, no other origin and `frame-ancestors 'none'`, with `X-Robots-Tag: noindex` and `Cache-Control: no-store`. The only script is the replay page's, which runs rrweb's replayer (`@rrweb/replay`, pinned to the version of the recorder, copied into `edge/panel/vendor/` and checked byte for byte like the site's copies). The replay page alone allows inline styles and images from the site's two origins, because the replayer rebuilds a page of the site from what rrweb recorded, in a sandboxed frame without scripts.

The alternatives:

- **The panel inside the collector, under a path.** Access protects a whole `workers.dev` address, or a path only on a custom domain, which would need the zone on Cloudflare ([0009](0009-measurement-on-a-cloudflare-worker.md) keeps the DNS at Hostinger).
- **The panel behind the GitHub sign-in of the readings.** It works for one owner, but it is the Worker's own login, cookies and session code facing the browser, and Access gives a reviewed login, a one-time PIN and a session that can be revoked from the dashboard.
- **Trusting Access alone, or `ctx.access` alone.** Either leaves the panel open if Access is off for a moment, which is how every new Worker starts, and the one-time PIN would then be the only thing between the recordings and anyone.
- **A chart library or a framework.** The charts are bars, lines and a grid, which a class draws as SVG in a few lines, and the panel stays within [0001](0001-no-framework-everything-is-a-class.md).

## Consequences

- Only the owner, signed in through Access, can watch a recording or see the heat map. A token for another application, from another team, expired or for another email gets 403 even if Access lets the request through.
- The first deploy runs before Access is on, and the panel answers 403 to everything until the owner sets `ACCESS_AUD` and `ALLOWED_EMAILS` ([`build-and-deploy.md`](../build-and-deploy.md#the-panel)).
- The panel is one more Worker on the free plan: its requests count toward the account's 100,000 a day, and its D1 reads toward the free plan's reads, which a few page loads a day leave untouched. Each page asks D1 at most a few dozen statements.
- `@rrweb/replay` is a fourth runtime package, served only by the panel, which Dependabot and the release age of [0007](0007-supply-chain-policy.md) guard like the others.
