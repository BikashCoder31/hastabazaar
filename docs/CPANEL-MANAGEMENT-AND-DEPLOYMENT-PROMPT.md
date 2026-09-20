# Reusable cPanel management and deployment prompt

Copy the prompt below into a new Codex task whenever Hastabazaar needs a cPanel inventory, backup, cleanup, production release, rollback or post-release verification.

---

You are managing the production deployment of **Hastabazaar** on **Babal.Host cPanel**. Work conservatively, preserve evidence and customer records, and use versioned releases with the shortest safe production interruption.

## Known production layout

- Hosting: Babal.Host cPanel / Passenger Node.js application
- Production application root: `/home2/hastabaz/hastabazaar-app`
- Startup file: `app.cjs`
- Node.js: supported 22.x release; verify the exact live version before deploying
- Database: MariaDB; inspect the exact live version and installed migration state
- Private media root: `/home2/hastabaz/private-media`
- Public origin: `https://hastabazaar.com`
- Local source workspace: `C:\Users\abinash\Desktop\Hatskala`

## Non-negotiable safety rules

1. Start with a **read-only inventory**. Do not delete, overwrite, migrate, restart or deploy until the inventory and proposed action list are shown to me.
2. I will sign in to cPanel myself. Never ask me to paste passwords, private keys, database credentials, OAuth secrets, SMTP credentials, session cookies or session-bearing URLs into chat.
3. Before any change, create and verify:
   - a full cPanel account backup;
   - a separate MariaDB SQL export;
   - a separate archive of the current application root;
   - a separate private-media archive;
   - a record of environment-variable **names** and configuration, with secret values redacted;
   - filenames, timestamps, sizes and SHA-256 hashes for recoverable artifacts.
4. Download verified backup copies off-server. Do not treat a cPanel full-account backup as the only recovery method because a full restore may require hosting-provider assistance.
5. Never import an empty/base/reset schema or development seed into production. In particular, never import `mariadb-schema.sql`, `mariadb-reset-empty-import.sql`, or development seed data into the existing marketplace.
6. Inspect live migration markers, tables, columns, indexes and triggers. Apply only confirmed missing, additive migrations in the documented order. Stop on the first error and inspect partial MariaDB DDL effects before retrying.
7. Never delete or replace MariaDB data, private media, Seller verification evidence, mailboxes, DNS, SSL, environment settings, financial/audit records or policy-acceptance history as part of application cleanup.
8. Do not run a production build on the limited hosting account. Build and verify the standalone release locally, then upload the tested artifact.
9. Do not operate a second background Node process beside Passenger.
10. Any destructive cleanup requires my explicit approval of an exact path-by-path deletion list after backups and production acceptance succeed.

## Phase 1 — inventory and deployment decision

1. Record `/health`, current public behaviour, Node/Passenger configuration, resource usage and the currently deployed release evidence.
2. Inventory the application root, dated backups, old ZIP files, extracted release directories, logs, private-media directory, database, cron jobs, mail, DNS and SSL.
3. Classify every item as:
   - keep permanently;
   - keep through rollback period;
   - download and remove later;
   - safe temporary cleanup candidate;
   - unknown — do not touch.
4. Compare live schema/migration evidence with the repository's current ordered additive migrations.
5. Present the inventory, risks, expected interruption and exact plan. Pause before changing anything.

## Phase 2 — prepare the release locally

1. Review the dirty working tree and preserve unrelated user changes.
2. Run targeted lint, the full automated test suite and the production build.
3. Run the Babal standalone build process and create a uniquely named release, for example:
   `hastabazaar-release-YYYY-MM-DD-HHMM.zip`.
4. Generate a per-file manifest and SHA-256 hash.
5. Reopen and verify the archive. Confirm that `app.cjs`, `server.js`, `package.json`, `dist`, required production dependencies and `public` are at the correct release root.
6. Confirm the archive contains no secrets, `.env` files, customer uploads, private media, development identities, test databases, caches or unrelated old release files.
7. Record the exact policy versions included in the release. Material policy changes must use new version identifiers and must not rewrite prior acceptance snapshots.

## Phase 3 — backup and maintenance window

1. Announce/fix a maintenance window appropriate to the change. Ordinary code releases should use only a short Passenger cutover; incompatible database or infrastructure work requires a longer maintenance window.
2. Prevent new marketplace writes before the final database/application backup.
3. Complete and hash all backups described above.
4. Verify that rollback material is accessible before proceeding.

## Phase 4 — versioned deployment

1. Upload and extract the new package into a new dated release directory while the existing application remains available.
2. Verify extracted file counts, manifest entries, ownership and permissions.
3. Apply only confirmed pending additive migrations. Use expand–migrate–contract compatibility so old and new application versions can coexist during the transition whenever practical.
4. Stop Passenger only for the final switch.
5. Preserve the existing application as a dated rollback release. Switch the configured application root or perform a verified directory swap, depending on what cPanel safely supports.
6. Preserve environment variables, dependency/runtime configuration and the external private-media path.
7. Start the application through cPanel/Passenger and immediately check `/health`.

## Phase 5 — production acceptance

Verify at minimum:

- `/health`, HTTPS, canonical origin and security headers;
- homepage, shop, product pages and mobile layouts;
- legal centre and all current policy pages;
- login/logout, password reset and existing Super Admin access;
- Seller application, exact Seller Agreement acceptance version and private-document authorization;
- catalogue moderation and product/media uploads;
- cart, COD checkout and immutable customer-policy acceptance snapshot;
- order, cancellation, delivery, return, complaint and refund flows;
- notifications, SMTP acceptance and any authorized inbox receipt test;
- payout, wallet, referral and audit integrity where affected;
- Passenger/application logs, CPU, memory, disk and entry-process limits.

Do not manufacture real orders, cash collection, refunds or delivery events merely to accelerate verification. Use approved test identities and reversible, authorized checks.

If a critical check fails, stop writes and evaluate rollback. Do not restore an old database over newer orders or financial activity without reconciliation and explicit approval. Prefer an additive forward fix where rollback would conflict with new data.

## Phase 6 — controlled cleanup

1. Do not clean immediately after a successful restart. Keep the rollback release through an agreed observation period, normally 24–72 hours.
2. Present an exact deletion list with absolute server paths, sizes, purpose and recovery location.
3. Normally retain on-server:
   - the active release;
   - one immediate prior known-good rollback release;
   - the newest verified backup until off-server recovery is confirmed;
   - required logs under the approved retention schedule.
4. Cleanup candidates may include only verified superseded deployment ZIPs, abandoned extracted releases, temporary hosting-check files, failed-upload fragments and obsolete staging artifacts.
5. Delete only after my explicit approval, then report exactly what was removed and how it can be recovered.

## Required final report

Provide:

- production release identifier and SHA-256;
- backup filenames, hashes and off-server custody status;
- exact migrations inspected/applied/skipped and why;
- tests, build and production checks with results;
- actual interruption duration;
- active and rollback release locations;
- remaining risks or follow-up actions;
- exact cleanup performed;
- confirmation that database, private media, environment settings, mail, DNS, SSL and historic acceptance/audit records were preserved.

Start with **Phase 1 only** unless I explicitly authorize a later phase. If cPanel browser access is needed, ask me to open and sign in to cPanel myself; do not request credentials.

