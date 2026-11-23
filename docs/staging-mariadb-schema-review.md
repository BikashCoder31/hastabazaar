# Staging MariaDB schema review

The verified release needs the older core schema from **manifest positions 59–136**, followed by the guarded completion and final constraint and trigger files. The expected apply set is **82 files** after the checks below. Positions refer to the package's MariaDB manifest. Owner migrations **0164–0172** remain a separate batch.

## Verified baseline and target

- Read-only cPanel review on 23 November checked MariaDB 10.11.20 in `hastabaz_staging`. The running release was `hastabazaar-release-ci-41031347464-1`. Its manifest has 58 MariaDB entries and the stage database contains all 168 tables it requires. The migration ledger has one recorded version, `0020_snapshot`.
- The verified target is `hastabazaar-release-ci-45059021181-1` from `0fdc112bce598176c6cb7ec78a1fd1297e990592`. Its generated manifest SHA-256 is `ed82aaf857f26100233b83263f2814d11cf52f6a7c576954a8263530c28882cd`. Its selected cumulative SQL SHA-256 is `aa248443d0f54096a83a11c74c6b3cda66774431417cd64be9cd127af98a3493`. All 142 listed SQL file hashes matched on the host. Source-only regeneration reproduced both hash values. [Passing package job](https://github.com/BikashCoder31/hastabazaar/actions/runs/45059021181/job/137328529002)
- The first 58 entries are shared. Four shared companion hashes differ only in whitespace at line boundaries or line endings after normalization. These are product deletions, delivery locations, parcel operations and guest business notifications. The first entry is the updated full bootstrap for an empty database. The referral-offer policy file in position 5 has no schema signature. Leave its current settings alone. The later sequence starts at 59.
- The scope comparison used exact object names from the candidate SQL and MariaDB catalogue metadata. The ordered list below identifies missing additions, intentional overlap with older definitions and replacement of an existing trigger body. Name checks alone cannot establish equivalence of every definition or detect historical data changes. Separately verified evidence and required checks for the ambiguous files are recorded below.
- All positions 59–142 occur in the order shown in the pinned cumulative SQL after normalizing line endings and trailing spaces. A static pass through positions 59–136 found no forward foreign-key or ALTER-table dependency against the observed prior tables and earlier table creations. This verifies the source ordering. It does not certify execution against retained staging rows. [Pinned SQL selection](../scripts/prepare-release-schema-input.mjs) · [Cumulative source order](../scripts/generate-mariadb-schema.mjs)

## First step · Read-only production comparison

The owner observed `hastabazaar-release-ci-41031347464-1` on production's public `/health`. Staging ran the same release during the schema review. The application release ID cannot establish that the databases have the same objects or definitions.

1. On a trusted operator machine that already has access, use Node.js 22 and the MariaDB 10.11 client. Extract the **verified** candidate from run 45059021181 to a private local directory. Use its generated manifest and the source checkout containing this runbook. The runner verifies the manifest against the SHA-256 above. Leave the hosted apps and release links alone.
2. Use your existing production **read-only** MariaDB account. It needs read access across the application schema for complete table and column visibility. Save its connection options in an owned, regular mode-`0600` file outside the repository. Use a single `[client]` section with `user` and, if needed, `password`. On the database host, add `socket=/absolute/path/to/socket`. For remote TCP, use `host`, optional `port`, `ssl=1`, `ssl-ca=/absolute/path/to/trusted-ca.pem` and `ssl-verify-server-cert=1`. Use MariaDB option-file quoting for the password. Use your existing approved route to MariaDB and its real TLS hostname. [MariaDB client options](https://mariadb.com/docs/server/clients-and-utilities/mariadb-client/mariadb-command-line-client)
3. From the source checkout, run only this command now. Replace the two paths with your own absolute paths.

   ```sh
   node scripts/deployment/mariadb-schema-upgrade.mjs report \
     --target=production \
     --credentials='/private/path/production-read-only.cnf' \
     --package-root='/private/path/extracted-45059021181-1'
   ```

4. Send back the TSV output. It contains counts and schema object names, grouped by core and by 0164–0172. The core rows check tables, columns, trigger requirements, CHECK constraints, unique indexes, foreign keys, generated columns and collations against the same pinned target. The earlier staging gap count covered names only. The new report also checks shapes where the manifest specifies them, so compare individual categories and names. In particular, look for `complaints.clarification_at` and the other reported missing or different core objects. If visibility looks limited or the command fails, send the counts or terminal error code only. Production apply order is provisional until we review this output.

The command selects only `hastabaz_marketplace`, checks the target, then reads metadata in a read-only transaction. It selects no business rows and prints no definitions, account details, values or credentials. An absent or hidden trigger body is **unverified**. The account's metadata visibility limits the result. MariaDB can hide trigger bodies even if it shows the name. Keep the account read-only. Definitive trigger evidence can come separately from an already-authorized schema inventory if needed. [MariaDB trigger metadata visibility](https://mariadb.com/docs/server/reference/system-tables/information-schema/information-schema-tables/information-schema-triggers-table)

**Stop here for now.** The rest of this runbook documents separate rehearsal and maintenance steps. Wait for review of the production report before using them.

## Disposable rehearsal and compatibility plan

1. **Restore a verified staging backup on an isolated machine.** Record its cutoff, archive and SQL digests, MariaDB version and SQL mode. Restore into an owner-approved disposable MariaDB 10.11 instance matching staging (10.11.20), with no routes to hosted services. Use a database named `hb_schema_rehearsal_<suffix>`, the reviewed recovery procedure, and protected scratch storage. Keep a pristine copy A. Take independent clones B and C for the upgrade and tests. Preserve required triggers, database collation, immutable evidence, protected records and media references. Keep workers and outbound mail, payment, SMS and courier calls disabled. Do not use the active `.staging` data or the checked localhost preview for this rehearsal. [Native recovery procedure](native-recovery.md)
2. **Capture baseline B.** Compare its restored data and schema to the backup receipt. Record per-table counts and a deterministic digest of retained rows, sorted by original primary key, over the original columns. For tables with no primary key, compare the sorted multiset of original row digests. Keep results private. Capture exact integer-paisa sums per currency or ledger type, as applicable, for orders and order items, payments, refunds, wallet balances and entries, seller ledger entries, courier cash/remittances, registered and managed payouts and settlement entries. Capture row counts and stable row digests for seller records, audit events, form submissions and `auth-private:` settings without sharing values. An example over columns present in the baseline is `SELECT currency, COUNT(*), COALESCE(SUM(grand_total_paisa),0) FROM orders GROUP BY currency`. Use exact SQL integer/decimal sums throughout. Compare both counts and row digests so equal totals alone cannot mask compensating changes.
3. **Apply core on B with the runner below.** It runs 59–136, verifies 137 without applying it, then runs 138 and 140–142. Position 139 is for an empty database. The runner checks each of the nine data positions immediately and records zero mismatches before advancing. Review its journal and reconcile retained records against A. Position 137 must still match the five prerequisite column definitions and approved ledger index, with no duplicate non-null refund/type pair. Confirm 138 adds the missing guards and that 142 replaces the existing inventory trigger with the verified exact-offer definition.
4. **Apply the separate owner phase on B.** After the core fingerprint and data checks pass, make a distinct receipt for the verified post-core recovery point. Use a separate approval and journal for 0164–0172. Keep writers paused, especially during the 0164 CHECK and trigger change. Re-run the row reconciliation against both the core checkpoint and original backup. Existing order, payment, refund, ledger, wallet and payout counts, amounts and historical values should be identical. Check 0164's default flag, existing first-COD rows and replacement guard. Check expected defaults and empty new records where the companions specify them. Record each planned control/backfill delta separately so no unexpected increase is accepted.
5. **Compare retention and schema before any smoke writes.** After each phase, compare the original column values and keys against A. Explicitly account for allowed backfills in the table below and nullable/defaulted additions. For email queues and cleanup-related tables, compare while dispatch remains paused. Verify there are no new orphaned references, duplicate source records, unexpected policy or role changes, or secret value changes. A zero-source result proves only the empty case. Exercise the transformation again in a separate rehearsal clone with approved fictional data covering any important empty source, including pre-existing recovery and payment records where available.
6. **Start the candidate against an independent fully upgraded clone.** Use the verified Linux package artifact and Node 22 in a local container or VM with loopback browser access. Use a separate test origin, test principals and an isolated media root. Confirm `/health/live` is HTTP 200, and confirm `/health` reports `hastabazaar-release-ci-45059021181-1`. The public endpoint intentionally omits failure details. For evidence of **zero schema or control-row failures**, run `inspectReadiness` from the matching source with the package manifest and the existing `nativeReadinessAdapter` pointed at the clone, as in the package test. In the run without hosted policy/key material, expect HTTP 503 from `/health` and confirm the separate packaged `hosted-security.mjs --check-readiness` returns its security reason, such as `SECURITY_STATE_UNAVAILABLE`. If valid disposable hosted security is separately prepared, require HTTP 200 and `marketplaceReady: true` as a second check. Use a local-only policy and key. Never bypass the readiness check to get HTTP 200. Smoke catalogue, admin, seller and order rendering, and exercise the candidate's delivery/payment/refund routes with fictional transactions on a separate clone. [Readiness assertion in the package test](../scripts/testing/verify-packaged-commerce-gates.mts) · [Deployment check](../lib/operations/deployment-readiness.ts) · [Health route](../app/health/route.ts)
7. **Test the actual live binary on original and upgraded copies.** Retrieve the verified archive for `hastabazaar-release-ci-41031347464-1` from [run 41031347464](https://github.com/BikashCoder31/hastabazaar/actions/runs/41031347464) or the retained immutable staging release and verify its `SHA256SUMS` and inventory. A build from another commit is insufficient evidence. Run that binary first against a fresh clone of A, then against a fully upgraded clone of B, with the same disposable setup. Use C or re-clone for the write tests so the two runs start with equivalent data. Verify both health routes with valid rehearsal security, staff 2-step sign-in, storefront/cart, COD and bank transfer order placement, seller preparation and dispatch, customer cancellation or return, and the core admin, payment and payout read/write actions. Check order totals, stock/reservations, status transitions, audit entries, queue records and finance invariants, and compare database/HTTP errors across both runs. Use fictional operations and no external dispatch. Include old checkout's stock-reservation write against the new position-142 trigger and the old first-COD path against 0164. Record exact release IDs and results per journey. The earlier pre-NCM smoke was a different binary and does not answer this compatibility question.
8. **Decision for production.** If the actual old binary passes, and the owner approves a production-specific baseline and rehearsal evidence, schedule the database work on an earlier quiet night. Pause writers while changing schema, verify the upgraded database, then resume the old release so the subsequent release evening can focus on the app switch and hosted security. Old-release compatibility afterwards does not make the DDL safe under ongoing writes. If any read/write check fails, the artifacts cannot be verified, or production's baseline differs, keep the scheduling decision open. Use the verified recovery point and separately approved rollback procedure if a maintenance attempt stops partway.

### Data effects to reconcile

| Position | Expected effect | Retained data |
| ---: | --- | --- |
| 63 | Exactly one protected revision row per existing seller, initialized to revision zero. | Seller IDs, documents and restriction history unchanged. |
| 64 | One public state per seller with legacy provenance. Name, municipality/city, description, saved legacy sources and last saved event follow the companion's joins and fallbacks. | Existing profile values, audit history and media bytes/links unchanged. |
| 65 | Public-profile-correction tasks get no deadline. One application task per seller and one document task per eligible identity/PAN document outside protected changes, allowing existing matching task keys. | Existing review task keys and their pre-existing values retained. No duplicate task sources. |
| 66 | One NPR current-account pointer with no version and revision zero. | No account activated and no payment, fee policy or ledger changes. |
| 69 | One default commission scan row with empty cursor and revision zero. | No new commission terms applied to an order, no policy or settings change, and no financial movement. |
| 82 | Backfilled return-handling rows, complaint clocks and review tasks. Initial due times are one day from the original timestamps. First actions use the earliest eligible existing event. | Existing request/complaint counts, historical actions and refund amounts unchanged. Review task count grows only by missing source keys. |
| 93 | One outgoing identity per paid, positive refund packet, with the source amount and transaction identity. Reconcile exact paisa sums and per-packet fields. | Existing refund packets, paid amounts and ledgers unchanged. No payment reissued. |
| 115 | Historical pool per `kind,payout_id,scope_id`, with source maximum principal and summed use. Use cannot exceed principal. The temporary guard leaves no row behind. | Existing historical attribution, payout and ledger rows unchanged. |
| 117 | Original-unpaid pool per `payout_model,seller_id,scope_id`, with used paisa equal to the grouped source sum. | Existing unpaid review rows and actual balances unchanged. |

### Guarded runner for the rehearsal and eventual maintenance

Use one command per phase. The commands below are **examples for the approved disposable copy later**, with the values deliberately unset. Obtain fingerprints from the exact MariaDB target through the local connection file. The fingerprint command is read-only. Its output stays private.

```sh
node scripts/deployment/mariadb-schema-upgrade.mjs fingerprint \
  --target=rehearsal --database=hb_schema_rehearsal_copy_b \
  --credentials='/private/path/rehearsal-maintenance.cnf'

node scripts/deployment/mariadb-schema-upgrade.mjs apply \
  --target=rehearsal --database=hb_schema_rehearsal_copy_b --phase=core \
  --credentials='/private/path/rehearsal-maintenance.cnf' \
  --package-root='/private/path/extracted-45059021181-1' \
  --approval='/private/path/core-approved.json' \
  --backup-receipt='/private/path/verified-restore-receipt.json' \
  --journal='/private/path/new-core-run.jsonl'

node scripts/deployment/mariadb-schema-upgrade.mjs apply \
  --target=rehearsal --database=hb_schema_rehearsal_copy_b --phase=owner \
  --credentials='/private/path/rehearsal-maintenance.cnf' \
  --package-root='/private/path/extracted-45059021181-1' \
  --owner-root='/private/path/reviewed-source-checkout' \
  --approval='/private/path/owner-approved.json' \
  --backup-receipt='/private/path/verified-post-core-restore-receipt.json' \
  --core-journal='/private/path/new-core-run.jsonl' \
  --journal='/private/path/new-owner-run.jsonl'
```

- The rehearsal account needs the schema visibility and DDL permissions used by the companions. Give it access only to the disposable instance. The separate production reporting account stays read-only. Use an explicit loopback address or socket for the rehearsal. Run the native client and exact package runtime using isolated resources under owner control.
- Prepare the approval JSON with `release` equal to `hastabazaar-release-ci-45059021181-1`, `phase` set to `core` or `owner`, `environment` set to the named target, `target` equal to the verified target hash and `before` equal to the independently reviewed initial schema hash. Set `writersPaused` to `true` only after verifying the pause. Set `backupSha256` to the SHA-256 of the matching **verified backup or restore receipt file**. The operator reviews the actual backup and recoverability before approving the receipt. Use mode `0600` for the approval, receipt, connection file and journals. For the owner batch, the core journal's final hash must equal the initial approved hash for the separate owner phase.
- The runner verifies the pinned manifest, every selected SQL file, the backup receipt, the target identity in the MariaDB session, and schema fingerprints before the first write and around each file. It performs the guarded 137 check and the named data checkpoint validations, stops on the first error or mismatch, and appends private per-file timing and results to a fresh journal. It uses the MariaDB batch client without continue-on-error or reconnect. A started entry with no finished entry may have partially committed DDL. Leave writers paused, reconcile the actual metadata and data, then agree on recovery. A completed receipt is required to advance. There is no automatic retry or resume. [MariaDB batch and option handling](https://mariadb.com/docs/server/clients-and-utilities/mariadb-client/mariadb-command-line-client)
- For a later separately approved hosted run, choose `--target=staging` (only `hastabaz_staging`) or `--target=production` (only `hastabaz_marketplace`), omit `--database`, and use environment-specific connection files, approvals, verified backups and journals. Review the exact starting state and add an `after` object to each approval mapping every step ID to the expected fingerprint from its matched rehearsal journal, including 137 in the core batch. The schema fingerprint includes column and constraint metadata and visible trigger/view definitions. Instance identity is checked separately. Fingerprints are deliberately strict. If a production comparison, prerequisite, fingerprint or backfill differs, update and rehearse a production-specific plan before proceeding.

### Timing estimate

| Environment | Provisional database apply allowance | Window to reserve |
| --- | --- | --- |
| Staging | **20–45 minutes**, including both phases and in-run checks, if staging volumes match the retained backup. | **60–90 minutes** for backup verification, apply, reconciliation, old-app smoke and contingency. |
| Production | **45–120 minutes** if rehearsal and production table sizes and storage throughput support it. | **2–3 hours** as a provisional working block. Approve the actual duration only after measuring the rehearsal and comparing production's largest affected tables, indexes and lock behavior. |

These are scheduling allowances. There is no measured apply time yet. Sum the per-file elapsed times in both journals and add the measured backup, reconciliation and smoke durations separately. Compare data and index bytes internally for the tables that caused the slowest alterations. Account for metadata lock waits, index rebuild throughput, free disk and restore time. Keep hosted-security work and any app switch on their own clocks.

## Apply order for a separately approved maintenance window

1. Take and verify a recoverable staging-only backup. Use that baseline to rehearse this order on a separately approved disposable copy with the same MariaDB version and SQL mode. In the actual maintenance window, pause staging writers and recheck the fingerprints before the first file. Keep the running application release and existing initialized security available for rollback.
2. Apply **59–67**, then **68–76**, then **77–94**, then **95–125**, then **126–136** in the exact sequence below. The groups cover review and foundation, catalogue, payments and aftercare, recovery and money, then mail and governance. Apply a file at a time and stop at the first unexpected result. MariaDB DDL can commit independently, so inventory a partial file before resuming.
3. At **137**, check the prerequisites in `mariadb-bootstrap-prerequisites.sql`. The five columns it adds are already present in the expected type, nullability and default families. The unique ledger index already covers `refund_id, type` in that order, and the older refund-only index was absent. The staging duplicate refund/type group count was zero. Treat this as a verification checkpoint. If its complete metadata preflight differs on the copy or on the day, resolve that difference before moving on.
4. Apply **138**, the guarded bootstrap completion. Of its 39 guarded additions, four trigger names were absent on staging. Those are `managed_snapshot_no_update`, `managed_snapshot_no_delete`, `managed_settlement_entry_no_update` and `managed_settlement_entry_no_delete`. The other 35 guarded names were visible. The duplicate order-email event group count was zero. The file validates existing definitions and prerequisites before adding missing objects, so verify those checks in the rehearsal.
5. Apply **140**, then **141**, then **142**. These are CHECK parity, text-length parity and the final inventory guard, in that order. The parity companions check metadata and invalid rows before DDL. Position 142 must replace the older `order_items_require_available_inventory` definition. The current body has no exact-offer reservation guard. The verified body includes that guard and the seller eligibility and restriction checks.
6. Verify the target MariaDB definitions and required control rows, preserve retained records and existing hosted security, and record the exact result before requesting any deployment. The existing staging release was healthy during diagnosis. This review made no database or application changes and did not retry deployment.

Positions **1** and **139** are empty-database-only. The existing staging database stays on the additive path. Hold **0164–0172** for their separate owner review and verified backup.

### Two intentional overlaps

- **68 · Sellable offers.** The existing `order_items_require_available_inventory` trigger is the sole visible final-schema signature in this file. The other 94 were absent, including the offer tables and `order_items.offer_reservation_id`. The file intentionally drops and recreates the earlier inventory triggers after creating their new dependencies. The last refinement is position 142. [Sellable offers SQL](../deployment/babal/mariadb-product-sellable-offers.sql#L28)
- **131 · Notification runtime compatibility.** Staging already has `business_event_key`, `required_permission`, the four delivery-attempt/lease fields, `guest_email` and `guest_order_id`. The two recipient-shape triggers are missing. Keep the additive compatibility file in sequence so the guarded column additions, nullable recipient shape, queue index and both trigger definitions are verified together. [Notification compatibility SQL](../deployment/babal/mariadb-notification-runtime-compatibility.sql#L4)

## Exact ordered file list

| Package position | Verified MariaDB companion | Staging disposition |
| ---: | --- | --- |
| 59 | [mariadb-complete-version-foundation.sql](../deployment/babal/mariadb-complete-version-foundation.sql) | Apply. New schema entries absent. |
| 60 | [mariadb-review-task-ownership.sql](../deployment/babal/mariadb-review-task-ownership.sql) | Apply. New schema entries absent. |
| 61 | [mariadb-core-form-receipt-retention.sql](../deployment/babal/mariadb-core-form-receipt-retention.sql) | Apply. New schema entries absent. |
| 62 | [mariadb-document-review-history.sql](../deployment/babal/mariadb-document-review-history.sql) | Apply. New schema entries absent. |
| 63 | [mariadb-protected-change-holds.sql](../deployment/babal/mariadb-protected-change-holds.sql) | Apply. New schema entries absent. |
| 64 | [mariadb-public-profile-revisions.sql](../deployment/babal/mariadb-public-profile-revisions.sql) | Apply. New schema entries absent. |
| 65 | [mariadb-seller-review-sources.sql](../deployment/babal/mariadb-seller-review-sources.sql) | Apply. New schema entries absent. |
| 66 | [mariadb-company-payment-accounts.sql](../deployment/babal/mariadb-company-payment-accounts.sql) | Apply. New schema entries absent. |
| 67 | [mariadb-category-contracts-intake.sql](../deployment/babal/mariadb-category-contracts-intake.sql) | Apply. New schema entries absent. |
| 68 | [mariadb-product-sellable-offers.sql](../deployment/babal/mariadb-product-sellable-offers.sql) | Apply after the foundation. The older inventory trigger is present and is replaced here. |
| 69 | [mariadb-common-fee-policies.sql](../deployment/babal/mariadb-common-fee-policies.sql) | Apply. New schema entries absent. |
| 70 | [mariadb-private-price-guidance.sql](../deployment/babal/mariadb-private-price-guidance.sql) | Apply. New schema entries absent. |
| 71 | [mariadb-product-intake-workspace.sql](../deployment/babal/mariadb-product-intake-workspace.sql) | Apply. New schema entries absent. |
| 72 | [mariadb-product-publication-versions.sql](../deployment/babal/mariadb-product-publication-versions.sql) | Apply. New schema entries absent. |
| 73 | [mariadb-product-availability.sql](../deployment/babal/mariadb-product-availability.sql) | Apply. New schema entries absent. |
| 74 | [mariadb-product-legacy-observations.sql](../deployment/babal/mariadb-product-legacy-observations.sql) | Apply. New schema entries absent. |
| 75 | [mariadb-product-priority-concerns.sql](../deployment/babal/mariadb-product-priority-concerns.sql) | Apply. New schema entries absent. |
| 76 | [mariadb-cart-selected-offers.sql](../deployment/babal/mariadb-cart-selected-offers.sql) | Apply. New schema entries absent. |
| 77 | [mariadb-manual-payment-allocations.sql](../deployment/babal/mariadb-manual-payment-allocations.sql) | Apply. New schema entries absent. |
| 78 | [mariadb-order-response-scope.sql](../deployment/babal/mariadb-order-response-scope.sql) | Apply. New schema entries absent. |
| 79 | [mariadb-cancellation-scope-holds.sql](../deployment/babal/mariadb-cancellation-scope-holds.sql) | Apply. New schema entries absent. |
| 80 | [mariadb-return-received-evidence.sql](../deployment/babal/mariadb-return-received-evidence.sql) | Apply. New schema entries absent. |
| 81 | [mariadb-return-physical-handling.sql](../deployment/babal/mariadb-return-physical-handling.sql) | Apply. New schema entries absent. |
| 82 | [mariadb-aftercare-followups.sql](../deployment/babal/mariadb-aftercare-followups.sql) | Apply. New schema entries absent. |
| 83 | [mariadb-refund-obligations.sql](../deployment/babal/mariadb-refund-obligations.sql) | Apply. New schema entries absent. |
| 84 | [mariadb-refund-execution-sources.sql](../deployment/babal/mariadb-refund-execution-sources.sql) | Apply. New schema entries absent. |
| 85 | [mariadb-original-delivery-allocations.sql](../deployment/babal/mariadb-original-delivery-allocations.sql) | Apply. New schema entries absent. |
| 86 | [mariadb-lawful-fee-refund-authorizations.sql](../deployment/babal/mariadb-lawful-fee-refund-authorizations.sql) | Apply. New schema entries absent. |
| 87 | [mariadb-private-finance-evidence.sql](../deployment/babal/mariadb-private-finance-evidence.sql) | Apply. New schema entries absent. |
| 88 | [mariadb-original-refund-cost-allocations.sql](../deployment/babal/mariadb-original-refund-cost-allocations.sql) | Apply. New schema entries absent. |
| 89 | [mariadb-refund-original-deadlines.sql](../deployment/babal/mariadb-refund-original-deadlines.sql) | Apply. New schema entries absent. |
| 90 | [mariadb-cancellation-refund-sources.sql](../deployment/babal/mariadb-cancellation-refund-sources.sql) | Apply. New schema entries absent. |
| 91 | [mariadb-cancelled-delivery-allocations.sql](../deployment/babal/mariadb-cancelled-delivery-allocations.sql) | Apply. New schema entries absent. |
| 92 | [mariadb-payout-request-policy.sql](../deployment/babal/mariadb-payout-request-policy.sql) | Apply. New schema entries absent. |
| 93 | [mariadb-payout-transfer-packets.sql](../deployment/babal/mariadb-payout-transfer-packets.sql) | Apply. New schema entries absent. |
| 94 | [mariadb-managed-actual-execution.sql](../deployment/babal/mariadb-managed-actual-execution.sql) | Apply. New schema entries absent. |
| 95 | [mariadb-seller-recovery-cases.sql](../deployment/babal/mariadb-seller-recovery-cases.sql) | Apply. New schema entries absent. |
| 96 | [mariadb-seller-recovery-allocations.sql](../deployment/babal/mariadb-seller-recovery-allocations.sql) | Apply. New schema entries absent. |
| 97 | [mariadb-seller-recovery-agreements.sql](../deployment/babal/mariadb-seller-recovery-agreements.sql) | Apply. New schema entries absent. |
| 98 | [mariadb-recovery-model-settlements.sql](../deployment/babal/mariadb-recovery-model-settlements.sql) | Apply. New schema entries absent. |
| 99 | [mariadb-recovery-model-netting.sql](../deployment/babal/mariadb-recovery-model-netting.sql) | Apply. New schema entries absent. |
| 100 | [mariadb-recovery-contact-clocks.sql](../deployment/babal/mariadb-recovery-contact-clocks.sql) | Apply. New schema entries absent. |
| 101 | [mariadb-recovery-repayment-claims.sql](../deployment/babal/mariadb-recovery-repayment-claims.sql) | Apply. New schema entries absent. |
| 102 | [mariadb-recovery-liability-corrections.sql](../deployment/babal/mariadb-recovery-liability-corrections.sql) | Apply. New schema entries absent. |
| 103 | [mariadb-recovery-response-cycles.sql](../deployment/babal/mariadb-recovery-response-cycles.sql) | Apply. New schema entries absent. |
| 104 | [mariadb-recovery-historical-attributions.sql](../deployment/babal/mariadb-recovery-historical-attributions.sql) | Apply. New schema entries absent. |
| 105 | [mariadb-recovery-source-reviews.sql](../deployment/babal/mariadb-recovery-source-reviews.sql) | Apply. New schema entries absent. |
| 106 | [mariadb-recovery-unpaid-sources.sql](../deployment/babal/mariadb-recovery-unpaid-sources.sql) | Apply. New schema entries absent. |
| 107 | [mariadb-recovery-payout-retirements.sql](../deployment/babal/mariadb-recovery-payout-retirements.sql) | Apply. New schema entries absent. |
| 108 | [mariadb-recovery-unpaid-corrections.sql](../deployment/babal/mariadb-recovery-unpaid-corrections.sql) | Apply. New schema entries absent. |
| 109 | [mariadb-recovery-carrier-reimbursements.sql](../deployment/babal/mariadb-recovery-carrier-reimbursements.sql) | Apply. New schema entries absent. |
| 110 | [mariadb-recovery-partial-sources.sql](../deployment/babal/mariadb-recovery-partial-sources.sql) | Apply. New schema entries absent. |
| 111 | [mariadb-recovery-calculation-reviews.sql](../deployment/babal/mariadb-recovery-calculation-reviews.sql) | Apply. New schema entries absent. |
| 112 | [mariadb-recovery-payout-returns.sql](../deployment/babal/mariadb-recovery-payout-returns.sql) | Apply. New schema entries absent. |
| 113 | [mariadb-recovery-carrier-unpaid.sql](../deployment/babal/mariadb-recovery-carrier-unpaid.sql) | Apply. New schema entries absent. |
| 114 | [mariadb-recovery-history-chronology.sql](../deployment/babal/mariadb-recovery-history-chronology.sql) | Apply. New schema entries absent. |
| 115 | [mariadb-recovery-company-history.sql](../deployment/babal/mariadb-recovery-company-history.sql) | Apply. New schema entries absent. |
| 116 | [mariadb-recovery-fixed-original.sql](../deployment/babal/mariadb-recovery-fixed-original.sql) | Apply. New schema entries absent. |
| 117 | [mariadb-recovery-partial-paid.sql](../deployment/babal/mariadb-recovery-partial-paid.sql) | Apply. New schema entries absent. |
| 118 | [mariadb-recovery-receipt-dispositions.sql](../deployment/babal/mariadb-recovery-receipt-dispositions.sql) | Apply. New schema entries absent. |
| 119 | [mariadb-customer-refund-reversals.sql](../deployment/babal/mariadb-customer-refund-reversals.sql) | Apply. New schema entries absent. |
| 120 | [mariadb-recovery-repayment-attributions.sql](../deployment/babal/mariadb-recovery-repayment-attributions.sql) | Apply. New schema entries absent. |
| 121 | [mariadb-receipt-return-bank-losses.sql](../deployment/babal/mariadb-receipt-return-bank-losses.sql) | Apply. New schema entries absent. |
| 122 | [mariadb-receipt-return-bank-satisfactions.sql](../deployment/babal/mariadb-receipt-return-bank-satisfactions.sql) | Apply. New schema entries absent. |
| 123 | [mariadb-funding-bank-reversal-freshness.sql](../deployment/babal/mariadb-funding-bank-reversal-freshness.sql) | Apply. New schema entries absent. |
| 124 | [mariadb-managed-live-activation.sql](../deployment/babal/mariadb-managed-live-activation.sql) | Apply. New schema entries absent. |
| 125 | [mariadb-managed-live-financial.sql](../deployment/babal/mariadb-managed-live-financial.sql) | Apply. New schema entries absent. |
| 126 | [mariadb-durable-email-delivery.sql](../deployment/babal/mariadb-durable-email-delivery.sql) | Apply. New schema entries absent. |
| 127 | [mariadb-email-service-health.sql](../deployment/babal/mariadb-email-service-health.sql) | Apply. New schema entries absent. |
| 128 | [mariadb-team-governance.sql](../deployment/babal/mariadb-team-governance.sql) | Apply. New schema entries absent. |
| 129 | [mariadb-incident-governance.sql](../deployment/babal/mariadb-incident-governance.sql) | Apply. New schema entries absent. |
| 130 | [mariadb-form-health-records.sql](../deployment/babal/mariadb-form-health-records.sql) | Apply. New schema entries absent. |
| 131 | [mariadb-notification-runtime-compatibility.sql](../deployment/babal/mariadb-notification-runtime-compatibility.sql) | Apply. Eight columns are already present and two guest recipient triggers are missing. |
| 132 | [mariadb-review-task-system-ownership.sql](../deployment/babal/mariadb-review-task-system-ownership.sql) | Apply. New schema entries absent. |
| 133 | [mariadb-complete-version-legacy-transitions.sql](../deployment/babal/mariadb-complete-version-legacy-transitions.sql) | Apply. New schema entries absent. |
| 134 | [mariadb-native-public-feedback-defaults.sql](../deployment/babal/mariadb-native-public-feedback-defaults.sql) | Apply. New schema entries absent. |
| 135 | [mariadb-product-orderable-price-history.sql](../deployment/babal/mariadb-product-orderable-price-history.sql) | Apply. New schema entries absent. |
| 136 | [mariadb-native-form-health.sql](../deployment/babal/mariadb-native-form-health.sql) | Apply. New schema entries absent. |
| 137 | [mariadb-bootstrap-prerequisites.sql](../deployment/babal/mariadb-bootstrap-prerequisites.sql) | Verify. Existing prerequisite columns and the composite unique index were observed. |
| 138 | [mariadb-bootstrap-completion.sql](../deployment/babal/mariadb-bootstrap-completion.sql) | Apply guarded completion. Four retained-record triggers are missing. |
| 139 | [mariadb-fresh-bootstrap-defaults.sql](../deployment/babal/mariadb-fresh-bootstrap-defaults.sql) | Excluded for existing staging. This file is empty-database-only. |
| 140 | [mariadb-check-parity.sql](../deployment/babal/mariadb-check-parity.sql) | Apply after guarded completion. Required CHECK additions are missing. |
| 141 | [mariadb-text-length-parity.sql](../deployment/babal/mariadb-text-length-parity.sql) | Apply after CHECK parity. Required text-length additions are missing. |
| 142 | [mariadb-native-order-stock-governance.sql](../deployment/babal/mariadb-native-order-stock-governance.sql) | Apply last. Replace the older inventory trigger body. |
