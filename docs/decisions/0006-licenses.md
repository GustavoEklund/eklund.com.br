# 0006. MIT for the code, CC BY-NC-ND 4.0 for the words and images

Status: accepted, 2026-10-18.

## Context

The repository mixes code, text about one person, images, fonts, icons and logos that belong to other companies. The code is meant to be read and reused. The text is a person's career, which should not be republished as someone else's.

## Decision

- Code and documentation: [MIT](../../LICENSE). It is the license of most open source websites of this kind and the one a recruiter or a contributor already understands.
- The words and images that are mine: CC BY-NC-ND 4.0. They can be shared with credit, not sold and not changed.
- Everything else keeps its own terms: fonts under the SIL Open Font License, technology icons from Simple Icons under CC0, company logos not licensed. [`NOTICE.md`](../../NOTICE.md) says which is which.
- [`LICENSE`](../../LICENSE) holds the MIT text and nothing else, so GitHub names the license of the repository correctly.

## Alternatives considered

- _MIT for everything_: simpler, but lets anyone reuse the personal text and profile commercially.
- _CC BY-NC-SA for the words_ (the choice of antfu.me): allows adapted versions under the same terms, which fits a blog better than a personal profile.
- _Apache-2.0 for the code_: adds a patent grant that a personal site does not need.
- _No license_, as several popular personal sites do: legally this means all rights reserved, and nobody could reuse even the code.

## Consequences

- Someone who wants to build a site from this code can do it, and has to write their own text.
- The split has to be kept up to date when a file of another kind is added (`NOTICE.md` has the table).
