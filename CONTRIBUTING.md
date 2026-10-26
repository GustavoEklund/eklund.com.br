# Contributing

Thank you for looking at this project. It is my personal website, built in the open so that anyone can read how it is made, and a good bug report, a fix or a better translation is welcome.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Security problems go through [`SECURITY.md`](SECURITY.md), never through a public issue.

## What helps most

- A bug: something broken in a browser, a layout that shifts, a text that overflows, a wrong word.
- Accessibility: a keyboard path that fails, a contrast or a label problem. The standard is WCAG 2.2 AA ([`docs/accessibility.md`](docs/accessibility.md)).
- Performance and the build, with a measurement before and after.
- A better English or Portuguese sentence, or a typo.
- Tests, tooling and documentation.

What I will most likely decline: a change to the facts about my career, a feature that needs a server, a new dependency for something a few lines can do, and a rewrite of the structure without an issue that we agreed on first. This is a personal site and not a framework, so it does not grow in every direction.

## Before you write code

Open an issue for anything bigger than a typo, and say what you want to change and why. It saves you a pull request I would have to decline. Small fixes can go straight to a pull request.

## Set up

You need Node 24 and pnpm 12, Java 17 or newer for the HTML validator, and a clone of the repository. `mise install` sets up Node and pnpm from [`mise.toml`](mise.toml), which takes the pnpm version from `packageManager` in `package.json`. Without mise, `corepack enable` gives you the same pnpm.

```sh
mise install                             # Node 24, and pnpm 12 as package.json pins it
pnpm install                             # also installs the git hooks
pnpm exec playwright install chromium    # once, for the browser tests
pnpm dev                                 # http://127.0.0.1:8734 serves source/
```

The site in `source/` runs as it is, with nothing to build while you work. `pnpm run build` makes the production version in `dist/`, and `pnpm run preview` serves it.

## How the code is organized

[`docs/architecture.md`](docs/architecture.md) explains the layout and the reasons for it. The rules a pull request has to follow, in short:

- **Every module is a class.** Pure helpers are classes with static methods. Dependencies come through the constructor and side effects start in `mount()`, `install()` or `start()`.
- **Folders are named after what the site does** (`globe`, `status-page`, `load-test`), never after a technique. A feature imports only `shared/` and `i18n/`, and only `main.js` composes features.
- **Code, comments and identifiers are in English.** Text that a visitor reads lives in the two dictionaries in `source/js/i18n/locales`, never in code. After you edit a dictionary or `index.html`, run `node tools/i18n-check.mjs --fix-html`, which also writes the English page ([how](docs/internationalization.md)).
- **Copy is plain**: first person, concrete facts, no slogans, no em dashes.
- **Tests are exact.** `toBe` or `toStrictEqual` with the whole value; the lint rules reject the loose matchers ([`docs/testing.md`](docs/testing.md)).
- **No file name with tracker vocabulary** (`metrics`, `analytics`, `stats`, `performance`, `beacon`...), because ad blockers match file names.

## Make the change

1. Branch from `main`: `git switch -c fix/globe-keyboard-spin`.
2. Write the test first or with the change. A bug fix comes with a test that fails without it.
3. Run `pnpm run verify` (format, lint, i18n, spelling, every Vitest project, BDD). The pre-push hook runs it for you.
4. Run what your change touches: `pnpm run test:e2e` for anything on the page, `pnpm run a11y` for markup or styles, `pnpm run measure` when text or layout changes the height of a section.
5. Add a line under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md) if a visitor or a reader of the repository would notice the change.

## Commit messages

Commits follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```text
type(scope): subject in the imperative, lower case, no full stop

Body that explains why, wrapped at 100 columns. Optional.

BREAKING CHANGE: what breaks and what to do. Optional.
Closes #12
```

- **Types:** `feat`, `fix`, `perf`, `refactor`, `docs`, `style`, `test`, `build`, `ci`, `chore`, `revert`.
- **Scopes:** a feature folder of `source/js` (`globe`, `status-page`, `i18n`, ...) or one of `build`, `ci`, `deps`, `docs`, `hooks`, `release`, `security`, `seo`, `site`, `tests`, `tools`. The list is in [`commitlint.config.mjs`](commitlint.config.mjs), and a test keeps it equal to the folders.
- **Header:** at most 72 characters. Write `!` after the scope for a breaking change (`feat(hero)!: drop the intro`).
- **Spelling:** the message is spell-checked in English like the rest of the repository.

Three checks enforce this, so that no one has to remember it: the `commit-msg` hook checks each message when you commit, the `pre-push` hook checks every commit you are about to send (it catches `--no-verify`, a rebase and an amended commit), and CI checks every commit of the pull request and its title. They run the same code, [`tools/commit-gate.mjs`](tools/commit-gate.mjs).

## Spelling

`pnpm run proofread` runs [cspell](https://cspell.org) over every text file with the English and the Brazilian Portuguese dictionaries. A word that is real vocabulary of the project (a Banco Central term, a name, a tool) goes into [`.cspell/project-words.txt`](.cspell/project-words.txt), one word per line. A misspelling gets fixed.

## Pull requests

- Keep it small and about one thing. Fill in the template.
- The **title** follows the commit convention, because it becomes the message of the squash merge.
- CI has to be green. It runs the checks above, the unit to end-to-end tests, accessibility and W3C validation, the production build and its tests, and the security scans.
- Say how you checked it: a command, a screenshot, a measurement.
- Be ready to change it. I review on my own time, and I will say why when I decline something.

## AI-assisted contributions

Use the tools you like. You are responsible for every line you submit: read it, run it and be able to explain it. Write the description of the pull request yourself, say if a tool wrote a large part of the change, and do not open pull requests you have not tested. A change that nobody can explain gets closed.

## Licenses of what you contribute

Code and documentation you contribute are under the [MIT license](LICENSE). Corrections to my text are accepted under the license of that text ([`NOTICE.md`](NOTICE.md)). There is no contributor agreement to sign.

## For the maintainer

[`docs/releasing.md`](docs/releasing.md) describes how a version is made, and [`docs/repository-settings.md`](docs/repository-settings.md) lists the settings the repository relies on.
