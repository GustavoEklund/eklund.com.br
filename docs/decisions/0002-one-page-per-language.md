# 0002. One page per language, with the language links as real links

Status: accepted, 2026-10-18. It replaces an earlier design that used `/?lang=en` on a single page.

## Context

The site is written in Brazilian Portuguese and in American English. With one page and a query string, crawlers could not give English its own canonical address, social cards read Portuguese whatever the link, and a visitor without scripts got Portuguese only.

## Decision

- `/` is Portuguese and `/en/` is English. Each has its own `<title>`, description, social tags, canonical address and `hreflang` alternates, and its text is already in its language before any script runs.
- `source/en/index.html` is generated from `index.html` and the English dictionary by `tools/i18n-check.mjs --fix-html`, and a test fails when it is out of date.
- The language links are `<a href="/">` and `<a href="/en/">`. A click switches in place without a reload and moves the address with `history.replaceState`. A modified click opens the other page.
- A visitor who opens `/` can be sent to `/en/` by the inline script in the head, before the first paint: `?lang=en` does, then a saved choice, then the first language of the browser that the site translates. A crawler is not sent anywhere because of its browser language, so the Portuguese page is the one indexed at `/`.
- The old address `/?lang=en` is redirected to `/en/` by `.htaccess`.

## Consequences

- English is a real page that can be linked, indexed and shared. A reader without scripts, a crawler and a social card all get the right language.
- The head script is the one place that decides, and editing it changes the hash in the Content-Security-Policy ([0003](0003-content-security-policy-with-a-script-hash.md)). A contract test runs the script against a fake browser for every case.
- A saved English choice sends a visitor from `/` to `/en/` every time. That was chosen on purpose: the choice is theirs, and the Portuguese page is one click away.
- Adding a language means one dictionary, one entry in two lists, one generated page and one set of section placeholders.
