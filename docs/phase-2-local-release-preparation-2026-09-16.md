# Phase 2 local release preparation — 16 September 2026

## Decision status

Phase 2 local preparation is complete. Deployment remains on hold.

The intended update was never specifically described. Per the owner's instruction, this work treated the entire current local workspace as the proposed release baseline without guessing a narrower feature scope. The owner must explicitly accept that scope, or identify a smaller scope, before Phase 3.

No cPanel setting, production file, database row, migration, backup, Passenger process, mailbox, DNS record or SSL setting was changed.

## Source boundary

- Workspace: `C:\Users\abinash\Desktop\Hatskala`
- Git HEAD: `ca433018a7b62689817904a18c069230916c0a1b`
- Working tree: 442 paths (`143` modified, `1` deleted, `298` untracked)
- This is not a clean or review-sized source boundary. The release is a snapshot of accumulated local work, not a small patch from a tagged commit.
- Largest path groups: `app` 139, `components` 76, `lib` 71, `docs` 65, `tests` 46 and `drizzle` 24.

The proposed baseline includes, at minimum:

1. Hosted authentication, email-code login, Google OAuth, password reset and role-aware routing.
2. Customer account, address, wishlist, wallet, referral, privacy, order, return, complaint and cancellation work.
3. Seller application, seller workspace, catalogue, product media, shipping, earnings, payout and review work.
4. Staff permissions, governance, notifications, business email, delivery, rider, gift-card, exception and audit work.
5. Distinct-store delivery pricing, immutable checkout/order snapshots and partial-cancellation accounting.
6. Database-driven homepage, truthful product collections, Buy now and Super Admin homepage controls.
7. Public information, legal, policy, sitemap and SEO routes, including `/legal` and `/seller-agreement`.
8. Current security headers, request validation, bounded uploads and private-media authorization.

This scope description is an inventory, not an inference that every item should be deployed together.

## Production comparison carried forward from Phase 1

- Production already has 93 tables, 38 triggers and additive migrations 1–21.
- `homepage_product_controls` is installed and complete in production.
- The active production files strongly match the 14 September cumulative homepage-controls candidate even though the public health release label is stale.
- Production returned 404 for `/legal` and `/seller-agreement`; the local build contains both routes.
- Production `policy_versions` was empty at inventory time.
- No additive migration is currently pending for this candidate.

## Policy boundary

The release contains these identifiers:

- Customer: `customer-legal-v3-registration-pending-2026-09-16`
- Seller: `seller-agreement-v3-registration-pending-2026-09-16`

Both are explicitly registration-pending and therefore remain a deployment blocker. A material policy release must use approved, final identifiers and must preserve all prior acceptance snapshots. Do not rewrite historic order or Seller acceptance evidence.

## Migration boundary

- Required tables: 93
- Required triggers: 38
- Manifest entries: 22 total: one empty-database-only base schema plus 21 ordered additive migrations
- Production-installed additive migrations: 1–21
- Missing: none
- Partially installed: none found in Phase 1
- To apply during this deployment: none
- `mariadb-schema.sql`: evidence/empty-database use only; never import into production
- `mariadb-reset-empty-import.sql`: excluded from the release
- Development seeds: excluded from the release

Current regenerated base-schema SHA-256:

`5e212486e5db1b581ed55ad292146f75bda2bb4ae01f3d4d9827291533c92a00`

Current release-manifest SHA-256:

`44db8a593afea78dfe3a9cf4349c1455126a95fbfb9070b64f8a2034d5c26dd9`

## Build hardening performed in Phase 2

1. The release-manifest generator no longer hard-codes the stale 13 September release name. It accepts and validates `HASTABAZAAR_RELEASE_ID`; an unspecified local build is labeled `local-unversioned-candidate`.
2. The Babal build replaces local-test access and seed modules with inert hosted-build stubs. The final hosted bundle contains zero exact development identity matches, and `/local-testing` returns 404.
3. `dist` was removed and regenerated before the final Babal build so stale compiled chunks could not survive into the archive.

Local development identities remain available only in the local source path and are not present in the hosted release bundle.

## Verification results

- Full automated suite: passed, 241/241, no failures or skips.
- Non-incremental TypeScript: passed.
- Release-scoped lint (`app`, `components`, `lib`, `tests`, middleware and build configs): passed.
- Full repository lint: failed on 11 previously documented legacy verifier/preflight findings. These are outside the release-scoped application paths. On 16 September 2026, the owner accepted leaving them unchanged as non-blocking technical debt because they do not affect the release runtime.
- Ordinary production build: passed.
- Clean Babal standalone build: passed.
- Manifest generation: 93 tables, 38 triggers, 22 total schema/migration entries.
- Archive reopen and per-file SHA-256 comparison: passed, zero mismatches.
- Standalone localhost smoke:
  - `/health/live`: HTTP 200, `status=ok`
  - `/health`: HTTP 503 with the correct release ID because no MariaDB configuration was supplied to the isolated local smoke process
  - `/local-testing`: HTTP 404

The local smoke process was stopped after verification.

## Release artifact

- Release: `hastabazaar-release-2026-09-16-212204`
- ZIP: `outputs/hastabazaar-release-2026-09-16-212204.zip`
- Size: 24,835,448 bytes
- SHA-256: `f9ca76fc8999d69cf4ab0dd191921f25141e7fff0dec6807184b72137d89e15b`
- Verified files: 3,448
- Per-file manifest: `outputs/hastabazaar-release-2026-09-16-212204.manifest.json`
- Hash record: `outputs/hastabazaar-release-2026-09-16-212204.sha256`
- Verification record: `outputs/hastabazaar-release-2026-09-16-212204.verification.json`

Required archive-root items were verified: `app.cjs`, `server.js`, `package.json`, `dist`, production `node_modules` and `public`.

The archive excludes `.env` and secret files, private media, customer/Seller uploads, development identities, test databases, logs, caches, old release ZIPs, the reset schema and development seeds. The package includes the ordered SQL evidence and release manifest, but production requires no migration for this candidate.

An earlier Phase 2 package was rejected because it contained compiled development identities. A later candidate was superseded after dead experimental aliases were removed. All eight generated artifacts for those two non-final candidates were removed after the final candidate passed; they can be regenerated from the preserved source if forensic comparison is ever required.

## Remaining blockers and risks

1. The owner has not yet described or accepted an exact intended change set.
2. The two material policy identifiers are still registration-pending, and production has no registered policy rows.
3. The workspace remains highly dirty and lacks a clean tagged source commit corresponding to the ZIP.
4. Full-repository lint retains 11 legacy verifier/preflight errors. The owner explicitly accepted this as non-blocking technical debt for this release.
5. Phase 1 exposed production secret values in the cPanel UI to the automation trace. Values were not copied into this report or release, but controlled rotation remains necessary before or during an authorized maintenance plan.
6. No authenticated browser acceptance, real SMTP delivery, production database connection or production resource test was performed in Phase 2.
7. Phase 3 backups do not yet exist for the current production state.

## Required next authorization

Before Phase 3:

1. Approve the entire accumulated baseline above or provide a narrower release scope.
2. Replace the registration-pending customer and Seller policy identifiers with approved final versions and define how they will be registered without rewriting history.
3. Authorize Phase 3 separately: maintenance window, write prevention, fresh verified backups, off-server downloads and controlled secret rotation planning.

Do not upload, migrate, restart Passenger or deploy this candidate without that separate authorization.
