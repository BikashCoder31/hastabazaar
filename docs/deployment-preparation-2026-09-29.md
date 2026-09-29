# HastaBazaar Babal.Host release preparation — 29 September 2026

**Release gate: HOLD — not approved for upload or production migration.**

Target confirmed by owner: existing Babal.Host site `https://hastabazaar.com`.
This document supersedes older deployment instructions for this candidate only. Existing base/reset import instructions are not valid for upgrading this marketplace.

## Candidate and preservation

Application base: `80424cf` on `codex/hastabazaar-v1-2-1-staging`, including watermark commit `8944398` and multipart fix `082aff3`. The candidate also includes the 38 enumerated responsive/header files already present in the worktree. Those files remain uncommitted and unchanged; their hashes and the exact source snapshot identify the candidate instead of pretending HEAD alone describes it.

Preparation evidence directory: `C:/Users/abinash/Desktop/Hatskala/release-prep-20260929`. Source-before hashes and the starting binary patch were captured before preparation. No local customer database, session cookies, environment secrets, private uploads or production data are included in the source handoff. The handoff is source for review/rebuild, not a ZIP to extract into the running application.

## Launch blockers

| Gate | Evidence / required resolution |
| --- | --- |
| Phone OTP delivery | Owner confirms no SMS provider selected. Native Node bindings have no configured SMS adapter. Required phone verification fails closed, so new customer checkout would be blocked. Select a provider supporting Nepal, implement and review the adapter, configure credentials privately, and verify real delivery in an approved non-production environment. Do not mark numbers verified or disable the requirement as a workaround. |
| MariaDB application compatibility | Latest actual MariaDB report: 13 PASS, 4 BLOCKED, 1 INCONCLUSIVE, overall exit 1. Known gaps: generated bootstrap references rider_profiles before availability; authentic gift-card FK collision; form-draft json_each SQL and saved-answer MATERIALIZED SQL not translated by the native adapter. Exact promo source-trigger concurrency proof also remains inconclusive. Fix and test the real configured admin/checkout/aftercare paths against a disposable MariaDB 10.11 database. Do not use fixture substitutions as deployment proof. |
| Additive release inventory | Seven current companions were omitted by the release-manifest generator. Preparation corrects the inventory with a failing regression then passing verification; corrected inventory alone does not repair MariaDB runtime gaps. |
| Linux image processing | Current installed native image modules are Windows-oriented. Verify the final artifact on the host-compatible Linux architecture/libc and Node 22 using a real Sharp decode, SVG composite and WebP output. Never upload a Windows dependency tree on the assumption that compilation proves Linux support. |
| Existing live schema and release | Not inspected during local preparation. A read-only inventory of the installed release, MariaDB version, columns, indexes, constraints, triggers and prior migration records is required to calculate the exact missing additive upgrade sequence. |
| Backup and restore | Fresh application/database/private-media backups and a tested restore are required before maintenance. Their existence has not been assumed or reported as verified. |

The responsive-scope audit also found stale image `sizes` hints after fluid gutter/wide-slider layout changes. This is an image quality/bandwidth follow-up, not a demonstrated checkout or permission failure. It is not silently certified by the older visual ledger. Latest carousel/header behavior needs fresh target-runtime/browser acceptance before final release sign-off; current source is preserved rather than changed during preparation.

The two existing full-lint errors at `scripts/staging/local-d1.mjs:58` remain outside the completed feature work. Targeted source lint, typechecking and the prior local application build passed. A fresh full suite and Babal-runtime smoke pass are required for the final release after blocker fixes; the historical 1,953-test checkpoint is not a certification of this current native deployment candidate.

## Configuration handoff (names only; keep values private)

- Passenger startup: `app.cjs`; production application mode; Node 22, minimum 22.13. Confirm the actual host version and supported runtime before packaging.
- `APP_ORIGIN=https://hastabazaar.com`, `HASTABAZAAR_RUNTIME_ENV=production`. The historical `AUTH_PROVIDER=local` setting is not consumed by current Node bindings; do not treat it as an authentication readiness check.
- Preserve existing `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`; use a modest reviewed `DB_POOL_SIZE` for the host allocation. Do not place secrets in source, ZIPs or chat.
- Preserve the existing absolute `MEDIA_ROOT` outside the replaceable application directory. Ensure the application can read originals and write derivative files without making originals public.
- Preserve configured `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`; the current mail adapter uses implicit TLS. Confirm delivery in an approved staging test, not by sending unsolicited messages.
- Preserve `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and the existing callback URL when OAuth is enabled.
- Preserve `ORDER_EMAIL_JOB_SECRET` and existing job scheduling; inventory other scheduled notification/feedback jobs before switching versions.
- `CONTACT_DAILY_SEND_LIMIT` defaults to 100 across both email and SMS per rolling 24 hours. Owner must choose an adequate budget; failed configured sends consume it. There are deliberately no invented SMS environment variable names: they depend on the reviewed provider adapter.
- Do not enable `HASTABAZAAR_LOCAL_RIDER_DECODER`, local role cookies/role switching, capture delivery, simulated payouts, development fixtures, or test runtime on the production host. Existing staff identities remain; do not bootstrap another owner as part of release installation.
- Daily rewards remain disabled unless the owner separately enables a funded, finite campaign through the Super Admin controls.

## Build and package procedure after blockers pass

1. Freeze a reviewed source commit or record the complete source overlay and every hash. Include the current responsive/header files; do not silently ship HEAD without them.
2. Use an isolated Linux build environment matching the host architecture/libc with the committed lockfile and Node version. Install dependencies in that build environment, never in the user's active local preview. Run typecheck, full tests, lint, native build, and final Sharp smoke test.
3. Set `HASTABAZAAR_RELEASE_ID` to a unique versioned `hastabazaar-release-...` identifier and run `node scripts/build-babal.mjs`. Keep local-staging flags and production credentials out of the build environment.
4. Stage the generated manifest and listed SQL files into `dist/standalone` using the copy phase of the packaging procedure (the build script itself copies only `app.cjs`). Inspect `dist/standalone`: entrypoints, client manifest, Node dependencies, public assets, generated release manifest and all required additive SQL. Verify local role switching and contact-code capture are unavailable in production mode. Do not infer this from route absence alone.
5. Produce a platform-appropriate runtime ZIP, unpack it into a separate directory, compare every filename/byte count/SHA256, and smoke-test the unpacked artifact against disposable MariaDB and a private media directory. Existing PowerShell packaging verifies ZIP parity but does not prove native architecture or runtime readiness.
6. Exclude `.env*`, credentials, `.git`, `.staging`, SQLite files, sessions, runtime media, development seeds and reset SQL. Base schema is empty-database-only and must never be selected as a live additive upgrade. Source handoff files are not runtime deployment contents.
7. Publish an artifact manifest with source commit/overlay hashes, release ID, runtime versions, migration hashes, ZIP SHA256, test results and explicit sign-off. A checksum is integrity evidence, not a readiness approval.

## Existing-database upgrade and rollback

**Do not run the following sequence until launch blockers are cleared and a concrete maintenance window is authorized.**

1. Obtain a read-only live inventory. Compare the installed schema and migration evidence against `deployment/babal/release-manifest.json`; check exact columns/constraints/triggers, not merely table names. The manifest's constraint checks are partial, not exhaustive schema equivalence.
2. Rehearse the exact missing additive sequence on a protected, sanitized restored copy or an equivalent approved staging database. Keep customer/financial/governance history unchanged; verify row conservation and configuration, not only SQL exit status. The corrected manifest provides dependency order, not permission to replay every migration indiscriminately.
3. Before switch, enter maintenance mode and stop background workers/new writes. Export the existing database with triggers/routines, and back up the application, private media, configuration inventory and scheduled jobs. Record checksums and verify restoration in an isolated environment.
4. Apply only the reviewed missing additive migrations. MariaDB DDL can commit implicitly; wrapping a script in BEGIN is not a full rollback strategy. Do not import `mariadb-schema.sql`, `mariadb-reset-empty-import.sql`, local D1 migrations, local SQLite files or fictional fixture records into the existing site.
5. Install the verified runtime artifact in a separate versioned application directory, preserving environment and private media paths. Point Passenger at the approved entrypoint/release and restart once. Do not start a second unmanaged server.
6. Run the smoke checks below before reopening traffic. If they fail, keep maintenance enabled. Restore the previous application only if backward schema compatibility is proven; otherwise restore the coordinated pre-switch application/database/media backup while writes remain stopped.
7. If any new orders, wallet entries or other writes occurred, do not blindly restore an older database and discard them. Preserve both states, reconcile new records under an approved recovery plan, then decide recovery or forward repair. Retain all release/backup evidence.

## Release smoke checks

- Health and release identity; HTTPS/canonical origin; login/logout, session persistence and recovery.
- Customer browse/category/occasion discovery, uploaded marked photos, cart and verified-contact checkout. Contact changes revoke the appropriate proof. Missing/invalid OTP and unsupported identities remain rejected.
- First-time means a buyer with no delivered-order history; earlier pending/cancelled purchases do not exempt the buyer. First-time COD below NPR5,000 stays on the normal path; NPR5,000 inclusive and higher is held using final pre-wallet total. Seller packing and rider outbound actions remain blocked until authorized confirmation; one Super Admin can confirm, unauthorized roles cannot. Use approved controlled fixtures, not real order status manipulation.
- Seller submission with photos/no optional video, seller watermark preview, review/publication, orders and permissions.
- Form catalog draft/publication and real saved answers through the MariaDB adapter; promo quote/checkout/aftercare; rewards remain paused unless explicitly enabled.
- Watermark setting change/restoration, original-query denial, private document/preview ownership checks, and Linux-native image transformation under representative resource use.
- Representative desktop/mobile header, dots-only six-second sliders and footer navigation; verify current source snapshot, not old screenshots alone.
- Super Admin/admin/seller/customer/rider boundaries, cancellation/return accounting, jobs and monitoring. No live payment or unsolicited message is part of this local preparation.

## Final preparation results

- Corrected release inventory: 47 migrations, 144 table requirements and 145 trigger requirements. Six focused real-generator tests passed after meaningful RED failures. Independent specification and quality/security reviews both passed.
- Fresh responsive/carousel/Node preflight: **42 passed, 3 failed, 0 skipped**. Failures expect the removed homepage makers anchor, prohibit the now-present independent occasion navigation mapping, and require cover-mode seller previews where watermark previews now use contain mode. These source-assertion mismatches need reviewed regression updates and behavioral checks; no assertions were weakened during preparation. Full log: `focused-preflight-tests.log`.
- Native Babal build completed successfully in the isolated `source-review-only-v2` copy with production secrets absent and a deliberately unusable loopback database target. It did not start a server. All 47 inventory SQL files and the manifest were staged only inside that candidate.
- The emitted standalone contains `@img/sharp-win32-x64`; it has no verified Linux Sharp dependency tree. No upload-ready runtime ZIP was produced. A source-only archive, source hashes, build log, read-only schema-inventory SQL and machine-readable HOLD status form the handoff in the preparation directory. Archive integrity results are recorded there; use only verified matching hashes.
- Existing preview and all 38 original dirty-file hashes are preserved. Final release sign-off remains blocked; no production system, live backup, deployment, migration or external messaging was accessed/performed.
