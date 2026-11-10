# 0016. A missing address answers 404 with a page of the site, named by ErrorDocument

Status: accepted, 2026-11-10.

## Context

A missing address, such as `https://eklund.com.br/nao-existe`, answered with the status 404 and the default error page of the hosting: a page in English, in another visual language, with nothing that leads back to the site, and without the security headers of the site. `source/.htaccess` named no page for the error. The hosting is the shared plan of Hostinger ([0008](0008-deploy-each-release-over-ftps.md)), where LiteSpeed reads the `.htaccess` files the way Apache does, behind Hostinger's own CDN. The `.htaccess` of `en/` already works there: `/en/` answers with `Content-Language: en-US`, which only that file sets.

What a good error page does is well known. It keeps the status 404, so a crawler drops the address and a link checker reports it. It says plainly that the page does not exist, in the visitor's language, and offers the next step: the home page, the main sections, a way to report a broken link. It is not indexed, and it is never a redirect to the home page, which search engines treat as a soft 404.

## Decision

- Two pages, `404.html` in Portuguese and `en/404.html` in English, written by hand in HTML like the legal pages ([0014](0014-legal-pages-written-in-html.md)): one stylesheet, `css/legal.css`, the inline script of the head of `index.html` byte for byte (so the one hash of the Content-Security-Policy allows it, [0003](0003-content-security-policy-with-a-script-hash.md), and the theme, hue and motion the visitor chose apply), and no other script, so the page measures nothing. `tools/not-found-pages.mjs` lists them, and `tools/i18n-check.mjs --fix-html` copies the head script into them with the legal pages.
- They say the page does not exist, link the home page of their language and each of its sections, the source code on GitHub, the legal pages and the privacy preferences, give my email for a broken link, and offer the home page of the other language. They carry `<meta name="robots" content="noindex">`, no canonical or alternate address, and they stay out of the sitemap.
- Every address in them starts at the root, `/`: the page is served at the address that was asked for, at any depth, where a relative address would point somewhere else. The build gives the fonts, the icons and the stylesheet their hashed names under `/assets/`. They preload the two fonts of their first screen, so the text does not move when the fonts arrive.
- The root `.htaccess` says `ErrorDocument 404 /404.html`, and the one of `en/` says `ErrorDocument 404 /en/404.html`. The target is a local path, so the server answers with the page by an internal redirect and keeps the status 404; a full URL would send the browser away with a 302. The server reads the `.htaccess` of every folder that exists down to the address, so every missing address under `/en/` gets the English page, however deep, and every other one the Portuguese page.
- The 404 page is kept ten minutes, `public, max-age=600`, without the `stale-while-revalidate` of the other pages, so a page published at an address that was missing shows up soon. That header is set with `Header always set`, after a `Header unset` of the one the rule for pages sets, so that it goes out with the error and never twice. The security headers were already `always`.
- `tools/serve.mjs` and `tools/production-server.mjs` answer a missing address the same way: the page of the deepest folder of the address that exists (`NotFoundPages.fileFor`), with the status 404 and the headers of a page.

The alternatives:

- **One page for both languages, chosen by `<If "%{REQUEST_URI} =~ m#^/en/#">`.** Apache 2.4 takes `ErrorDocument` inside `<If>`, but I found no statement that the LiteSpeed of the hosting does, and LiteSpeed is known to skip some directives it does not understand without an error, which would leave every 404 on the default page with nothing to show it. An `ErrorDocument` in the `.htaccess` of `en/` needs nothing new: that file is already read in production.
- **A page in a folder, `/404/`.** It would answer `200` at `/404/` and is no clearer than `404.html`, the name GitHub Pages, Netlify and Cloudflare Pages give the same page.
- **Showing the address that was asked for.** The page is static. Writing the address into it needs a script, which the policy would have to allow by another hash or file, or server-side includes, which the hosting may not run. The address bar already shows it.
- **A redirect to the home page.** It loses the status 404 and leaves the visitor without knowing what happened.

## Consequences

- The copy of a version (`/1.1.0/`) carries the same `.htaccess` files, and both name the pages at the root, which always exist and always match the assets online. The copies of the versions before this one name no page: an address missing inside them falls to the root `.htaccess` and gets the Portuguese page, under `/1.0.0/en/` too. The build still writes the 404 pages into the copy, like every other page, where nothing names them.
- The mirror, `gustavo.eklund.com.br`, is its own folder with its own copy of every file, so its missing addresses get its own 404 pages.
- How the server and its CDN treat the headers of an error response is not something the tests can run. After the deploy, `curl -sI https://eklund.com.br/nao-existe` and `curl -sI https://eklund.com.br/en/nao-existe` should answer 404 with `Cache-Control: public, max-age=600` and the Content-Security-Policy of the site, and the body should be the page of the right language. If LiteSpeed sends the page without the `Content-Language` of its folder, the `lang` of the page still says it.
- The text of the 404 pages is outside the dictionaries, like that of the legal pages, and a change to one changes both files. A contract test checks what must agree: the head script, the links, the `ErrorDocument` lines and the cache rule.
