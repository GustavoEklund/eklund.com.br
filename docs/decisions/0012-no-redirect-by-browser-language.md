# 0012. The browser language offers the English page instead of redirecting to it

Status: accepted, 2026-11-09. It amends [0002](0002-one-page-per-language.md).

## Context

[0002](0002-one-page-per-language.md) let the inline script in the head send a visitor from `/` to `/en/` when the first language of their browser that the site translates was English. [#19](https://github.com/GustavoEklund/eklund.com.br/issues/19) measured what that costs. By the time the script runs, the browser has already asked for the fonts, the stylesheet and the script the Portuguese page names. The English page then asks for all of them again, and none comes from the cache. With Chromium on a cold cache, against the build served the way the hosting serves it:

| Browser language | Ends at | Requests | Over the network |
| ---------------- | ------- | -------- | ---------------- |
| Portuguese       | `/`     | 7        | 284 kB           |
| English          | `/en/`  | 13       | 465 kB           |

The redirect also made every measurement of `/` from a browser in English a measurement of two pages: Lighthouse CI has to run Chrome in Portuguese to measure `/` at all, and the nightly PageSpeed runs of [0009](0009-measurement-on-a-cloudflare-worker.md), whose browser is in English, reported `/en/` for `/`. Google's guidance on multilingual sites asks for the same thing for other reasons: it advises against redirecting a visitor to another language version by a guess about their language, and recommends links between the versions instead.

## Decision

- The head script sends a visitor from `/` to `/en/` only when they chose English: `?lang=en`, or the English they chose on an earlier visit (`localStorage` key `lang`). The browser language sends no one.
- On the Portuguese page, a browser whose first translated language is English, with no choice saved, sees a small note under the header that offers the English page. It is in English on both pages, so its reader can read it. Taking it switches the page as the header link does and saves English; declining it saves Portuguese, so it does not come back. It is fixed in place, so it moves nothing on the page, and it does not show without scripts, on `/en/` or to a crawler.

## Consequences

- A first visit from a browser in English downloads one page. The lab and the field measure `/` as the Portuguese page, which is what it is.
- A reader of English sees Portuguese first and needs one click, or one tap on the note, to read English. After that the saved choice sends them to `/en/` as before, and that later redirect costs only the Portuguese HTML, because the other files come from the cache.
- The head script no longer reads `navigator.languages` or the user agent, so it is shorter. The rule for who sees the note lives in `LanguageOffer.wanted`, which the tests run for every case.
