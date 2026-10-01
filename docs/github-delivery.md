# GitHub Delivery

## Daily Updates

Repository: https://github.com/BikashCoder31/hastabazaar (private).

1. Make changes on a short branch, commit and push it; open a pull request to `main`.
2. GitHub runs lint, TypeScript and the test suite in four isolated Linux jobs. Native MariaDB opt-in fixtures and Windows-only checks are not represented as Linux coverage.
3. After integration into `main`, GitHub builds a Node 22.23.2 Linux x64 package, inventories every file, verifies its extracted contents, tests native Sharp and starts the extracted app without database/provider credentials.
4. A successful package goes to **staging only** using the restricted `BABAL_STAGING_SSH_KEY` secret. Review https://staging.hastabazaar.com over HTTPS.
5. Production promotion remains a separately authorized operation. No production deployment key or production database password is stored in GitHub.

The workflow is `Verify and Package`; artifacts expire after 14 days. A manual run builds the selected branch; only `main` can deploy staging. Each artifact records its exact source commit, release ID, archive checksum and file inventory. Failed checks do not deploy.

Active `main` runs are not cancelled by a newer push. Staging retries use the package job's actual release ID, and an already-uploaded release is reused only after exact file verification. Never overwrite an existing release or rebuild an artifact during deployment.

## Source Baseline

The user selected the newer audit candidate `5e3f6a2`, rather than the older initial GitHub snapshot or the live October 1 source. Its application code is not thereby approved for production. Existing Git history is retained without force-pushing. Original working folders and their unpublished changes are not replaced by this setup; the delivery checkout is a separate managed worktree.

## Staging Isolation

- Origin: `https://staging.hastabazaar.com`; HTTP redirects to HTTPS; anonymous HTTPS requires Basic authentication.
- cPanel app: `hastabazaar-staging-app`; separate document root outside production `public_html`.
- Database: `hastabaz_staging`, with a user scoped to that database only.
- Media: `/home2/hastabaz/hastabazaar-staging-private-media`; no production media imported.
- Production-like runtime, one database connection, bounded Node heap, no SMTP, Google, SMS or payment credentials. No simulation guard has been relaxed.
- The initial staging schema was built from 48 verified files into a newly empty database. Users, sellers, products and orders were all zero. No production dump was imported. Login-email delivery and authenticated business journeys require a later staging-only mail/test-account setup; existing local QA remains available.
- Basic login details are kept in the local ignored `outputs/hosting-setup/staging-access.json`, not GitHub or chat.

Both apps share one cPanel user and a 1 GB hosting resource allowance. Separate database/media bindings prevent accidental mixing, but this is **not a separate tenant/security boundary**: application code still executes with that account's permissions. Limit repository write access and use a separate hosting account for stronger isolation. Do not enable untrusted code or pull-request deployment.

## Deployment Guarantees

The host gateway accepts only `deploy-staging-v1`; the key cannot request a shell, SFTP, forwarding or another target. A bounded, checksummed archive is pre-inspected with the maintained `tar` parser. Traversal, links, duplicate/unexpected files, credentials, private media, backups and non-approved SQL paths are rejected before activation. Extracted file hashes and the release identity must match.

The gateway checks actual Passenger bindings against the approved staging environment. It switches only the staging `current` link, restarts only staging, and verifies HTTPS readiness and release identity. A failed verification or cooperative timeout restores the preceding application code. It never restores a database, clears media, runs migrations, or deletes business data. Forced OS termination or host failure still requires operator inspection; do not blindly remove a stale deployment lock.

Only an invocation's own temporary upload/extraction directory is cleaned up. Promoted release directories and historical backups are retained. Check disk and RAM usage as staging content grows. Stop staging from cPanel when it is not needed if memory becomes constrained.

Host tools are under `/home2/hastabaz/.hastabazaar-deployment/`; runtime settings and access credentials stay there with private permissions. Gateway changes need separate operator installation, not an automatic replacement by application deployments. The gateway can be rebuilt locally with esbuild from `scripts/deployment/staging-gateway.mjs`, bundling `tar`; never build or install production application dependencies on the small host.

## Production Releases

There is deliberately no automatic production job. Before a separately approved promotion:

1. Review the exact staging artifact and feature acceptance, including any newer audit work that is not yet publicly accepted.
2. Take and verify a fresh, appropriately consistent database/application/media recovery set. The historical recovery copy below is not current enough to authorize a future release.
3. Compare required schema against the live database. Review additive migrations separately; never use the empty-database schema or reset scripts on production.
4. Switch verified application code during an agreed release window and verify health, auth, published products, media and core business journeys.
5. Roll back code only if necessary; preserve newer transactions and business data. Schema rollback is a separate recovery decision.

## Backups And Cleanup

Only the newest existing separate recovery set was copied during setup:
`deployment-backups/pre-migration-20260930T105316Z-0f199f4a/`.

Its application, database and private-media archives passed server gzip checks and their local SHA-256 checks match. The local copy is under ignored `outputs/backups/latest-20260930/`. It predates later production writes and is not described as a current snapshot. Older original backups were neither copied nor deleted. Future verified recovery sets can be added separately; no pruning job is enabled.

All production test-data cleanup is deferred. Before the first public release, prepare an explicit dry-run inventory and reviewed relationship-aware deletion plan. Preserve sellers, published products, their media and dependencies. Do not truncate tables, run reset imports or restore an old database to achieve cleanup.

## Setup Evidence

- First Linux CI run: https://github.com/BikashCoder31/hastabazaar/actions/runs/36882980032 (all checks and package passed).
- Local source regression: 2,263 passed, 14 opt-in skips, zero failures; new delivery tests are verified separately.
- First restricted-key staging deployment: `hastabazaar-release-ci-36882980032-1`, source `bd78f22c30bc90f2dad32c73e32c47d3f641b9e7`, HTTPS readiness passed; deployment migrations: zero.
- Live production identity at the same check: `hastabazaar-release-2026-10-01-112000`, healthy and unchanged.
- A diagnostic artifact with a deliberately mismatched compiled identity was rejected after switching; the previous healthy staging release was restored. No database migration or business-data cleanup was performed by that test.
