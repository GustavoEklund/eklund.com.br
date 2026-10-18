# 0003. A strict Content-Security-Policy, with the one inline script allowed by its hash

Status: accepted, 2026-10-17.

## Context

A static site with no third-party code can ask the browser to run nothing but its own files. One small script has to run before the first paint to set the theme, the accent hue and the motion setting, otherwise the page flashes the wrong colors. A script in a file is too late for that.

## Decision

- The policy allows only this origin for everything (`default-src 'self'`), forbids plugins, framing and base-URI changes, and upgrades insecure requests.
- The inline theme script is allowed by its SHA-256 hash, so there is no `'unsafe-inline'` for scripts. The hash is computed from the page, and a test fails when the script and the policy disagree.
- Style attributes are allowed (`style-src-attr 'unsafe-inline'`) because widgets carry data-driven values in them, such as `--i` and `--brand`. An attribute cannot load anything or run code, and stylesheets and style elements still have to come from this origin.
- The policy and the other headers are written once, in `tools/site-headers.mjs`. The development server sends them from there, `.htaccess` carries the same values for production, and a contract test fails when they differ. Google's CSP Evaluator runs on the result.

## Consequences

- Every end-to-end test that checks for console errors also checks for a policy violation, because the test server sends the same policy.
- Editing the inline script changes the hash. The contract test prints the new value, which goes into `.htaccess`.
- The production build must leave that script byte for byte as it is. The markup minifier would rewrite the whitespace at its edges, so the script is written with none, and a build test compares the bytes.
