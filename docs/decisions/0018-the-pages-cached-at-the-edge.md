# 0018. Cloudflare keeps a copy of each page, dropped by every deploy

Status: accepted, 2026-11-26. It amends [0017](0017-the-pages-go-through-cloudflare.md), which left caching the pages as a decision of its own.

## Context

Since the zone moved to Cloudflare ([0017](0017-the-pages-go-through-cloudflare.md)), the edge asks the hosting for every page. Hostinger's CDN had kept a copy of each page for the ten minutes of its `Cache-Control`. The nightly lab run showed the cost: in the PageSpeed reports of / on mobile, the page took 223 ms to arrive on 2026-11-16 and 1,267 ms on 2026-11-18, every other file waits for it, and the median first contentful paint went from 1,065 ms to 1,683 ms, with every run after the move slower than every run before.

The same reports showed a script of Cloudflare Web Analytics added to every page served to a browser, from 2026-11-19 on. The Content-Security-Policy blocked it, so it sent nothing, but the page was no longer the page the hosting serves, which 0017 promised.

## Decision

- **A copy at the edge.** A Cache Rule of the zone makes the pages of `eklund.com.br`, `www.eklund.com.br` and `gustavo.eklund.com.br` eligible for the cache, for as long as the hosting's `Cache-Control` says: ten minutes, then served stale for up to a day while the edge revalidates. A missing address is kept as a 404 under the same header. The rule sets no edge TTL of its own, so the free plan's two-hour minimum does not apply.
- **Every deploy drops the copies.** After the upload, the [`Deploy`](../../.github/workflows/deploy.yml) workflow purges the whole zone with a token that can only purge its cache, and only then compares the pages online with the release. One purge a release is far inside the free plan's five a minute.
- **No Web Analytics.** A Configuration Rule turns Cloudflare's real user monitoring off for the whole zone, so the beacon is never added.

The rules and the token's zone live in the home lab's repository, like the rest of the zone. The token is a secret of the `production` environment here ([`repository-settings.md`](../repository-settings.md#deploy)).

The alternatives:

- **An edge TTL longer than the header**, which the free plan allows from two hours. The purge would keep it correct, but a deploy whose purge failed would leave old pages online for hours.
- **Leave the pages uncached.** Every visit pays the trip to the hosting, which the lab run measures every night.

## Consequences

- The first visitor after a deploy, or after ten quiet minutes in a Cloudflare location, still waits for the hosting. With little traffic most visits may be the first in their location, so the lab run, which comes from the same few places, gains more than visitors do.
- If the first contentful paint on mobile does not come back near its value before the move within a few nights, the copy at the edge was not the cause, and the rule goes away.
- A deploy fails when the purge fails, rather than leaving the old pages at the edge for ten more minutes.
