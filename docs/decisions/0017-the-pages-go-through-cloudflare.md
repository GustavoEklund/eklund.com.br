# 0017. The DNS zone is on Cloudflare, and the pages go through its proxy

Status: accepted, 2026-11-17. It amends [0009](0009-measurement-on-a-cloudflare-worker.md), which kept the DNS at Hostinger.

## Context

[0009](0009-measurement-on-a-cloudflare-worker.md) kept the zone of eklund.com.br at Hostinger, because Hostinger's CDN only works with Hostinger's nameservers, and for the same reason turned down a subdomain of eklund.com.br for the collector. My home lab needs the zone on Cloudflare: Cloudflare Tunnel, Access on its own host names and certificates through Cloudflare's API all ask for it, and Cloudflare's free plan cannot take a delegated subdomain. That decision, and the records of the zone, live in the home lab's repository, which is private.

## Decision

- **The zone.** eklund.com.br is on Cloudflare since 2026-11-17, signed with DNSSEC. Every record and setting is code in the home lab's repository, applied with OpenTofu, and a change made in the dashboard is undone by the next apply.
- **The pages.** `eklund.com.br`, `www.eklund.com.br` and `gustavo.eklund.com.br` go through Cloudflare's proxy to the same Hostinger server as before. Hostinger's CDN is off. Deploys do not change: each release still goes to the hosting over FTP with TLS ([0008](0008-deploy-each-release-over-ftps.md)).
- **TLS to the hosting.** Cloudflare connects to the hosting over HTTPS and checks its certificate, the mode Cloudflare calls Full (strict). Hostinger cannot renew its Let's Encrypt certificates for names behind the proxy, so the hosting serves certificates from Cloudflare's Origin CA instead, one for the apex and `www` and one for the mirror, valid until 2041. Only Cloudflare trusts them.
- **The HTML as built.** Cloudflare's Email Obfuscation and Network Error Logging are off. The first rewrote each e-mail address of the pages into a `/cdn-cgi/` link and added a script to decode it, and the second had the visitor's browser report failed requests to Cloudflare. A page that goes through the proxy is byte for byte the page the hosting serves, and the headers of `.htaccess` pass unchanged.
- **The edge.** HTTP is redirected to HTTPS, and TLS 1.2 is the minimum. The edge caches files by their extension, such as scripts, styles, fonts and images, under the `Cache-Control` of the hosting, and asks the hosting for every page.
- **E-mail.** The mail records point at Hostinger as before, outside the proxy.

The alternatives:

- **Keep the zone at Hostinger**, as 0009 did. The home lab would get no subdomain of eklund.com.br with Tunnel and Access.
- **A separate domain for the home lab.** It leaves this zone alone, but the home lab's services would not live under eklund.com.br.

## Consequences

- Cloudflare sees the address of each request, as Hostinger's CDN did. The privacy policy and [`docs/privacy.md`](../privacy.md) name it.
- The time to the first byte of a page grows by the trip from Cloudflare to the hosting. From my home connection on 2026-11-17, the median of five requests was 67 ms through the proxy and 22 ms straight from the hosting. Caching the pages at the edge would win it back, with a purge after each release, and is a decision of its own.
- The nightly lab run of 2026-11-18 is the first through Cloudflare, and the change-point detection of [0009](0009-measurement-on-a-cloudflare-worker.md) compares it with the nights before.
- The collector on a subdomain of eklund.com.br, which 0009 turned down, is possible now. Moving it is a decision of its own.
- A name taken off the proxy fails in browsers until the hosting serves a Let's Encrypt certificate for it again.
- How the zone is set up lives in another repository. A setting there changes how the site is served, with no commit here.
