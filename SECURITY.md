# Security policy

This is a static personal website. It has no server code, no accounts, no forms and no cookies, and the page asks no other host for anything. The attack surface is small, and I want to hear about anything that makes it bigger.

## Supported versions

Only the latest release is supported. The site at <https://eklund.com.br> always runs it, so a fix ships as a new release (see [`CHANGELOG.md`](CHANGELOG.md)).

## Reporting a vulnerability

Please do not open a public issue or a pull request for a vulnerability.

1. Use the private form of this repository: [Report a vulnerability](https://github.com/GustavoEklund/eklund.com.br/security/advisories/new). Only you and I see it, and the fix can be prepared in a private fork.
2. Or write to **gustavo@eklund.com.br**. The same address is in [`security.txt`](https://eklund.com.br/.well-known/security.txt).

Portuguese and English are both fine. A good report says what you found, where (a URL or a file), how to reproduce it, and what you think an attacker gains. A browser version and a screenshot or a proof of concept help.

## What to expect

| When                  | What I do                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Within 3 days         | Confirm that I received the report.                                                                                                |
| Within 14 days        | Tell you whether I consider it a vulnerability, and the plan.                                                                      |
| When the fix is ready | Publish a release and, for a real vulnerability, a GitHub security advisory that credits you, unless you prefer to stay anonymous. |

I ask you to keep the details private until the fix is released, or for 90 days after your report, whichever comes first.

## Scope

In scope:

- Script injection, a bypass of the Content-Security-Policy, or anything that makes the page run code that is not in the build.
- A security header that is wrong or missing in [`source/.htaccess`](source/.htaccess) or in [`tools/site-headers.mjs`](tools/site-headers.mjs).
- A dependency, a workflow or a build step that lets someone change what is published (see the supply chain notes below).
- A secret committed to the repository.
- A flaw in the load test worker that reaches outside the page.

Out of scope:

- The hosting service and its servers. Do not test them.
- Denial of service, brute force and anything that needs many requests.
- Findings from a scanner without a way to exploit them, and best-practice advice that has no effect on this site.
- Missing headers on the local development server (`pnpm dev`), which exists only for development.
- The e-mail address on the page, which is public on purpose.
- Social engineering of the maintainer.

## Safe harbor

If you follow this policy and act in good faith (you do not read or change data that is not yours, you do not degrade the site for other people, and you stop when you have shown the problem), I will not take legal action and I will say so if someone asks.

## How the site defends itself

- A [Content-Security-Policy](docs/web-standards.md#security-headers) that allows only this origin. The one inline script is allowed by its hash, and a test fails when the hash and the script disagree.
- `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and `Cross-Origin-Opener-Policy`, set from one file and checked by a contract test.
- No third-party requests, no cookies, no analytics. Fonts, icons and scripts come from the same origin.
- Every GitHub Action is pinned to a commit, workflows run with the least permission they need, and CodeQL, dependency review, secret scanning and OpenSSF Scorecard run on the repository ([how](docs/continuous-integration.md#security)).
- Dependencies are updated by Dependabot after a cool-down, and `pnpm` refuses a version that is less than two days old, one that lost its provenance, and an install script that nobody approved.
