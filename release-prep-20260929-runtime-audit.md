# Runtime deployment audit — 2026-09-29

Source audited: `C:/Users/abinash/.codex/worktrees/hastabazaar-v1-2-1-staging/Hatskala`, HEAD `80424cf`, including its current dirty source. This was a static, read-only audit. No repository changes, builds, tests, database connections, secret-file reads, browser actions, production access, or external messages were performed. The requested report is the sole new file.

**Decision: not ready to launch on the existing Babal.Host Node/MariaDB runtime.** The blockers below require preparation and disposable-runtime evidence before a production cutover.

## Concrete launch blockers

1. **Phone verification has no Node SMS transport.** `lib/runtime/node-bindings.ts:484` exports DB, MEDIA and EMAIL, with no SMS binding or provider adapter anywhere in the searched application/runtime source. `lib/auth/contact-delivery.ts:67` rejects non-simulated phone delivery unless `SMS.configured` is true; result is HTTP 503. `lib/auth/contact-verification.ts:333` requires both current email and phone proofs for a new checkout, and `lib/db/repositories/orders.ts:221` invokes that requirement. The additive migration explicitly backfills no proofs. Therefore customers cannot newly prove their phone and place new orders on this runtime. Passing fictional local captures does not demonstrate hosted SMS delivery.

2. **The versioned package omits new additive migrations.** `scripts/generate-release-manifest.mjs:10` does not list `mariadb-checkout-contact-verification.sql`, `mariadb-form-catalog.sql`, `mariadb-data-rights-legal-holds.sql`, `mariadb-address-answer-owner-tombstones.sql`, `mariadb-feedback-delivery-jobs.sql`, `mariadb-first-cod-review.sql`, or `mariadb-first-cod-evidence-guards.sql`. Each is read by the base-schema generator. `scripts/package-babal-release.ps1:33` copies only migrations in that manifest. The generated base contains new tables, but is marked `empty-database-only`; applying it is not an existing-database upgrade plan. Include the required companions and ordered dependencies, regenerate readiness requirements, and validate the exact additive upgrade against an isolated copy of the attested pre-upgrade schema. Whether any companion is already applied on the host needs a later read-only inventory.

3. **MariaDB configured forms remain incompatible.** The frozen `.superpowers/sdd/2026-09-28-promo-codes-daily-points/task-12-compat-report.md` records real `saveFormDraft` failure at SQLite `json_each` and real `buildFormAnswerInsert` failure at `WITH ... AS MATERIALIZED`, with rollback preserved. Those exact constructs remain in `lib/db/repositories/form-catalog.ts:114` and `lib/db/repositories/form-answers.ts:95`; the Node translator has no corresponding implementation. This blocks integrated configured admin/forms/checkout/aftercare acceptance, regardless of schema parity or SQLite unit success. The prior actual Maria run was **13 PASS, 4 BLOCKED, 1 INCONCLUSIVE, 0 FAIL**, overall exit 1, not a green runtime gate.

4. **Canonical Maria bootstrap and gift upgrade are not demonstrated safe.** That same report reproduces missing `rider_profiles` during full generated bootstrap, and a `wallet_entries_ibfk_1` collision in the authentic gift companion. `deployment/babal/mariadb-gift-cards.sql:14` still uses the inline `gift_card_id ... REFERENCES gift_cards(id)` ALTER. The passing incentive fixture substituted a named gift FK only inside its isolated fixture; it did not repair the maintained migration. Fresh bootstrap is a separate blocker for new installations; gift reapplication is conditional on the host's actual prior migration/FK state. Do not blindly replay all listed companions.

5. **The current Windows dependency tree cannot establish Linux Sharp readiness.** The installed `node_modules/@img` contains `sharp-win32-x64`, `sharp-wasm32`, and `colour`, with no Linux Sharp/libvips package. Installed Vinext `dist/build/standalone.js:61` recursively copies installed runtime/optional dependencies and skips absent optional packages; it performs no target-platform installation. Sharp 0.35.2 includes Linux native packages as optional dependencies, but `@img/sharp-wasm32` is not in Sharp's runtime dependency list or the application's direct dependencies, so its local presence is not an assurance that standalone copying will retain it. A build/package pass on this machine is insufficient evidence for the Linux artifact. Build with the target OS/CPU/libc dependency set in a separate environment, inspect the extracted archive, and execute its real SVG-composite-to-WebP watermark path there. Product photos are decoded/re-encoded through Sharp even when watermarking is disabled (`lib/products/watermark.ts:42`). Failure returns 503 (`watermark-delivery.ts:35`); other existing review/rider/hero image paths also depend on Sharp.

## Runtime and packaging details

- `npm run build:babal` invokes a portable Node script that generates the manifest, rewrites brand assets with Sharp, builds with `DEPLOY_TARGET=babal`, and copies Passenger entry `app.cjs`. It mutates source/output files; do not run it over the unrelated dirty work merely to obtain audit evidence.
- The generic `npm start` invokes Wrangler and is not the Babal startup. The Babal release uses Passenger `app.cjs` importing standalone `server.js`; `next.config.ts` selects `standalone` only for the Babal build, and `vite.config.ts` aliases Cloudflare bindings to the Node adapter.
- The packager is PowerShell and requires an explicitly versioned release ID matching the generated manifest. It hashes all files, extracts the ZIP, compares bytes/hashes and requires startup/client manifest entries. These checks do not exercise SQL compatibility, SMS, Sharp or platform compatibility. It rejects `.env*`, reset-import schema and seeds; keep the reset import excluded when fixing migration coverage.
- `lib/operations/readiness.ts` checks manifest database columns, triggers and checks only. `/health` being 200 does not prove SMTP/SMS transport, image rendering, private-media writability or configured-form SQL success. The current checked-in manifest lacks contact entries; regenerating from the current base adds table requirements, but still does not add omitted companion files to the migration list.
- Node runtime requires `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`; defaults are DB_PORT 3306 and pool size 4. SMTP configuration names are `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, optional `SMTP_PORT` (465 default) and `SMTP_HELO`; implementation uses implicit TLS, not STARTTLS. `CONTACT_DAILY_SEND_LIMIT` defaults to 100 and accepts integers 1–10000. Production must not use `local_staging` capture mode. Private media uses `MEDIA_ROOT` or `<cwd>/private-media` and needs persistent readable/writable storage for originals, derivatives and metadata.

## Safe local verification to schedule

These commands were **not run by this audit**. Run source checks on the frozen intended release; builds/generation/install/package actions belong in a separate disposable release checkout so existing dirty files remain preserved. Use installed tools, avoiding an implicit `npx` download.

```powershell
node --check scripts/build-babal.mjs
node --check scripts/generate-release-manifest.mjs
node --check deployment/babal/app.cjs
.\node_modules\.bin\tsx.cmd --test tests/node-hosting.test.ts tests/checkout-contact-verification.test.ts tests/contact-verification-ui.test.ts tests/product-watermark.test.ts tests/product-watermark-routes.test.ts
.\node_modules\.bin\tsc.cmd --noEmit --incremental false
npm run lint
```

The focused contact/watermark tests use SQLite and mocked bindings/buckets; they are necessary feature checks but not MariaDB or Linux archive acceptance. Contact/route tests use `node:module.registerHooks`, so use the intended Node 22 patch with that API rather than assuming the package's 22.13 minimum is sufficient for the test runner.

The existing guarded `.\node_modules\.bin\tsx.cmd scripts/test-incentives-mariadb.ts` may be scheduled only after verifying its attested disposable Docker context/container (`hastabazaar-form-catalog-qa-0928`, MariaDB 10.11, loopback 13316, tmpfs). It creates fresh owned fixture databases and reads its ignored connection state in memory. It must still fail overall while blockers/inconclusive acceptance remain. It is not a production migration command. Add equivalent actual Node/Maria contact proof, changed-contact revocation, verified checkout, watermark media storage and configured-form tests to the release gate.

In an isolated Linux environment matching the host: install the locked dependencies including optional native packages, run the above appropriate equivalents, assign a new `HASTABAZAAR_RELEASE_ID`, run `npm run build:babal`, and test the extracted standalone dependency tree/rendering before creating the final checksum manifest. Confirm Sharp's exact CPU/libc support from the installed package; its Linux x64 loader checks x86-64-v2 support. No dependency installation or production build is authorized by this audit.

## External information required before launch

- Confirm destination and current Node patch, OS, architecture, libc/CPU compatibility, Passenger startup/root and resource limits. The September 17 deployment record says Node 22.23.2 and `/home2/hastabaz/hastabazaar-app`; this is historical, not current attestation.
- Obtain a read-only applied-migration/schema/FK inventory, MariaDB version, SQL mode, charset/collation and transaction isolation; reconcile the exact ordered additive changes against it.
- Choose and provide the approved Nepal SMS provider contract/API, sender identity, destination format, credentials supplied privately, spending/rate limits and outbound access. Implement the Node binding and test provider failures with mocks; real delivery evidence needs separately authorized test recipients/actions.
- Confirm SMTP implicit-TLS endpoint, configured sender and daily budget without exposing credentials; confirm persistent private-media root/permissions and storage capacity.
- Confirm recoverable current database, application and private-media backups, the retained application rollback directory, maintenance/cutover owner and smoke-test accounts. Retain additive data/history during rollback. No live changes/messages are authorized by this report.
