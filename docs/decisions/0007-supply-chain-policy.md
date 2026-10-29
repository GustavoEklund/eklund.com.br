# 0007. Supply chain policy for dependencies, workflows and releases

Status: accepted, 2026-10-18. Amended by [0011](0011-two-libraries-to-measure.md): the shipped site now carries two libraries, copied from npm and pinned.

## Context

The shipped site has no third-party code, so the supply chain risk is in what builds and publishes it: development dependencies, the install step, GitHub Actions, and the release.

## Decision

- **Install.** `pnpm` takes a version only when it is two days old (`minimumReleaseAge`), refuses a package that lost its provenance (`trustPolicy: no-downgrade`), refuses a git or tarball dependency of a dependency, and runs no install script that is not approved. The one install script of the project (`vnu-jar`, which would download a Java runtime) is refused, because the validator uses the Java on the machine.
- **Updates.** Dependabot opens pull requests after a cool-down of 7 days (14 for a major version), grouped by ecosystem, with Conventional Commit titles.
- **Audit.** `pnpm audit` fails on a high or critical advisory. An advisory with no fix is listed with the reason in `pnpm-workspace.yaml`, and an advisory with a fix is overridden or updated.
- **Workflows.** Every action is pinned to a commit. Every workflow and job starts with no permissions and asks for what it needs. zizmor and actionlint lint the workflows, CodeQL analyzes them, and Scorecard grades the whole.
- **Release.** A tag starts a workflow that builds the site, publishes the zip with a checksum, a software bill of materials and a signed provenance attestation, and nothing else can publish a release.
- **Tools with their own trees stay out of the lockfile.** Lighthouse CI adds nine advisories when it is a dependency of the project (`semver`, `tmp`, `extract-zip`, `basic-ftp`...), and the newest Lighthouse is refused by the trust policy because one of its dependencies lost its provenance. The older Lighthouse that is accepted still brings two high advisories through `extract-zip`. It runs in CI through a pinned action that carries its own copy, against this repository's own build.

## Consequences

- A security update that arrives younger than two days fails the install until it matures or is excepted by name ([`continuous-integration.md`](../continuous-integration.md#a-security-update-that-arrives-too-young)).
- The gates cost minutes of CI per pull request, which is acceptable for a repository this size.
- Dependabot's support for the pnpm 12 lockfile has to be watched: when it fails to update the lockfile, the fix is a manual update or another updater, and the policy above does not change.
