# Releasing

A version is a tag on `main`, and the tag starts the [`Release`](../.github/workflows/release.yml) workflow. The project follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) and keeps its history in [`CHANGELOG.md`](../CHANGELOG.md) in the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

## What a version number says

A website has no API in the usual sense. What others depend on is the addresses of its pages, the files a host has to serve, and the commands a contributor runs. Read the three numbers like this:

| Number              | When it goes up                                                        | Examples                                                                                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Major** (`2.0.0`) | Something that others rely on breaks, or the site becomes another site | A public address stops working or moves (`/`, `/en/`, a section anchor), `dist/` needs a server setting that the old one did not, a supported browser is dropped, a redesign that replaces the look and the structure, a change of license |
| **Minor** (`1.1.0`) | Something is added, or the content grows, and nothing breaks           | A new section or feature, a new language, a new page, a new gate or document in the repository, new work in the experience section                                                                                                         |
| **Patch** (`1.0.1`) | Something is fixed or kept up to date                                  | A bug, a wrong word, a layout that overflowed, a dependency update, a faster build with the same output                                                                                                                                    |

Pre-releases use the SemVer form (`1.1.0-rc.1`). The workflow marks them as pre-releases on GitHub.

## Keeping the changelog

Every pull request that visitors or readers of the repository would notice adds a line under `## [Unreleased]`, in one of `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed` and `Security`. Write for a person: what changed and why it matters, not the name of a commit. The `Conventions` workflow asks for the line when the pull request is a `feat`, a `fix`, a `perf`, a `revert` or a breaking change.

## Making a release

1. **Check that `main` is ready.** CI is green on the commit you will tag, and the `[Unreleased]` entries say what changed.
2. **Pick the number** from the table above.
3. **Prepare the files.** On a branch, run:

   ```sh
   pnpm run changelog release 1.1.0
   ```

   It moves `[Unreleased]` into `## [1.1.0] - <today>`, fixes the comparison links at the bottom and sets `version` in `package.json`. Read the diff and polish the wording. Add a second argument (`2026-12-01`) to choose the date.

4. **Commit and merge** as `chore(release): 1.1.0`, through a pull request.
5. **Tag the merge commit** and push the tag:

   ```sh
   git switch main && git pull
   git tag -s v1.1.0 -m "v1.1.0"
   git push origin v1.1.0
   ```

   `-s` signs the tag with your key; use `-a` if you have no signing key yet.

6. **Watch the workflow.** It checks that the tag, `package.json` and `CHANGELOG.md` name the same version and that CI passed on that commit, builds the site, runs the build tests, and publishes the release with:
   - `eklund.com.br-v1.1.0.zip`, the contents of `dist/`, with the copy of the version for its own folder in `1.1.0/`;
   - `eklund.com.br-v1.1.0.zip.sha256`, its checksum;
   - `eklund.com.br-v1.1.0.sbom.cdx.json`, a CycloneDX software bill of materials of the toolchain that built it;
   - a signed provenance attestation of the zip (`gh attestation verify`), and the notes from the changelog.
7. **Watch it go online.** The last job of the workflow, `Put the release online`, runs the [`Deploy`](../.github/workflows/deploy.yml) workflow. It checks the zip, sends it to the hosting and to the mirror, and compares every page online with the page of the release ([`build-and-deploy.md`](build-and-deploy.md#deploy-to-hostinger)).
8. **Look at the site**: `https://eklund.com.br/`, `/en/` and `/1.1.0/`, the status page, and the response headers.

The first release is `1.0.0`: write its entries under `[Unreleased]`, and step 3 turns them into the version.

## A fix for a release that is already out

Branch from `main` (the site always runs the newest release, so there are no maintenance branches), fix it with a test, add a line under `Fixed` and release a patch version.

## A release that must not be used

If a release is broken or unsafe, publish the fix as the next patch version, mark the bad one in the changelog by adding `[YANKED]` to its heading (`## [1.1.0] - 2026-12-01 [YANKED]`), and edit its GitHub release to say so and point at the fix. To go back right now, run the Deploy workflow with the tag of the previous release (`gh workflow run deploy.yml -f tag=v1.0.0 -f dry-run=false`). The copy of the bad version stays in its folder, so delete that folder by hand if it must not be reached at all.

## What the repository enforces

- `pnpm run changelog check` (in CI) keeps the format and compares `package.json` with the newest released version.
- A tag that is not `vMAJOR.MINOR.PATCH` (or a pre-release of it) does not start the workflow.
- The workflow refuses a tag whose commit has no successful CI run, and one that disagrees with the changelog or with `package.json`.
- With _immutable releases_ switched on ([`repository-settings.md`](repository-settings.md)), a published release and its tag cannot be changed or deleted, so the attestation always matches what people download.
