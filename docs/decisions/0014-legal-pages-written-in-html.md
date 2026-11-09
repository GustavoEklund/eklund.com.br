# 0014. The legal pages are written in HTML, one file per language

Status: accepted, 2026-11-09.

## Context

[0010](0010-privacy-by-the-anpd-guidance.md) asks for three pages in both languages: privacy, cookies and terms of use, at `/privacidade/`, `/cookies/`, `/termos/`, `/en/privacy/`, `/en/cookies/` and `/en/terms/`. The rule for text a visitor reads is that it lives in the two dictionaries, which the main script loads on every visit, so that the home page can switch language in place ([0002](0002-one-page-per-language.md)). The legal pages are long text that is read once, they never switch language in place, and they must work without scripts. In the dictionaries, their 23 kB of text (9 kB compressed) would go into the script every visitor of the home page downloads, for pages most visitors never open.

## Decision

- Each legal page is a static HTML file written by hand, one per language, under `source/`. Its text is in the file, and the pages of the two languages link to each other by their address, with `hreflang` and the canonical address in the head.
- They load one stylesheet, `css/legal.css`, which brings in the tokens and the fonts by `@import`, so the build gives them one small file of their own and leaves the home page's stylesheet as it is.
- Their head carries the inline script of `index.html`, byte for byte, so the one hash of the Content-Security-Policy ([0003](0003-content-security-policy-with-a-script-hash.md)) allows it and the theme, hue and motion the visitor chose apply there too. `tools/i18n-check.mjs` copies it with `--fix-html` and fails while a page differs.
- The footer of the home page links them through dictionary keys, so the links follow the language when it switches in place.

## Consequences

- The text of the legal pages is outside the dictionaries, and a change to one of them changes both files of that page. A contract test checks the parts that must agree: the date of the version, the links between the languages, and that the cookie policy lists exactly the keys the code stores.
- The home page downloads nothing more than three short links.
- A copy of the site in its version folder links the legal pages of the root once its script runs, because the dictionary names them from the root. The policy that applies is the current one, so this is the address it should have.
