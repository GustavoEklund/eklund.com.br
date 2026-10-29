# 0001. No framework, no runtime dependency, and every module is a class

Status: accepted, 2026-10-16. Amended by [0011](0011-two-libraries-to-measure.md), which lets two libraries measure the site.

## Context

The site is a portfolio, and the code is part of what it shows. A framework would hide the parts worth showing (a WebGL pipeline, a render loop, a Performance API reader, a Web Worker protocol), and every runtime dependency is code that ships to a visitor and has to be kept safe.

## Decision

- The site is HTML, CSS and JavaScript with no framework and no library at run time. Tools that develop, test and build it are development dependencies, and none of them ships.
- Folders are named after what the site does (`globe`, `status-page`, `load-test`), never after a technique (`utils`, `components`). A feature imports only `shared/` and `i18n/`, and only `main.js` composes features.
- Every module is a class. A pure helper is a class with static methods. Dependencies come through the constructor and side effects start in `mount()`, `install()` or `start()`.
- Code, comments and identifiers are in English, and everything a visitor reads lives in the dictionaries.

## Consequences

- Tests enforce the structure: `tests/architecture` and dependency-cruiser fail on a helper outside a class, a feature that imports another feature, a Portuguese sentence in code or a file named with tracker vocabulary.
- There is more ceremony than a function would need, and the classes of `shared/` are the price of that rule. In return, every collaborator can be replaced in a test with a plain object, which is what the component tests do.
- There is no virtual DOM and no state library, so each feature writes the DOM itself, and only when a value changes.
