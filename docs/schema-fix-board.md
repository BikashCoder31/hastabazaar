# Schema upgrade fix

The delivery branch is `codex/schema-upgrade-fix`, based on GitHub `main` at `0fdc112b`. The staging rehearsal evidence was committed first as `9509ece7`. The staging-only backup from 23 November is the source for each disposable restore.

| Task | Owner | Status | Evidence |
| --- | --- | --- | --- |
| F1 · Order the profile-media indexes | Codex | Done · `969193aa` | Create the replacement before dropping the old index. The regression failed before the change and passed after it. |
| F2 · Converge the retained schema | Codex | Done · `9fe34389` | Position 139a passed on retained and empty databases. Replays were unchanged. An unknown definition failed before DDL. |
| F3 · Repeat the local rehearsal | Codex | Done | Both phases passed. All 750 original rows and money totals matched. The verified Linux package passed startup and database readiness. |
| F4 · Handover | Codex | Done | Typecheck and lint passed. Focused tests reported 40 passing and one platform skip. The package hashes, maintenance order and approval point are below. |

## For the owner

The core upgrade and app switch are planned for the same maintenance evening. The previous rehearsal showed that release `41031347464-1` fails its schema readiness check on the canonical upgraded reference. [Original rehearsal results](staging-security-board.md#disposable-rehearsal-results--23-november)

### Position 64

The original order dropped the only index supporting `seller_profile_media_seller_fk`. The replacement starts with `seller_id` and is now installed first. The final index definitions and existing rows stay the same. The source can be edited on this branch, but the already-published package is immutable. The schema and release manifest generators bind the new companion bytes and recalculated prefix hashes. CI must build and verify a new package from the new selected schema digest.

### Retained schema differences

The production TSV matched all 2,616 comparable staging findings by scope, kind and name. Its account could not verify trigger definitions. The exact findings below come from MariaDB 10.11.20 restored from staging. The production operator needs full trigger and view metadata to establish the approved fingerprint. [Previous staging and production comparison](staging-security-board.md#disposable-rehearsal-results--23-november)

| Existing check | Retained stage | Required definition and correction | Earlier source |
| --- | --- | --- | --- |
| 140 · `orders` columns | `delivery_rate_snapshot_json` is column 47 and `cancellation_version` is 48. | Move `cancellation_version` immediately after `current_referral_discount_paisa`. The two fields take positions 48 and 47 respectively, with type and values intact. | Positions 14 and 21 installed delivery rates and partial cancellation in the retained order. The combined schema puts cancellation first. [Delivery rates](../deployment/babal/mariadb-delivery-rates-costs.sql) · [Partial cancellation](../deployment/babal/mariadb-partial-cancellation.sql) |
| 140 · `return_requests` columns | `original_seal_intact` is column 30, ahead of five later aftercare fields. | Move it after `delivered_at_snapshot`, to position 35. Preserve `BIGINT NOT NULL DEFAULT 0`. | Position 25 added the sealed-goods field. Position 137 verified its presence on the retained database. The empty layout appends it after the later fields. [Policy companion](../deployment/babal/mariadb-policy-commission-9-percent.sql) · [Bootstrap prerequisites](../deployment/babal/mariadb-bootstrap-prerequisites.sql) |
| 140 · `notification_messages` columns | Eight guest and delivery fields occupy positions 19–26. Source event ID, revision and transport occupy 27–29. Five guest fields have narrower text types. | Move the eight fields after `delivery_transport`. The three source fields take positions 19–21. Widen the five fields below with the existing character set, collation and nullability. | The old guest-business companion installed the narrower columns. Foundation and durable-email companions installed the source columns later. Position 131 adds only missing columns. [Guest notifications](../deployment/babal/mariadb-guest-business-notifications.sql) · [Runtime compatibility](../deployment/babal/mariadb-notification-runtime-compatibility.sql) |
| 140 · `notification_messages` guest CHECK | `chk_notification_guest_shape` uses the legacy collation-sensitive comparison. | Require the exact legacy definition, both exact binary recipient triggers from 131, and zero invalid rows. Remove the legacy CHECK while the triggers enforce the guest rule. Position 140 adds the canonical CHECK. | [Guest notifications](../deployment/babal/mariadb-guest-business-notifications.sql) · [Runtime compatibility](../deployment/babal/mariadb-notification-runtime-compatibility.sql) |
| 140 · `orders` trigger order | First-COD runs before promo on `BEFORE INSERT` and `BEFORE UPDATE`. `AFTER UPDATE` runs email, location, cancelled-parcel close, wallet restore, then destination-change OTP invalidation. | Promo runs before first-COD. `BEFORE UPDATE` runs promo, immutable promo, service fee, first-COD, then manual payment source. `AFTER UPDATE` runs location, destination-change OTP invalidation, cancelled-parcel close, wallet restore, then email. Verify all bodies, then re-create only the affected groups in this order with their original execution context. | The archived schema has the independently installed trigger order. The cumulative source assembles the same trigger bodies in another sequence. [First COD](../deployment/babal/mariadb-first-cod-review.sql) · [Promo codes](../deployment/babal/mariadb-promo-codes.sql) · [Order emails](../deployment/babal/mariadb-order-updates.sql) |
| 140 · `managed_payouts` trigger order | `managed_payouts_single_sa_update` runs first in `BEFORE UPDATE`, ahead of identity and terminal-state checks. | Order the group identity, terminal-state, single Super Admin, then the remaining existing guards in their reviewed order. Re-create the group with its original bodies and execution context. | The retained schema installed the single-Super-Admin guard before the maker-readiness payout guards. The cumulative schema orders maker readiness first. [Single Super Admin](../deployment/babal/mariadb-single-super-admin-approvals.sql) · [Maker readiness](../deployment/babal/mariadb-company-store-maker-readiness.sql) |
| 140 · `recovery_retirement_original_proof` | Position 107 retains trailing spaces in individual lines of its trigger body. | Strip only those spaces and verify the exact canonical body hash. Preserve the trigger context. | The cumulative builder trims end-of-line whitespace. The standalone companion retains it. [Retirement companion](../deployment/babal/mariadb-recovery-payout-retirements.sql) |
| 141 · `loyalty_redemption_guard` | The retained trigger has a blank line above the bound on the integer calculation. | Restore the reviewed SQL comment and verify the resulting body hash. The arithmetic and trigger position are identical. | The maintained position 48 companion contains the comment. The restored staging definition omitted it. The evidence does not establish when it was removed. [Loyalty companion](../deployment/babal/mariadb-loyalty-points.sql) |

Position 139a validates the allowed column and trigger definitions and session restrictions before changing the tables. It preserves the definer, SQL mode, character set and connection collation for recreated triggers. The migration account must be the definer, or have global `SET USER` or `SUPER` if the affected triggers have other definers. Confirm this with the hosted operator before opening the maintenance window. MariaDB may commit each DDL statement independently, so an unfinished journal needs inspection before retrying. The original position 140 and 141 SQL and production metadata check are byte-identical to the work that preceded this fix. [Guarded convergence](../deployment/babal/mariadb-retained-schema-convergence.sql) · [Runner](../scripts/deployment/mariadb-schema-upgrade.mjs)

### Notification values before conversion

The retained staging backup had 58 notification rows. All five columns are nullable `utf8mb4_unicode_ci` before and after. Each type widens to `LONGTEXT`. The step checks byte capacity and the runner compares the byte digest of every changed column by row ID, including `NULL` values.

| Column | Old → required type | Non-null rows | Longest value, characters / bytes | Would cut, round or reject |
| --- | --- | ---: | ---: | --- |
| `business_event_key` | `TEXT` → `LONGTEXT` | 54 | 37 / 37 | None |
| `required_permission` | `TEXT` → `LONGTEXT` | 26 | 25 / 25 | None |
| `delivery_claim_token` | `TEXT` → `LONGTEXT` | 0 | All `NULL` | None |
| `guest_email` | `VARCHAR(320)` → `LONGTEXT` | 0 | All `NULL` | None |
| `guest_order_id` | `VARCHAR(191)` → `LONGTEXT` | 0 | All `NULL` | None |

### Verified asset hashes

| Asset | SHA-256 |
| --- | --- |
| Position 64, profile media | `fa0273c8615a248731eba319262532ba658f57e2530151d127dc4d064a9a5319` |
| Position 139a, retained schema convergence | `7b18a860995a94f8199b75e4ba9d29eaec30a55652988cfedc67324b65d62fd4` |
| Selected cumulative MariaDB SQL, also pinned in CI | `b40c9fde31cad9f4dc05c64227c91ef473d10748b51716c7bfce75fcede11843` |
| Local candidate release manifest, 143 entries with owner migrations separate | `e9a9baa694141aa35ed8b07dace830b6ef35b01f772e7b779f2af21d387cbbdd` |
| Local Linux archive, 4,839 inventoried files | `90929712005c3342070d5dc695e30b1a71e14c63b0f20d320ad77df99604ae28` |

The Linux archive is `hastabazaar-release-local-schema-fix-20261123`, built at `9fe343897848b406ce3965461565617601caddbe` with Node 22.23.2. A later CI run will create its own release ID, manifest hash and archive hash. Use that reviewed manifest SHA-256 as `--manifest-sha256` for the newer package. Keep the already-published artifacts and the checked-in historical schema, reset SQL and manifest intact.

### Hosted security readiness

The candidate requires enrollment status for active Super Admins. It also opens every account record already named in the security manifest so it can detect unreadable security state. The active staging Admin `qa-staging+admin` without 2-step does not by itself block staging `/health`. This is a readiness rule. Individual login still enforces the account's existing sign-in policy. [Hosted readiness implementation](../lib/security/hosted-policy.ts#L131)

### Fresh staging-backup rehearsal

The 23 November backup was restored into Linux MariaDB 10.11.20 on an internal local Docker network with zero published ports. The restored database began with 168 tables, 187 triggers, one view and 750 original rows. Backup SHA-256 `d55b99aa5dc151435e6820b1fc44a5da241c4caa26ba7c0b1c9503d7e35d68d6`.

| Phase | Verified outcome | Wall time in the lab |
| --- | --- | ---: |
| Fresh restore | Backup imported and the retained schema was compared with the untouched local baseline. | 0.9 s to restore |
| Core, 59–142 | 83 SQL files completed. Position 137 passed read-only with an unchanged fingerprint, and 139 was skipped. All 5,267 core requirements matched. | 177.4 s in the runner, 245.2 s including baseline comparison, reconciliation and report |
| Owner, 0164–0172 | All nine files passed as a separate phase after taking and hashing a local post-core recovery snapshot. All 156 owner requirements and all 5,267 core requirements matched. | 7.8 s in the runner, 104.7 s including the local recovery snapshot, reconciliation and report |
| Empty reference | Exact selected core SQL installed on an empty schema and matched all 5,267 core requirements. The 156 owner entries remained pending on that reference. A replay of 139a kept the fingerprint. An extra unreviewed column caused 139a to stop with an unchanged fingerprint. | 117.7 s to install and report |

The final report has **zero missing, different or unverified requirements**. The nine existing checkpoints at 63, 64, 65, 66, 69, 82, 93, 115 and 117 had zero mismatches. The 19 changed-column checks at 139a had zero mismatches, including the five text conversions. All 750 original rows matched over their original column bytes after both phases. All 103 original integer-paisa column totals matched. The owner phase also preserved each retained row and money total over the full post-core schema. The 58 notification rows had the same counts and maximum lengths before and after.

The extracted Linux candidate returned HTTP 200 for `/health/live`, `/`, `/shop` and `/login`. Signed-out `/admin` redirected to `/login`. The compiled readiness functions, using the app's MariaDB connection, returned zero database findings, and the combined health gate returned only `SECURITY_STATE_UNAVAILABLE` for the isolated lab. Public `/health` returned the verified local release ID and HTTP 503 while the lab had no hosted policy. The rehearsal Docker containers, network and temporary credentials were removed and verified absent. The original compressed backup was preserved.

### Verification

`npm run typecheck`, `npm run lint` and `git diff --check` passed. The focused runner, release-manifest, CI schema selection, production report and parity-source suites had 40 passing tests. One Windows-only packaging test skipped because PowerShell is absent on this Mac. The Linux package was independently extracted and its archive checksum and all 4,839 file hashes verified. GitHub CI verification is pending a push.

### One production maintenance evening

The combined local restore and both verified phases took about **5 minutes 51 seconds**. This is a timing on a 750-row copy, with an overlapping empty-schema test during the core run. At hosted scale, the three table alterations and existing CHECK validation can spend longer waiting on locks and reading indexes. Compare the production table and index sizes, free disk space, SQL mode and observed restore throughput before setting the window. Reserve about **four hours plus a rollback allowance** provisionally. The two schema phases share a provisional **45–120 minute** allowance within that window. Adjust after the exact hosted baseline is reviewed.

1. **Back up and verify recovery, 20–30 minutes.** Verify the approved CI archive and manifest, prepare proof of restore and identify the previous app release. Confirm full trigger visibility and definer privileges, and approve the preflight and per-step fingerprints for this exact target privately.
2. **Stop the app and pause writers, 5–10 minutes.** Present maintenance mode. Pause scheduled jobs and all app, email and worker writes. Confirm the consistency of the final recovery backup and the target fingerprint before the first file.
3. **Run the core phase.** Use the reviewed package and one guarded runner command. It runs 59–138 with 137 verify-only, skips 139, then runs 139a and 140–142. Use the approved manifest hash and every reviewed post-step schema fingerprint, including 139a and 137. Review the complete journal and core report before proceeding.
4. **Run 0164–0172 separately.** Create a verified post-core recovery point and use a separate owner approval and journal. Supply the completed core journal. Keep writers paused through both phases.
5. **Reconcile, 10–20 minutes.** Require zero findings in both report sections, all checkpoints at zero and preserved row digests and money totals. If a migration or verification fails, keep maintenance mode on. Inspect the last journal entry and any committed DDL before deciding whether to use the verified recovery backup. Restoring app files alone cannot roll back the schema.
6. **Place and start the candidate, 10–15 minutes.** Use the reviewed production package and preserve the existing environment, media and initialized security files. Leave public traffic in maintenance mode. The earlier release was already shown to fail on the fully upgraded schema.
7. **Check hosted security, 30–45 minutes if setup is needed.** Verify the existing policy or use the approved owner setup for production, confirm Super Admin sign-in with 2-step, and verify hosted-security readiness.
8. **Verify health and reopen, 10–15 minutes.** Require HTTP 200 from `/health/live` and `/health`, the exact candidate release ID, and storefront, shop and sign-in smoke checks. Reopen traffic and resume jobs after those checks pass.

Use the existing private runner inputs and 0600 files. For this candidate sequence, pass the SHA-256 of the **exact CI manifest reviewed for the window** with `--manifest-sha256` on report and apply. The earlier report and rehearsal commands remain historical examples for the old published archive. [Runner and approval inputs](staging-mariadb-schema-review.md#guarded-runner-for-the-rehearsal-and-eventual-maintenance) · [Previous release compatibility result](staging-security-board.md#disposable-rehearsal-results--23-november)

### Local branch and files

Branch `codex/schema-upgrade-fix`. GitHub `main` was verified at `0fdc112b`. The local range from that base includes the existing staging security and guarded-runner work through `9509ece7`, schema fix commits `969193aa` and `9fe34389`, and this handover commit. The staging evidence was committed as `9509ece7` before the schema edits. The branch is local.

| Area | Changed in this task |
| --- | --- |
| SQL | `deployment/babal/mariadb-public-profile-revisions.sql`, `deployment/babal/mariadb-retained-schema-convergence.sql` |
| Contracts | `lib/operations/bootstrap-completion-contract.json`, `lib/operations/check-parity-contract.json`, `lib/operations/text-length-parity-contract.json` |
| Generators and runner | `scripts/generate-mariadb-schema.mjs`, `scripts/generate-release-manifest.mjs`, `scripts/deployment/mariadb-schema-upgrade.mjs`, `scripts/deployment/mariadb-upgrade-checkpoints.mjs` |
| CI and tests | `.github/workflows/verify-release.yml`, `scripts/testing/current-artifact-identity.mjs`, `tests/check-parity-source.test.mjs`, `tests/mariadb-schema-upgrade.test.ts`, `tests/prepare-release-schema-input.test.mjs` |
| Boards | `docs/staging-security-board.md`, `docs/schema-fix-board.md` |

Compared with GitHub `main`, the branch also carries the earlier changes in `docs/staging-mariadb-schema-review.md`, `scripts/generate-production-schema-check.mjs` and `tests/production-schema-check.test.ts`. This task preserved the production schema check and both original parity SQL companions. Any push needs owner approval.
