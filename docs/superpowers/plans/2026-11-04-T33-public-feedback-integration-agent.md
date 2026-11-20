# 0154 combined native source integration

Status: **fresh actual isolated transition/runtime proof PASS, exit 0**, after an explicit exact-metadata ruling and a fresh rerun. The earlier REVIEW_REQUIRED / exit 1 record remains unchanged below. This is an overlay after the previously verified T33 v5 through-0153 candidate, not a canonical-database migration, deployment or reset.

## Bounded integration

`scripts/generate-mariadb-schema.mjs` imports Finance's pure `generatePublicFeedbackMariaSql` from `lib/forms/public-feedback-schema.mjs`, reads the actual `drizzle/0154_native_public_feedback_defaults.sql`, and appends only that derived output immediately after the unchanged 0153 block. The new layer alters the existing feedback job version column to nullable metadata and adds three source-derived native proof/immutability triggers; it creates no new table, changes no old source statement and adds nothing to the drop inventory.

The generated column type/collation agrees with the existing parent metadata identity: `VARCHAR(191) COLLATE utf8mb4_nopad_bin`. No fake publication or configuration version is created. Existing nullable/native proof semantics and public-form producer behavior remain Finance's ownership.

## Source evidence and retained artifacts

The new actual-generator test first failed because the reviewed 0154 append was absent. It then verifies the entire prior 0153 byte prefix, exact pure 0154 tail, unchanged original 0152/public schema/reset files, and unchanged recovery drop/schema prefix. A first harness expectation incorrectly required the *new* recovery candidate to omit the new schema layer; this was corrected to require only the exact same append after its unchanged 0153 prefix. No old reset artifact is changed or executed.

- `node --test --test-concurrency=1 tests/native-public-feedback-combined-schema.test.mjs tests/complete-version-migration-schema.test.mjs`: **8/8, zero skips, exit 0**, `public-feedback-combined-generator-green.tap`; meaningful missing-append RED retained in `public-feedback-combined-generator-red.tap`.
- Scoped generator/new-test `oxlint`: **exit 0**, `public-feedback-generator-lint.txt`.
- New point-in-time candidate directory: `.test-artifacts/t33/native-public-feedback-candidate-v6/`.
- Full schema: **1762 statements** (prior 1758 + four reviewed 0154 statements), SHA `334a78cdcb645a22580715cfb1ccc2acb5dc6987a6ef91cc485077fc26637bf0`.
- New candidate recovery source SHA: `0af560c79411506dac4736d5f41922521bdc107dc83506cf7e54142ce12b93a6`. It retains the entire prior recovery drop inventory and through-0153 schema, then appends the same 0154 source.
- Unchanged prior 0153 schema/reset: `27b50a85e8afd035565a238fb15f0e6a1411b0c8293f403930ad914e8a75ad56` / `fd37ca2739cfdf7abbeea2af236eabcb9260f642b7f1ad6627df5db00dbec3e2`.
- Unchanged original 0152 and public schema/reset: `70f52749d19f5ec87375f897c8d50c8c040e09bfa20a6f36184c3399e49791e8` / `2525fc6c7748e012d5e2b43ed2e5d5efa8e8ffeaf79a5a4f71e97a73782d5898`.
- Paired 0154 append SHA: `3aab6ce9ab4680d717b8520164bca2fc688753bb439fbe50962cead563089bdf`.

`freeze.json` in the new candidate records source hashes, prefixes, all retained artifact hashes and `databaseOpened:false` / `nativeRehearsal:not_run`. Producer/proof work was still in progress at this capture; later source changes require an explicit new candidate rather than retroactively changing this record.

## Reviewed isolated transition boundary

The reviewed driver uses the already verified local portable Maria binary and a fresh owned namespace for the exact v5 through-0153 source, then snapshots all five original feedback job states before applying only the copied 0154 append. A separate fresh namespace is necessary for all-three absent-publication runtime checks without deleting retained old publications. Actual row/lease/attempt/payload preservation, FK/index/check retention, Node-adapter create/exact replay/private reads and forged-origin negatives precede authenticated shutdown with exact PID evidence. Fresh-empty import alone is insufficient. Root granted the serialized window only after Finance's helper/producer source freeze.

An inherited source-only parity concern was explicitly sent to Finance: the old Maria feedback JSON check visibly validates JSON/length, whereas SQLite also requires object type. The queued strict native helper should exercise array/scalar negatives with otherwise valid origin before any parity conclusion or correction. This is not counted as a confirmed native defect or silently normalized.

No canonical or old fixture namespace, data, remote provider, install, deployment, reset, live activation or video operation was used.

## V7 and actual two-namespace native result

Finance added the source-derived inherited JSON-object constraint and regenerated the paired append. V6 remains its exact point-in-time source artifact. Current V7 is `.test-artifacts/t33/native-public-feedback-candidate-v7/`: schema **1763 statements**, SHA `37f10ff2098126ef3646859adf3002d5f4ab5dbe691a4dac92b2b1f804a3c7cf`; paired append **five statements**, SHA `2238b9704b25a1858028850f002366db4e8e8044b6510704a96b48c9480dee30`; new recovery candidate SHA `50b647c2615d94f449ae66b5e4aae4963bd30f6fe9e2681665306cb353ded3a6`. The prior 153/public/reset prefixes and files remain unchanged. Current source checks still pass **8/8, exit 0** (`public-feedback-combined-v7-source.tap`).

The authorized real native proof completed in two fresh namespaces on one verified Maria 10.11.19 server. Primary result `.test-artifacts/t03-followup/native-public-feedback-mw1sdaa0_2f51.json` is deliberately **REVIEW_REQUIRED / actual exit 1**, solely because raw native default metadata changed as described below. It is not recorded as a clean native pass pending Root's technical review.

Phase A `fixture_815db40e_public154a_mw1sdaa0_2f51` imported the exact 1758-statement through-153 source, seeded five declared original published-version jobs and answer receipts, then applied only the reviewed five-statement append. All original rows, publication/answer facts, JSON bytes, lease tokens, attempts and statuses remained identical; original snapshot SHA `f84a59fd78df0ca6cb7e2138f181aee338496413839fa901cb660fef405a4d0d`. FK enforcement remained on. The actual pre-154 native source accepted array/scalar JSON in rolled-back probes, confirming the inherited parity gap; V7 rejects both. A read-only pre-DDL check refused an injected invalid legacy row without normalizing it, and rollback restored the original snapshot before migration. Invalid legacy JSON is a concrete future cutover stop, never a backfill target. Forged nullable metadata and invalid retained FK references also reject.

Column metadata was captured without coercion. Both sides retain `COLUMN_TYPE=varchar(191)`, `CHARACTER_SET_NAME=utf8mb4`, `COLLATION_NAME=utf8mb4_nopad_bin`, `EXTRA=''`. Intended nullability changes `NO`→`YES`. Raw `COLUMN_DEFAULT` changes SQL null (no declared default)→string `NULL` (Maria's newly nullable implicit NULL). This exact delta is returned as `columnDefaultChanged:true` and causes review-required status rather than being silently called unchanged.

Phase B `fixture_815db40e_public154b_mw1sdaa0_2f51` separately imported the complete 1763-statement V7 source with zero publications. The real Node pool and actual public form GET/POST handlers successfully exercised all three native variants, exact original retries, changed-body conflict, current authorized Support read and unauthorized-reader rejection. Otherwise matching native proof is positively accepted; missing proof, array/scalar body, case variant, wrong request and string-typed version reject. Native facts/origin are immutable. Genuine first publication preserves the old native request while a new submission uses its real published metadata. No identity was provisioned, no private message/email entered the new audit facts, and external mail attempts remain **0**.

All captured candidate and 25-dependency producer/helper hashes remained fixed. The driver persists primary results before cleanup evidence. Exact shutdown copy `native-public-feedback-mw1sdaa0_2f51-shutdown.json` records **PID 9484**, authenticated shutdown true, stopped true, forced stop false; OS process absence was independently verified. Both fresh namespaces remain retained, and no pool/server/browser/worker remains active. The heavy slot was explicitly released. Original reviewed source and reset artifacts were not executed or replaced.

## Exact ruling and fresh clean native rerun

Root reviewed the actual metadata and accepted **only** raw SQL null→string `NULL` together with `IS_NULLABLE NO`→`YES`, while type/charset/collation/extra remain unchanged. The helper and driver now assert this exact pair and deep equality of every other descriptor field; they do not normalize values or accept other defaults. The producer and schema were not changed. The earlier review-required JSON/log/exit remain retained, not relabeled.

The required fresh rerun **PASS / actual Node exit 0** is `.test-artifacts/t03-followup/native-public-feedback-mw1su30p_a4ed.json` (log `native-public-feedback-exact-metadata.log`). It created two new namespaces, `fixture_815db40e_public154a_mw1su30p_a4ed` and `fixture_815db40e_public154b_mw1su30p_a4ed`. It again executed the 1758-statement 153 prefix plus five-statement incremental transition, then the complete 1763-statement V7 source in the second namespace. All preservation, invalid-legacy stop, actual old native JSON parity RED, current object/scalar/FK/proof negatives, three real Node/API paths, exact replay, private-reader, first-publication and original-origin assertions described above passed. The exact raw descriptor delta is preserved with `reviewedExactNullableDefault:true`; no other descriptor drift passed.

The original five-state snapshot SHA remains `f84a59fd78df0ca6cb7e2138f181aee338496413839fa901cb660fef405a4d0d`. Actual external mail attempts remain **0**; no identity is provisioned and private body/email remains absent from new audit facts. All recorded source/candidate hashes stayed fixed. Shutdown proof `native-public-feedback-mw1su30p_a4ed-shutdown.json` records **PID 18304**, authenticated shutdown true, stopped true, forced stop false; OS absence was checked. No pool/server/browser/worker remains. The serialized heavy slot and producer freeze were explicitly released.
# Five-guard154 retention overlay — fresh native acceptance

Finance's later actual intake test proved that the parent `feedback.submitted` audit proof could be updated/deleted. The earlier three-guard V7 PASS remains an exact historical checkpoint; it is not relabeled as proof of the corrected source. Current154 adds only the two source-derived parent audit immutability/retention guards, preserving lawful actor-to-NULL anonymization.

New candidate `.test-artifacts/t33/native-public-feedback-candidate-v8` has1765 statements/seven appended statements, schema SHA256 `7827e2ab78c852a53d9fffa76aa7e91ca4530b88a0ea82378d9a3153a255be6e`, append SHA256 `8224c191c834d7c7260f8be6f04aa530940aeff898e323ba26645dd34a01e763`. Every verified153 schema/recovery prefix and the old V7/public152/reset files remain unchanged. The combined-source test's old count3 meaningfully failed after the new source; it now requires5 and both new trigger names and passes1/1. Driver/test scoped lint and driver syntax check pass. No guards are removed.

Actual fresh run: `node --import tsx scripts/test-t03-public-feedback-mariadb.mjs fixture-20261104032534-815db40e` passed **exit0**, proof `.test-artifacts/t03-followup/native-public-feedback-mw1vh8q1_2ed1.json`. NamespaceA `fixture_815db40e_public154a_mw1vh8q1_2ed1` performs the actual153→154 five-state transition; namespaceB `fixture_815db40e_public154b_mw1vh8q1_2ed1` imports the full1765 schema and uses the actual Node adapter/API. Original row-image hash remains `f84a59fd78df0ca6cb7e2138f181aee338496413839fa901cb660fef405a4d0d`; FKs stay enabled through transition, raw column metadata changes only by the already reviewed nullable/default pair, and invalid legacy JSON remains an explicit stop without normalization.

New required runtime flags `parentProofUpdateRejected`, `parentProofDeleteRejected`, `historicalActorAnonymization` are alltrue. The original public3 create/replay, current-reader authorization, object/scalar/case/request/version/origin negatives, first-publication transition, no identity provisioning/private audit body, and externalMailAttempts0 remain true. All38 recorded source hashes remain unchanged; Finance's27-dependency retention freeze is the input, not the older producer freeze. Finance separately reports41/41 memory and2/2 D1; those are not substituted for this Maria result.

Shutdown proof `native-public-feedback-mw1vh8q1_2ed1-shutdown.json`: PID3836, authenticatedShutdowntrue, stoppedtrue, forcedStopfalse; OS process absence independently checked. Heavy slot released. The initial plain-node invocation failed module resolution before the driver/server started; `native-public-feedback-v8.log` is retained as harness evidence, not a schema failure or pass. The actual successful log is `native-public-feedback-v8-tsx.log`.

No canonical/staging/remote database, real email/provider, production application, deployment or reset was touched. Public combined schema remains through152 pending explicit integration/release approval; candidate/native acceptance alone does not authorize deployment.

