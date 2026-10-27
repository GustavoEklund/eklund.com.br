# 0008. Each release goes online by itself, over FTP with TLS, and stays online in a folder of its own

Status: accepted, 2026-10-27.

## Context

The site is hosted on the Single plan of Hostinger, which offers FTP and no SSH, SFTP or rsync: those start at the Premium plan. Its FTP server accepts explicit TLS, with a certificate issued to `*.hstgr.io`. A release was uploaded by hand, through the File Manager of hPanel, twice: to `public_html`, and to `public_html/gustavo/`, the folder of `gustavo.eklund.com.br`, which mirrors the site. Every release is already a zip with a checksum and a signed provenance attestation ([0007](0007-supply-chain-policy.md)).

## Decision

- Once the Release workflow publishes a release, it calls the Deploy workflow. Deploy checks the zip against its checksum and against the attestation that release.yml signed from the tag. Then it sends the zip over FTP with TLS ([`tools/deploy.mjs`](../../tools/deploy.mjs), with basic-ftp) to the mirror and then to the root. The server is reached by its address, so its certificate is checked against `hstgr.io`, the name it is issued to.
- The deploy changes each folder in a set order. Every file goes up under a temporary name and is renamed once all are up: the hashed files first, then the other files, then the pages and the `.htaccess` files.
- Files the release no longer has are deleted. The files of the release online before are kept for one more deploy, for pages that are still open or still in a browser cache.
- A folder that holds files but not the `.htaccess` of this site is never touched.
- Every release leaves a copy of itself online at `/X.Y.Z/`, built for that folder. The deploy of another version never touches those folders, and a pre-release goes only to its own.
- After the upload, every page online is compared byte for byte with the page of the release, and its Content-Security-Policy is checked too.
- The FTP account is a secret of a GitHub environment that only `main` and the release tags can deploy from. The account is used for nothing else, and its folder is `public_html`.

The alternatives:

- **The Premium plan, for SSH and rsync.** It costs about R$ 4 more a month, which is not needed while FTP with TLS does the job.
- **Hostinger's API.** It deploys an archive that replaces the whole site, which would erase the mirror and the version folders, and its token reaches the whole account: domains, DNS and billing.
- **The Git deploy of hPanel.** It needs the built files in a branch and an empty folder to start, and it leaves `.git` in `public_html`.
- **Plain FTP.** It sends the password over the network in clear text.
- **One build with relative addresses, for every folder.** The language switch moves the address from `/x/` to `/x/en/` without a reload, and Chromium resolves the address of a lazy image only when the image comes into view. The logos would then load from `/x/en/assets/`, so each version is built a second time with its folder in every address.

## Consequences

- A release is online a few minutes after its tag. Putting an older release back online means running Deploy with its tag.
- FTP gives no checksum of a file on the server, so only a hashed file with the same name and size is skipped. Every other file is sent again on each deploy, which is a few hundred kilobytes.
- The first deploy deletes what the uploads by hand left behind. A dry run lists all of it first.
- The zip carries the copy of the version in its folder, so it doubles: about 830 kB instead of 420 kB.
