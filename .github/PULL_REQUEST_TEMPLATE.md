<!-- The title follows Conventional Commits: type(scope): subject. It becomes the message of the squash merge. -->

## What and why

<!-- What this changes and the reason. Link the issue: "Closes #123". -->

## How I checked it

<!-- A command, a screenshot, a measurement before and after. -->

## Checklist

- [ ] `pnpm run verify` passes
- [ ] Tests cover the change (a bug fix has a test that fails without it)
- [ ] Text for visitors is in both dictionaries, and `node tools/i18n-check.mjs --fix-html` was run
- [ ] `pnpm run test:e2e` and `pnpm run a11y` pass, if the page changed
- [ ] `CHANGELOG.md` has a line under `[Unreleased]`, if a visitor or a reader would notice
- [ ] Documentation is updated, if behavior or commands changed
- [ ] I read and can explain every line, including the ones a tool wrote
