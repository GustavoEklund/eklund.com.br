# Web standards

What is verified, and where. Each item has a test that fails when it stops being true.

## Accessibility

[`docs/accessibility.md`](accessibility.md) lists every WCAG 2.2 A and AA success criterion with its status, the test that covers it and what only a person can judge, plus the WAI-ARIA patterns the widgets follow. Checks: `pnpm run a11y` (axe-core with the wcag2a to wcag22aa and best-practice tags in both themes, both languages, desktop and phone, and the open states; ARIA keyboard contracts; the WCAG 2.2 criteria that can be measured: target size, focus not obscured, reflow at 320 px, text spacing, reduced motion) and `pnpm run validate:html` (the W3C Nu HTML Checker on the shipped `index.html` and on the DOM the scripts build, in both languages; it needs Java 17 or newer).

## Contrast

Every text and non-text color pair reaches WCAG 2.2 AA at all 361 accent hues in both themes: `pnpm run contrast` computes the ratios from the real computed styles and exits 1 on any failure (`tests/e2e/contrast.e2e.test.js` covers the same in the browser, plus 17 page states). The accent color keeps one luminance across hues, so one pair of text colors works for all of them. The status page shows it live: its "Contraste" row measures the page in the current theme and hue and measures again when either changes.

## Fonts

Bricolage Grotesque, Instrument Serif and JetBrains Mono are served from `fonts/` as WOFF2 (Latin subset, plus Greek for the monospace face, which only loads when the terminal prints a sigma), with `font-display: swap`, `unicode-range`, a preload for the three first-screen files and a metric-matched system stand-in for each family (`size-adjust` and the ascent and descent overrides), so a late font moves the layout by about 0.008 instead of 0.045. Nothing is requested from another host. A font file that changes gets a new name, because the server caches fonts for a year. Tests: `tests/contract/fonts.contract.test.js`, `tests/e2e/fonts.e2e.test.js`.

## Security headers

`tools/site-headers.mjs` is the source of truth. `.htaccess` carries the same values for production and `serve.mjs` sends them in development and in the E2E runs, so every E2E test that checks the page for console errors also catches a policy violation. The Content-Security-Policy allows only this origin; the one inline script (the theme, set before first paint) is allowed by its hash, and `style=""` attributes are allowed because the widgets carry data-driven values in them (they cannot load anything). Changing that inline script changes the hash: the contract test prints the new value to paste into `.htaccess`. Tests: `tests/contract/security-headers.contract.test.js` (it also runs Google's CSP Evaluator on the policy), `tests/e2e/security.e2e.test.js`, `tests/integration/serve.integration.test.js`.

## Language

Each language has its own page and its own canonical address (`/` and `/en/`), both announced with `hreflang` in the head and in the sitemap; the root `.htaccess` sends the old `/?lang=en` to `/en/` and `en/.htaccess` sends `Content-Language: en-US`. When the language changes in the browser, the translator rewrites `lang`, the title, the description, the social tags, `og:locale` and the canonical address (`DocumentMetadata`). Names, code and keys carry `translate="no"`; the language links carry their own `lang`, `hreflang` and accessible name. Formatting goes through `Intl` only. Tests: `tests/contract/i18n-standards.contract.test.js`, `tests/contract/english-page.contract.test.js`, `tests/contract/head-script.contract.test.js`, `tests/e2e/i18n.e2e.test.js`, `tests/e2e/i18n-standards.e2e.test.js`.

## Structured data

One JSON-LD `@graph` in the head (Person, WebSite, ProfilePage) with stable `@id`s and language maps for every text, so it stays true after the page translates itself. It states only what the page shows, and carries no email. `tests/contract/json-ld.contract.test.js` runs it through a JSON-LD 1.1 processor (`jsonld`, offline, with the schema.org context as a fixture) and through a type and property check against the schema.org vocabulary. After changing the JSON-LD, run `node tools/schema-org-subset.mjs <path to schemaorg-current-https.jsonld>` to refresh the fixture; it fails when schema.org does not define a term.

## Sharing and discovery

Open Graph and Twitter card with a 1200 by 630 image (`node tools/render-brand-assets.mjs` redraws it and the icons), web manifest, one `theme-color` tag that `ThemeController` rewrites (a pair of prefers-color-scheme tags would be wrong whenever the visitor picks the other theme), `robots.txt`, `sitemap.xml` with hreflang, `.well-known/security.txt` (it expires on 2027-10-16; the contract test fails after that so it gets renewed). Test: `tests/contract/site-metadata.contract.test.js`.
