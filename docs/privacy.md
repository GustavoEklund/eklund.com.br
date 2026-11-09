# Privacy

What the site processes, on which legal basis, the balancing test for its legitimate interest, and the record of processing that Art. 37 of the LGPD asks for. The decisions behind it are [0009](decisions/0009-measurement-on-a-cloudflare-worker.md), [0010](decisions/0010-privacy-by-the-anpd-guidance.md) and [0011](decisions/0011-two-libraries-to-measure.md), and visitors read the privacy policy at `/privacidade/` and `/en/privacy/`. This record changes in the same pull request as the code it describes.

## Who is responsible

- **Controller.** Gustavo Eklund, Taubaté-SP, Brazil. A small processing agent under the ANPD's Resolution 2/2022, which needs no data protection officer, only a channel.
- **Channel.** gustavo+privacidade@eklund.com.br, answered within 15 days (Art. 19, II).
- **Operator.** Cloudflare runs the collector and keeps its data in the EU jurisdiction, which Brazil has recognized as adequate since 26 January 2026.
- **Host.** Hostinger serves the pages. Like any host, its servers and its CDN see the address of each request, and the site does not read those logs.

## What is processed

| Purpose                        | Data                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Legal basis                              | Kept in                         | For how long                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------- | ------------------------------------------------------ |
| The visitor's preferences      | Theme, language, color, motion and the privacy choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | None needed: they are never sent         | The visitor's browser           | Until cleared, and the privacy choice six months       |
| Anonymous measurement          | A random code for the page load, made in the page's memory, so that a later report of the same load updates it; page, language, version of the site, the host of the page the visitor came from, country, device type, browser and its major version; ranges of screen width, pixel ratio, device memory, processor cores and connection round trip; whether the visitor asked to save data, for a dark theme or for less motion; how the page was reached and how long it was visible; engagement events from fixed lists; Core Web Vitals with the element or script behind each value; errors in the site's own code | Legitimate interest (Arts. 7, IX and 10) | Cloudflare D1, in the EU        | Rows 13 months, errors 90 days, daily totals 25 months |
| Session recording and heat map | The page's content and its changes, with typed text masked; clicks and where they landed; a random code for each recording                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Consent (Arts. 7, I and 8)               | Cloudflare R2 and D1, in the EU | 30 days, or until consent is withdrawn                 |
| Uptime                         | The Worker's own requests to the site                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | No personal data                         | Cloudflare D1, in the EU        | 90 days, daily totals 25 months                        |
| Lab and search                 | Lighthouse runs, and the aggregates of CrUX, Search Console and Bing Webmaster Tools                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | No personal data                         | Cloudflare D1 and R2, in the EU | No limit                                               |

Never collected: IP addresses (the Worker sees them in transit, as any server does, and stores none), cookies, identifiers that link one visit to another, fingerprints, typed text, and the path or query of the page a visitor came from. Each recording has its own code, so two recordings of the same person cannot be linked.

## Balancing test

It covers the anonymous measurement and follows the three phases of the ANPD's guide on legitimate interest, of February 2024. Recording does not rely on it, because it needs consent.

### 1. Purpose

- **The interest.** Knowing how the site loads, where it breaks and which parts are used, to improve it from one release to the next. It supports the controller's activity (Art. 10, I): the site is a portfolio, and how it performs is part of what it shows.
- **Concrete and current.** The data feeds the comparison of each release with the previous one, a weekly report and the fixes that follow.
- **Explicit.** The banner, the privacy policy and this record state the purpose before anything is sent.

### 2. Necessity

- **Why field data.** The lab does not show real devices, networks or use, and CrUX has no data for a site with this traffic.
- **Minimization.** No IP address and no identifier are stored. Screen, connection and device are ranges, the page a visitor came from is reduced to its host, values come from fixed lists, typed text is never read, and retention is short.
- **Less intrusive options.** Lab runs alone, CrUX alone, and counting requests at the host. None of them shows how real visitors experience the site.

### 3. Balancing and safeguards

- **Expectations.** A visitor of a developer's portfolio that shows its own observability can expect it to measure itself, and the banner tells everyone on the first visit.
- **Impact.** The data cannot be linked to a person. There is no profiling, no advertising, no sharing and no sale, and the stored data serves only this purpose.
- **Safeguards.** "Refuse all", on the banner and later in the footer, stops everything at once. Global Privacy Control counts as a refusal, and nothing is sent after one. The code is public, the data stays in the EU, and retention follows the CNIL's conditions for exempt audience measurement.
- **Conclusion.** With these safeguards, the interest does not override the visitors' rights and freedoms. The test is done again when a purpose or a kind of data changes.

## Record of processing

| Operation                      | Whose data                  | Purpose                           | Basis               | Shared with             | Where                                         | Retention | Security                                                                         |
| ------------------------------ | --------------------------- | --------------------------------- | ------------------- | ----------------------- | --------------------------------------------- | --------- | -------------------------------------------------------------------------------- |
| Anonymous measurement          | Visitors who did not refuse | Improve the site                  | Legitimate interest | Cloudflare, as operator | EU, adequate for Brazil since 26 January 2026 | As above  | TLS, origin check, no IP stored, reading only through OAuth or Cloudflare Access |
| Session recording and heat map | Visitors who consented      | Find what gets in a visitor's way | Consent             | Cloudflare, as operator | EU, adequate for Brazil since 26 January 2026 | 30 days   | The same, plus masked typing and deletion by code                                |
| Uptime                         | Nobody                      | Know when the site is down        | Not personal        | Cloudflare, as operator | EU                                            | 90 days   | The same                                                                         |

## Rights of the data subject

- **Measurement** cannot be linked to anyone, so it cannot be found, corrected or deleted person by person. Refusing stops it from then on.
- **Recordings** are deleted at once when consent is withdrawn, or through "Delete my recordings", which uses the codes the browser kept. Without those codes, no recording can be tied to a person.
- **Anything else** goes to the channel above.
