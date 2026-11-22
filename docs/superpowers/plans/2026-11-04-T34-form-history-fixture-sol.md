# T34 bounded form history fixture repair — 2026-11-04

Scope is the four assigned test files only: managed-program, seller-case-history, staff-financial-retry and staff-history. Existing dirty source was preserved. No production/shared helper was edited. AGENTS.md and LOCAL-START.md were read; root retains the full-suite/heavy verification slot. Video remains deferred and every deployment remains held.

## Diagnosis and retained changes

The initial explicit six-test memory selection was RED: 0 pass / 6 fail. Managed supply, seller case and activation failed because their 0056-only answer schema lacked actual 0151 `health_environment`/`health_release_id` columns. The managed transition helper copied current seller document schema but omitted its `seller_protected_change_cases` foreign-key parent. Staff history's audit table lacked `created_at`, which the unified regular/native answer source now selects.

Managed-program and activation now apply the actual `0151_form_health_records.sql` migration in their existing isolated fixtures. Staff history includes the actual required audit timestamp with explicit insert columns and timestamps for every fictional historical row. All existing grant revocation, exact actor/request/parent proof, private export exclusion, cursor and historical label assertions remain.

Seller case history now uses the existing `incentiveReportDatabase` helper with **every real migration, foreign key and trigger retained**. Complete fictional legacy users, sellers, category/products, orders/items and terminal cases are inserted before 0056. The earlier actual order-item inventory guard requires real published product parents and sufficient stock; those are supplied before current offer/handling immutability applies. Later migrations derive only their real historical backfills. No current verified identity, receiving verification, native command receipt, refund, or bank execution outcome is invented. New seller-response events include their real required public messages and terminal return/complaint status. Fixture setup asserts `PRAGMA foreign_key_check` is empty. Bounded-query instrumentation recognizes the current unified source's exact subject/form filter and `LIMIT 51`; all 50/3 pagination and private-neighbor assertions remain intact.

A temporary generic schema-supplement experiment was removed after root review: the final seller fixture uses the actual full migration helper, not copied permissive columns. No change to production rules was made.

## Bounded evidence

Artifacts are `.test-artifacts/t34/form-history-fixture-sol-20261104/`. Each TAP is a separate scoped run, not an aggregate suite verdict. Commands use positive explicit test-name alternatives; no mounted/browser test, D1/Maria engine, compiler, build, lint, global test, canonical database, launcher bypass, remote/provider effect or Git mutation was run.

- `baseline.tap`: six directly reproduced failures, 0 pass / 6 fail.
- `current-simple.tap`: 16 selected memory tests, 8 pass / 8 fail. All five staff-history tests, both activation tests and managed supply passed; seller tests exposed missing current handling fields before final migration conversion.
- `current-seller-history.tap`: discarded generic supplement experiment, 4 pass / 4 fail; remaining failures were stale read-query instrumentation.
- `current-seller-migrated.tap`: first full-migration fixture attempt, 0 pass / 8 fail at genuine missing product/inventory parents. Added complete historical product/category parents rather than bypassing its guard.
- `current-seller-migrated-context.tap`: both migrated terminal-page cases passed, 2 pass / 0 fail.
- `current-managed-bounded.tap`: 17 explicit memory tests, 9 pass / 8 fail. Mounted test excluded by positive selection.
- `current-seller-final.tap`: full eight-case migrated selection, 6 pass / 2 fail. Both failures were old corruption setup assigning one forged request ID to three different event rows, which the actual unique request constraint rejects before authorization. Corruption now gives each event a unique forged reference, retaining exact-request mismatch denial.
- `current-seller-unique-request.tap`: only those two affected per-answer authorization tests rerun, 2 pass / 0 fail. The six already-green assertions were not redundantly rerun. All eight seller cases have green evidence across these two checkpoints; no single eight-pass run at the final hash is claimed.

## Managed-program escalation

Managed-program remains incomplete. The eight failed tests are: payment preparation and both actions; route transition decision; rejected answer rollback across branches; all-five authority races; payment status race; all-five publication race; route validation/persistence; and direct supplier preparation. Payment setup fails at missing current `seller_recovery_unpaid_corrections`; transition setup fails at missing `seller_protected_change_cases`. The two route failures are consequently 500 before their intended 409/200 boundaries.

Some generically asserted rejections pass before the intended boundary: the balance-race and direct-authority-race tests can reject at missing-schema preflight. Their TAP passes are **not certification of those races**. The direct `mark_paid` success in the old test additionally contradicts actual `fixed-supply.ts` `requireExecutionPacket`: bank outcomes must use the original verified execution packet. A fresh Astra/full managed fixture reconciliation is recommended; no fake receipt or direct payment success substitution was introduced.

## Source and verification limits

`before-hashes.json` records the four original assigned source hashes and available shared source hashes. `after-hashes.json` records final assigned files, migration helper, transition helper, answer source and current workflow/native-health dependencies. The native-health owner is concurrently changing `lib/workflows/contracts.ts`, native wrappers and health implementation; initial hashes did not cover all of those sources. These results therefore disclose shared dependency movement and do not claim an atomic repository-wide freeze. No whole-suite completion is claimed; root owns integration and progress ledgers.
