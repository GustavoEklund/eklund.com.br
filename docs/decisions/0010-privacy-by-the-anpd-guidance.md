# 0010. Privacy follows the ANPD: anonymous measurement by legitimate interest, recording only with consent

Status: accepted, 2026-10-28.

## Context

The LGPD applies to the site, because a portfolio meant to win work is not a purely private activity. The ANPD's guide on cookies accepts legitimate interest for audience measurement with aggregate data and no profiles, and asks for consent for anything that follows a person, such as session recordings and heat maps. It rejects consent by continued browsing, pre-ticked choices, a lone "accept" button and a refusal that is harder to find than the acceptance. In the EU, a strict reading of the ePrivacy Directive asks for consent even without cookies, and only France and the UK exempt audience measurement. The site follows the ANPD to the letter.

## Decision

- **Purposes.** The site's own preferences stay in the browser and need nothing. Anonymous measurement (visits, engagement events, Core Web Vitals and errors) runs by legitimate interest, within the conditions the CNIL sets for exempt audience measurement: my own use only, no IP address, no identifier across sites, no reuse by a vendor and at most 25 months. Session recording and the heat map run only with consent.
- **The banner.** A card fixed at the bottom of the screen that does not block the page. The head script decides before the first paint whether it shows, so it never moves the layout. Its first layer has the text, "Accept all", "Refuse all" and "Choose" with the same size and style, a link to the privacy policy, and no close button. "Refuse all" turns the measurement off too. The banner keeps the focused element in view (WCAG 2.4.11), its targets are at least 24 px, and it does not move under reduced motion.
- **The text.** "I measure, anonymously and without cookies, how this site loads and how it is used, so I can make it faster and fix what breaks. If you allow it, I also record the session and the clicks, without anything you type. You can refuse all of it now or later, in the footer." The Portuguese page says the same.
- **The second layer.** A dialog lists the site's preferences (always on), anonymous measurement (on, marked as running by legitimate interest) and recording with the heat map (off), with buttons to save the choice, accept all, refuse all and delete my recordings.
- **Global Privacy Control** counts as "Refuse all", and the banner does not show. The site publishes `/.well-known/gpc.json`. A visitor who refused sends nothing and downloads none of the measurement code.
- **The choice** stays in the browser for six months, with the version of the purposes, and the banner asks again when either runs out or changes. The proof of what was asked is the release tag and the banner's screenshots in both languages, attached to the release.
- **Deleting recordings.** The browser keeps the random codes of its recordings for 30 days. Withdrawing consent, or "Delete my recordings", asks the Worker to delete them at once. That is how a visitor can use Art. 18, VI of the LGPD on data that nobody else can link to them.
- **Retention.** Rows of visits, events and Web Vitals for 13 months, and their daily totals for 25. Error rows for 90 days. Recordings and heat-map clicks for 30 days. Uptime checks for 90 days, and their daily totals for 25 months. Lab, CrUX and Search Console data, which are not personal, without a limit.
- **Pages.** Privacy, Cookies and Terms of use, in both languages, at `/privacidade/`, `/cookies/`, `/termos/`, `/en/privacy/`, `/en/cookies/` and `/en/terms/`. The footer and the command palette link to them and to "Privacy preferences", which reopens the choice. The terms follow Brazilian law, with the courts of Taubaté-SP. Data subjects write to gustavo+privacidade@eklund.com.br.
- **Records.** The balancing test of the legitimate interest and the record of processing are public in [`docs/privacy.md`](../privacy.md), and the privacy page sums them up in Portuguese.

The alternatives:

- **Consent for everything.** The strictest reading everywhere, but most visitors never answer a banner, and a site with little traffic would lose most of what it measures.
- **Consent only for visitors in European time zones.** It closes the EU risk, at the cost of a list of time zones in the head script and two versions of the text.
- **A notice without a banner.** Enough for anonymous measurement in Brazil, but recording needs consent, and consent needs a banner.
- **A consent library.** CookieConsent marks a box that does not block the page as modal and hides from WebDriver, Klaro is unmaintained, and the others inject styles, call `eval` or have no Portuguese. A class of a few kilobytes fits the site and its tests.
- **"By continuing to browse, you agree to cookies".** The ANPD's guide rejects it, and the site sets no cookies.

## Consequences

- The measurement covers everyone who does not refuse, which is what makes one release comparable with the last.
- A strict reading of EU law still wants consent to measure EU visitors, and Art. 7, IX of the Marco Civil da Internet asks for express consent to collect personal data. This record accepts both risks because nothing personal is stored. It is reopened if the ANPD's consent regulation, the EU's Digital Omnibus or the share of EU visitors changes that.
- The head script grows, and its hash in the Content-Security-Policy changes ([0003](0003-content-security-policy-with-a-script-hash.md)).
- A new purpose is a new version, and the banner asks every visitor again.
