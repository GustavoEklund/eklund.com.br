# Changelog

All notable changes to this project are written here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). What counts as a major, a minor and a patch change for a website is explained in [`docs/releasing.md`](docs/releasing.md).

## [Unreleased]

## [1.0.0] - 2026-10-27

### Added

The first public version of the site and of its repository.

**What a visitor gets**

- A hero with a globe drawn by hand in WebGL2: the land comes from Natural Earth data packed into a bitset of latitude rings, the shader source can be read in a dialog on the page, and hue, speed and the number of points can be changed.
- A status page about the page itself. Its rows read the browser's Performance API live: size of the document, fonts, frame rate of the globe, long tasks, layout shift, dependencies, platform and color contrast. It keeps an incident log and an uptime strip.
- A trace viewer that shows how this page loaded as a timeline of spans (navigation, network, document, script, assets, fonts), with zoom, keyboard navigation and the attributes of each span.
- An observability dashboard built from a synthetic day of traffic: throughput, latency at p95 and p99, an uptime strip and a table that carries the same numbers.
- An architecture map, drawn in SVG, of a direct participant in the Brazilian instant payment system. It simulates the traffic, shows replicas on hover and can follow a single Pix step by step with captions.
- A load test that runs a toy Pix engine in Web Workers. It ramps up and down, draws throughput, latency and histogram charts, prints a terminal log, and checks idempotency, balance, conservation of money and a hash of the journal. It starts when its section is on screen and can be paused.
- Profile, experience and contact sections, with an e-mail address that copies on click.
- A command palette (Ctrl K or Cmd K) with fuzzy search over every section and action, including theme, accent hue, language, pausing motion and links.
- Dark and light themes, and an accent color of 361 possible hues that recolors the whole site and its canvases.
- Two languages with a page each, Portuguese at `/` and English at `/en/`. A visitor's first language is picked from the browser, a choice made with the language links is remembered, and switching does not reload the page.
- A button to pause all motion, the custom cursor and scrollbar, and respect for the system setting for reduced motion.
- A link to the source code of the site in the header, the footer and the command palette.

**Performance**

- A production build with Vite+ (Rolldown, the Oxc minifier and Lightning CSS) that makes one JavaScript file and one stylesheet with a hash in their names, and minifies the markup, the structured data and the manifest. A cold load asks for 7 files instead of 90, and the bytes on the wire go from 344 kB to 282 kB (brotli). On a phone profile (slow 4G, CPU 4 times slower) the first paint comes 31% sooner and the page is loaded 26% sooner.
- Fonts served from the same origin as WOFF2, with a stand-in tuned to the metrics of each family, so a late font moves the layout by about 0.008.
- Layout shift of 0 on a normal load in both languages, measured live by the status page and checked by a test. Every box that a script fills has its final size before the script runs.
- Caching for a year for every file whose name carries a hash, and ten minutes for the pages.

**Accessibility**

- WCAG 2.2 level AA, with every A and AA success criterion listed in [`docs/accessibility.md`](docs/accessibility.md) together with the test that covers it, and all of them passing.
- Text and non-text color pairs at AA contrast for all 361 hues in both themes, checked by a script that reads computed styles.
- Keyboard use of every control, the WAI-ARIA patterns for the slider, the combobox, the modal dialog, the accordion, the disclosure and the listbox, a skip link, text that survives 200% zoom and a 320 px wide window, and focus that the fixed header never covers.

**Security and privacy**

- A strict Content-Security-Policy that allows only the site's own origin. The one inline script is allowed by its hash, and a test fails when the script and the hash disagree.
- `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and `Cross-Origin-Opener-Policy`, written once in `tools/site-headers.mjs` and compared by a test with what `.htaccess` sends.
- No cookies, no analytics and no request to another host. The language is saved in the browser only when the visitor chooses one.
- `security.txt` and a [security policy](SECURITY.md) with private reporting.

**Discovery and sharing**

- Structured data (Person, WebSite, ProfilePage) that stays true after the page translates itself, canonical addresses and `hreflang` for both languages, a sitemap, `robots.txt`, Open Graph and Twitter cards with a 1200 by 630 image, a web manifest and a `theme-color` that follows the theme.

**Tests and quality gates**

- More than 2,200 unit, property-based, component, integration, contract, architecture and build tests with Vitest and fast-check, 79 behavior scenarios in Gherkin with Cucumber, and more than 600 browser tests with Playwright on desktop and phone, which also run against the production build.
- Assertions are exact. The lint rules reject loose matchers, and architecture tests keep the folder layout, the "every module is a class" rule and the separation between features.
- Mutation testing with Stryker, every week.
- The W3C Nu HTML Checker on the shipped and the rendered pages, axe-core in both themes and languages, Stylelint, and a check of the site against the EasyList, EasyPrivacy and uBlock Origin filter lists.
- Lighthouse on the production build: 100 for accessibility and SEO, 96 for best practices and 84 for performance in a mobile profile.

**Repository and process**

- Conventional Commits, checked on the developer's machine by a `commit-msg` and a `pre-push` hook and in CI for every commit and every pull request title, together with a spelling check of the message.
- A spelling check of the whole repository in English and Brazilian Portuguese, with a vocabulary file for the project's own terms.
- GitHub Actions workflows for the checks above, for CodeQL, dependency review, OpenSSF Scorecard, secret scanning, a lint of the workflows themselves, link checking and the release. Every action is pinned to a commit and every job asks for the least permission it needs.
- Dependency updates by Dependabot after a cool-down, and `pnpm` settings that refuse a version less than two days old, a version that lost its provenance and an install script nobody approved.
- This changelog, Semantic Versioning, and a release workflow that checks the tag against `package.json` and this file, builds the site, publishes a GitHub release with the zip of the site, a checksum, a software bill of materials and a signed provenance attestation.
- The MIT license for the code and CC BY-NC-ND 4.0 for the text and images ([`NOTICE.md`](NOTICE.md)), a Code of Conduct, contributing and support guides, issue forms, a pull request template and code owners.
- Documentation in [`docs/`](docs/): architecture, internationalization, web standards, testing, build and deploy, continuous integration, releasing and repository settings, and the decisions behind them.
- A guide for coding agents in [`AGENTS.md`](AGENTS.md), which Claude Code reads through `CLAUDE.md`: the commands, the architecture and the rules that the tests enforce. [ai-memory](https://github.com/akitaonrails/ai-memory) keeps their sessions and handoffs across agents, with its workspace and project in [`.ai-memory.toml`](.ai-memory.toml).

[Unreleased]: https://github.com/GustavoEklund/eklund.com.br/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/GustavoEklund/eklund.com.br/releases/tag/v1.0.0
