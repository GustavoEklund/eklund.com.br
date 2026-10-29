# Repository settings

What a repository file cannot say is set in GitHub's settings. This page lists those settings, with the command for each one that has a command, so the repository can be set up again, or checked, in a few minutes. The rulesets live in [`.github/rulesets/`](../.github/rulesets).

The commands use the real owner and name, so they run as they are. They need the [GitHub CLI](https://cli.github.com) signed in as the owner (`gh auth login`).

## Create the repository

```sh
gh repo create GustavoEklund/eklund.com.br --public --source . --remote origin \
  --description "Personal site of Gustavo Eklund: a hand-written WebGL globe, a status page that measures itself and a Pix load test in Web Workers. Plain HTML, CSS and JavaScript, tested to WCAG 2.2 AA."
```

## General

```sh
gh repo edit GustavoEklund/eklund.com.br \
  --homepage https://eklund.com.br \
  --add-topic portfolio --add-topic personal-website --add-topic webgl --add-topic vanilla-javascript \
  --add-topic web-workers --add-topic accessibility --add-topic wcag --add-topic i18n \
  --add-topic content-security-policy --add-topic vite --add-topic playwright --add-topic vitest \
  --enable-issues --enable-discussions --enable-wiki=false --enable-projects=false \
  --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false \
  --squash-merge-commit-message pr-title \
  --delete-branch-on-merge --enable-auto-merge --allow-update-branch
```

Only squash merges are on, and the commit message is the pull request title followed by its number, which the `Conventions` workflow has already checked, so `main` reads as a list of Conventional Commits.

Upload [`docs/images/social-preview.png`](images/social-preview.png) under _Settings, General, Social preview_ (there is no command for it). It is the picture that appears when the repository is shared.

## Security

```sh
# Private vulnerability reporting (SECURITY.md points at it)
gh api --method PUT repos/GustavoEklund/eklund.com.br/private-vulnerability-reporting

# Dependabot alerts, and security updates that open a pull request by themselves
gh api --method PUT repos/GustavoEklund/eklund.com.br/vulnerability-alerts
gh api --method PUT repos/GustavoEklund/eklund.com.br/automated-security-fixes

# Secret scanning, and push protection that stops a push with a secret in it
gh repo edit GustavoEklund/eklund.com.br --enable-secret-scanning --enable-secret-scanning-push-protection

# The workflow token is read-only unless a job asks for more, and Actions cannot approve pull requests
gh api --method PUT repos/GustavoEklund/eklund.com.br/actions/permissions/workflow \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
```

By hand, in _Settings, Actions, General_: _Fork pull request workflows from outside collaborators_ set to **Require approval for all outside collaborators**. In _Settings, General, Releases_: switch on **Enable release immutability**, so a published release and its tag can no longer be changed (the provenance attestation then always matches what people download).

## Rules for `main` and for release tags

```sh
gh api --method POST repos/GustavoEklund/eklund.com.br/rulesets --input .github/rulesets/main.json
gh api --method POST repos/GustavoEklund/eklund.com.br/rulesets --input .github/rulesets/release-tags.json
```

| Ruleset        | What it enforces                                                                                                                                                                                                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`         | No deleting the branch and no force push. Linear history. Every change comes through a pull request, squash merged, with conversations resolved. The checks below have to pass on the latest commit of the branch. Nobody can bypass it, the maintainer included, so a change to the rules is a change to the ruleset first |
| `release tags` | A tag that starts with `v` cannot be deleted, moved or overwritten                                                                                                                                                                                                                                                          |

Required checks (the names are those of the jobs): the jobs of `CI` that run on every pull request (the two end-to-end suites count four times each, one check for each part), the three of `Conventions`, the three of `Security scans` and the two of `CodeQL`. `Links`, `Dependency review` and `Scorecard` are not required because they do not run on every change.

The ruleset asks for no approving review, because there is a single maintainer and GitHub does not let an author approve their own pull request. When there is a second maintainer, raise `required_approving_review_count` to 1 and turn on `require_code_owner_review`: [`CODEOWNERS`](../.github/CODEOWNERS) is already written. Signed commits (`required_signatures`) are the next rule to add once the maintainer signs commits (`git config commit.gpgsign true` with an SSH or a GPG key).

## Deploy

The [`Deploy`](../.github/workflows/deploy.yml) workflow reads the FTP account from the secrets of the `production` environment. Only `main`, for a run by hand, and the release tags, when `Release` calls it, can deploy from that environment:

```sh
gh api --method PUT repos/GustavoEklund/eklund.com.br/environments/production \
  -F 'deployment_branch_policy[protected_branches]=false' -F 'deployment_branch_policy[custom_branch_policies]=true'
gh api --method POST repos/GustavoEklund/eklund.com.br/environments/production/deployment-branch-policies -f name=main -f type=branch
gh api --method POST repos/GustavoEklund/eklund.com.br/environments/production/deployment-branch-policies -f name='v*' -f type=tag

# Each command asks for the value, so the password stays out of the shell history
gh secret set FTP_HOST --env production --repo GustavoEklund/eklund.com.br
gh secret set FTP_USER --env production --repo GustavoEklund/eklund.com.br
gh secret set FTP_PASSWORD --env production --repo GustavoEklund/eklund.com.br
```

The values come from the FTP account made for the deploy, whose folder is `/public_html` ([`build-and-deploy.md`](build-and-deploy.md#set-it-up-once)). `FTP_HOST` is the IP address that hPanel shows as the FTP host under Files, FTP Accounts, without `ftp://`. It is a secret because it is the address of the server behind the CDN, and for the same reason the deploy does not use the `ftp.` name that the list of accounts offers to activate: that name would publish the address in the DNS. `FTP_USER` is the user name as that list shows it, with its prefix, like `u123456789.deploy`. The environment asks for no approval: a release goes online as soon as it is published.

### The collector

The [`Edge`](../.github/workflows/edge.yml) workflow reads the Cloudflare token from the secrets of the `cloudflare` environment, which only `main` can deploy from:

```sh
gh api --method PUT repos/GustavoEklund/eklund.com.br/environments/cloudflare \
  -F 'deployment_branch_policy[protected_branches]=false' -F 'deployment_branch_policy[custom_branch_policies]=true'
gh api --method POST repos/GustavoEklund/eklund.com.br/environments/cloudflare/deployment-branch-policies -f name=main -f type=branch

# Each command asks for the value
gh secret set CLOUDFLARE_API_TOKEN --env cloudflare --repo GustavoEklund/eklund.com.br
gh secret set CLOUDFLARE_ACCOUNT_ID --env cloudflare --repo GustavoEklund/eklund.com.br
```

The token is the one [`build-and-deploy.md`](build-and-deploy.md#set-the-collector-up-once) describes: it can deploy Workers and edit D1, R2 and KV in that account, and touches no zone. The account id is on the Workers page of the dashboard.

## Labels

The issue forms and Dependabot use these labels. GitHub creates `bug`, `enhancement` and `dependencies` by itself.

```sh
gh label create accessibility --color 0E8A16 --description "A barrier for a keyboard, a screen reader, zoom or reduced motion"
gh label create copy --color C5DEF5 --description "A wrong word, a translation or a typo"
gh label create javascript --color F1E05A --description "Updates to JavaScript dependencies"
gh label create github-actions --color 000000 --description "Updates to GitHub Actions"
gh label create skip-changelog --color EDEDED --description "No entry in CHANGELOG.md is needed for this change"
```

## Discussions

Turn on Discussions (the command above does) and, in the first discussion, pin a short welcome that points at [`SUPPORT.md`](../SUPPORT.md). Create the category _Q&A_ if GitHub did not.

## Check the result

_Insights, Community standards_ should show every item done: description, README, Code of Conduct, contributing guidelines, license, security policy, issue templates and pull request template. The repository should also show the _Security_ tab with private reporting on, and the `Scorecard` workflow, once it has run on `main`, publishes the score that the badge in the README shows.
