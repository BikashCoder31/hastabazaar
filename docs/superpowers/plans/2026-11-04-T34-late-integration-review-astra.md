# T34 late integration independent review — 4 November 2026

**Changes requested: two confirmed queue-progress defects.** This review covers the frozen native form-health bridge, the two production privacy corrections, and the no-sale orderable-price history implementation. It is independent source review with one root-authorized, inspected memory-only reproduction. No production source, canonical database, Git state, provider, deployment or runtime configuration was changed. No browser, native D1/MariaDB, compiler, build, lint or global suite ran. AGENTS.md and LOCAL-START.md were read and respected.

The governing rules are the approved System health & records specification §3–4 (fresh scoped readiness versus genuine durable save evidence; retained stale evidence stays Unknown) and product discount guidance §4.1 (a genuine available past offer need not have a completed sale; exact comparable scope and explicit review; no highest-price selection or automatic expiry). The privacy review preserves the existing approved owner/staff exclusions and retention rules; it does not reopen legal policy.

## Findings

1. **P2 — native receipts can permanently block the save-ingestion queue.** `lib/operations/form-health.ts:53–57` bounds the oldest uncopied receipts before validating them. `lib/operations/native-form-health.ts:106–107` correctly rejects contact/location no-op acknowledgements as fresh saved changes, but nothing advances past those receipts. After a queue-sized set of these ordinary actions, later genuine native saves never ingest. Permanently invalid outcome references behave the same way. The reproduction invokes actual `saveProfileSupport` twice: no-op followed by changed save. Three supported `limit:1` scans return `[0,0,0]`; a single `limit:2` scan copies only the genuine changed receipt. The default limit has the same failure with100 preceding rejected receipts.

   Preserve no-op exclusion and immutable provenance. Use bounded keyset progress with durable resumption, or a scoped rejection/progress record; known-no-op filtering alone does not cover all validation rejections. Raising the limit only delays the failure.

2. **P2 — retained stale observations can permanently block the monitor queue.** `lib/operations/form-health.ts:67–70` likewise limits undelivered observations before skipping incompatible native versions. A stale observation is never delivered or advanced past. With enough retained stale rows in the same environment/release, current blocked observations never enter service health or incident evaluation. The separate reproduction inserts stale and then current blocked observations; three `limit:1` evaluations all return `scanned:0,budgetExhausted:false`, and no current observation is delivered.

   Filter current native versions before the queue limit, or provide bounded scan progress past incompatible history. Keep old observations retained and Unknown. Fixing receipt ingestion does not fix this second queue.

Both findings were sent to root immediately. Root/fresh implementer owns remediation. The diagnostic script deliberately asserts the defective behavior, so exit0 means reproduction confirmed, not application acceptance.

## Reviewed boundaries and limitations

- All16 bridge inventory entries and all12 price-history source/test entries matched their supplied SHA256 manifests at review. `reviewed-source-hashes.json` records those exact28 checks. Production privacy diffs and their actual current implementations were inspected, including the shared answer UNION builder, established ownership predicate, transaction guard and rollback conflict reader.
- No additional concrete correctness/security defect was established in the reviewed privacy change. Customer core receipts now enter the established export source; staff/foreign-owner filtering remains. The deletion batch rejects matching native proof before completion, including a receipt that appears immediately before the guarded batch. Core retention remains intentional.
- The native bridge retains server-bound original scope, action mapping, original audience, current source/version and native outcome validation. Metadata stays inside the genuine domain receipt transaction. Replays do not rewrite scope; source clocks and private payload exclusion remain intact. The mappings cover the21 save IDs and omit the five queries. Inspected native load wrappers surround the actual authorized loaders.
- The price implementation uses immutable server-observed moments of genuinely public/orderable offers, guards actual stock and seller readiness, and explicitly reviews the selected matching source. Same-timestamp history changes are covered by latest-ID plus count. Candidate/price binding, source choice and advisory-only behavior match approved §4.1. No additional concrete defect was found.
- Static incoming-reference search found the0155 replacement chain described by the implementation: review → cycle → advisory item, rebuilt leaf-drop/parent-rename with FK checks retained.0156 preserves observation/link rows and restores the four guards, with original command provenance separately retained. This source review establishes no specific D1 migration fix. The existing printed native failure names0155 but does not expose the nested cause; an authorized native run must capture it before changing the migration.
- After root announced the frozen native156 integration, its note, freeze and Maria156 companion were inspected. The suffix uses one guarded in-place CHECK alteration and retains provenance including historical NULL. Full generator/import/replay/PCRE/checkpoint/native behavior remains a separate gate. No claim is made that source inspection certifies the Maria155/156 candidates.

## Evidence

Artifacts: `.test-artifacts/t34/late-integration-review-astra-20261104/`.

- `source-review.json`: prioritized exact locations, reproduction logic, repair options, scoped no-additional-findings and engine gaps.
- `queue-reproduction.ts`, `.log`, `.exit.txt`: actual production functions against the inspected `companyStoreMakerFixture` (`node:sqlite :memory:`, all real migrations, foreign keys enabled); final exit0. The first artifact-only runs corrected an import path and fictional support-phone normalization setup before the final proof; no production code was changed.
- `reviewed-source-hashes.json`: original bridge/price inventory comparisons.

Command: `node --import tsx .test-artifacts/t34/late-integration-review-astra-20261104/queue-reproduction.ts`.

Remaining work: repair and regression-test both queues; capture the actual D1 cause in root's serialized native window; complete Maria155/156 native acceptance and root-owned integrated checks. Canonical local launch/data restrictions and deployment hold remain unchanged.
