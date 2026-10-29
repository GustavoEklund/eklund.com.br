# Decisions

The choices that shaped the project, each with the reason and what it costs. They are short on purpose. A decision that is replaced is not deleted: its status changes and a new record links to it.

| Record                                                     | Decision                                                                                        | Status                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [0001](0001-no-framework-everything-is-a-class.md)         | No framework, no runtime dependency, and every module is a class                                | Accepted, amended by [0011](0011-two-libraries-to-measure.md) |
| [0002](0002-one-page-per-language.md)                      | One page per language, with the language links as real links                                    | Accepted                                                      |
| [0003](0003-content-security-policy-with-a-script-hash.md) | A strict Content-Security-Policy, with the one inline script allowed by its hash                | Accepted                                                      |
| [0004](0004-production-build-with-vite-plus.md)            | The site runs from source in development and ships as a Vite+ build                             | Accepted                                                      |
| [0005](0005-spelling-and-commit-gates.md)                  | Spelling and commit gates, and no grammar checker                                               | Accepted                                                      |
| [0006](0006-licenses.md)                                   | MIT for the code, CC BY-NC-ND 4.0 for the words and images                                      | Accepted                                                      |
| [0007](0007-supply-chain-policy.md)                        | Supply chain policy for dependencies, workflows and releases                                    | Accepted, amended by [0011](0011-two-libraries-to-measure.md) |
| [0008](0008-deploy-each-release-over-ftps.md)              | Each release goes online by itself, over FTP with TLS, and stays in a folder                    | Accepted                                                      |
| [0009](0009-measurement-on-a-cloudflare-worker.md)         | Measurement goes to a Cloudflare Worker of my own, outside the site's host                      | Accepted                                                      |
| [0010](0010-privacy-by-the-anpd-guidance.md)               | Anonymous measurement by legitimate interest, and recording only with consent, as the ANPD asks | Accepted                                                      |
| [0011](0011-two-libraries-to-measure.md)                   | Two libraries run in the browser, both to measure the site                                      | Accepted                                                      |
