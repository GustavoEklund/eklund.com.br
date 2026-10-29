# 0011. Two libraries run in the browser, both to measure the site

Status: accepted, 2026-10-28. It amends [0001](0001-no-framework-everything-is-a-class.md) and [0007](0007-supply-chain-policy.md).

## Context

[0001](0001-no-framework-everything-is-a-class.md) keeps every library out of the browser, and [0007](0007-supply-chain-policy.md) relies on the shipped site carrying no third-party code. Measuring Core Web Vitals well means handling INP, long animation frames, the back/forward cache and prerendering, which Google's `web-vitals` gets right and a version of my own would easily get wrong. Recording a session means serializing the page and every change to it, which is what `rrweb` does.

## Decision

- `web-vitals` 6 in its attribution build (Apache-2.0, about 5 kB with brotli) and `@rrweb/record` 2 (MIT, about 30 kB with brotli) are the only libraries the browser runs.
- Each is a copy of its npm file in `source/js/vendor/`, because `source/` runs without a build. A test compares each copy byte for byte with the version pinned in `package.json`, so Dependabot, the release age and the trust policy of 0007 still choose the version.
- Both load through a dynamic import, and only when [0010](0010-privacy-by-the-anpd-guidance.md) allows it: `web-vitals` unless the visitor refused the measurement, and `rrweb` only after consent to recording.
- The footer says so: "Built with just HTML, CSS and JavaScript, no frameworks. Two libraries, both to measure the site: web-vitals and rrweb". The README and SECURITY.md say the same.
- `source/js/vendor/` is the one folder outside the class rule, the formatter and the rule of a test per module.
- The Worker of [0009](0009-measurement-on-a-cloudflare-worker.md) is not the site. Its code follows the class rule, and its runtime dependencies (Cloudflare's Agents SDK, the MCP SDK and the OAuth provider) follow 0007.

The alternatives:

- **Measuring by hand, with `web-vitals` only as a test oracle.** It keeps the browser free of libraries, at the cost of rewriting what the Chrome team maintains.
- **An import map.** One more inline script, with its own hash in the Content-Security-Policy.
- **PostHog's SDK.** Over 100 kB, and its recorder loads from PostHog's servers unless it is bundled.

## Consequences

- A first visit downloads about 5 kB more, and `rrweb` costs nothing until someone consents.
- The copies move only with their package, which the byte-for-byte test enforces.
- The footer, the README, SECURITY.md and the architecture tests change in the pull request that adds the libraries.
