# T34 form source coverage correction — 2026-11-04

Scope: canonical `C:/Users/abinash/Desktop/HastaBazaar` only. Root authorized new source contracts/registry integration and precise attributes in the 17 unique UI files listed before editing in `approved-ui-ownership.json` (the initial rough count of 19 was corrected before edits). No canonical database access/change, launcher bypass, seeding, migrations, resets, restore, Git mutation, deployment, real mail/money, seller approval or video work. No browser, native D1/MariaDB, compiler, lint or build command ran in this worker.

Read AGENTS.md, LOCAL-START.md, current implementation progress, the approved Form Management reliability/field-inventory requirements and current T03 native/editor transition. Ordinary seven editors, existing 57 native tasks, prior source contracts, historical publications/answers and domain receipts remain. New source IDs do not rename or replace historical IDs.

## Diagnosis and correction

Original full-suite case 1313 reported 26 unidentified rendered forms. Reproduced locally: coverage plus original ID tests 7/8, one failure (`before.tap`).

- Three sites already declared correct conditional IDs through local `const` bindings. The scanner accepted direct conditionals and literal constants but rejected a constant initialized by a conditional. Added failing tests first (`scanner-red.tap`, 1/2), then recursively resolved only literal/conditional constant initializers in their actual lexical scope. Imported/mutable/computed/shadowed IDs, undefined branches, direct aliases and cycles still fail closed. Scanner GREEN 2/2.
- Two incident forms already submit through `staff.incident-review`; only their explicit attributes were absent.
- Remaining 21 sites needed reviewed native/query inventory. Added 26 source contracts (5 queries and 21 native records because conditional wrappers have distinct routes), all mapped to real receiving pages/routes and native owners. Four queries are actual GET filters; the commercial preview is an actual read-only POST calculation. Saved document, identity, profile, address and preparation workflows retain their operation/identity/collection modes and native records. They are not relabeled generic controls.
- `answerBehavior: none` explicitly means no generic answer snapshots, not discarded domain data. Required reason/evidence, ownership, authorization, native version/recovery and existing domain history remain in the original implementation. All generic custom fields are refused for these new contracts. Existing bank-review and maker-profile IDs and their runtime behavior remain intact.
- Each of the 17 UI files changed only its `data-form-id` attribute(s). No submit payload, requiredness, field rendering, command handler or recovery algorithm was altered.
- The old policy test still expected a bank-review `<form>` inside seller-bank-review although it now renders the protected wrapper. Updated the expectation to the actual shared wrapper and all four explicit branches. Historical source counts are lower bounds alongside the exhaustive no-exemption scan, not a fixed barrier against newly approved forms.

The historical exception ledger remains empty. No source path or form was exempted. Current scan: **169 rendered sites, zero unidentified forms**. `source-map.json` records current ordinals, all actual IDs, fingerprints and native owner/route/field/storage declarations.

## Exact original 26 sites

| Original source site | Cause | Current declared IDs |
|---|---|---|
| `app/admin/system-health/records/page.tsx:20` | Missing native/query source contract or attribute | staff.system-records-filter |
| `components/admin/commercial-combination-preview.tsx:66` | Missing native/query source contract or attribute | staff.commercial-combination-preview |
| `components/admin/incident-workspace.tsx:238` | Existing native adapter; missing attribute | staff.incident-review |
| `components/admin/incident-workspace.tsx:488` | Existing native adapter; missing attribute | staff.incident-review |
| `components/admin/manual-payment-review.tsx:33` | Missing native/query source contract or attribute | staff.incoming-payment-filter |
| `components/admin/protected-review-form.tsx:62` | Missing native/query source contract or attribute | staff.seller-bank-review, staff.protected-change-permission, staff.protected-identity-review, staff.protected-change-disposition |
| `components/admin/public-profile-review.tsx:30` | Missing native/query source contract or attribute | staff.public-profile-review |
| `components/admin/public-profile-review.tsx:40` | Missing native/query source contract or attribute | staff.public-profile-correction-request |
| `components/admin/public-profile-review.tsx:46` | Missing native/query source contract or attribute | staff.public-profile-history-reconciliation |
| `components/admin/refund-funding-review.tsx:36` | Missing native/query source contract or attribute | staff.refund-funding-filter |
| `components/admin/seller-document-review.tsx:88` | Missing native/query source contract or attribute | staff.seller-document-review, staff.seller-document-change-permission |
| `components/admin/team-workspace.tsx:32` | Missing native/query source contract or attribute | staff.team-people-filter |
| `components/commerce/finance-evidence-upload.tsx:28` | conditional const resolution | system.refund-evidence, system.finance-evidence |
| `components/commerce/gift-card-form.tsx:18` | conditional const resolution | commerce.gift-card-issue, commerce.gift-card-redeem |
| `components/commerce/order-preparation-workspace.tsx:84` | Missing native/query source contract or attribute | staff.order-preparation, seller.order-preparation |
| `components/commerce/order-preparation-workspace.tsx:110` | Missing native/query source contract or attribute | staff.order-preparation, seller.order-preparation |
| `components/commerce/recovery-action.tsx:17` | conditional const resolution | system.recovery-finance, system.recovery-seller |
| `components/seller/document-change-request-form.tsx:36` | Missing native/query source contract or attribute | seller.document-correction-upload, seller.document-replacement-upload, seller.document-change-request |
| `components/seller/profile-contact-locations.tsx:17` | Missing native/query source contract or attribute | seller.public-support-contacts |
| `components/seller/profile-contact-locations.tsx:20` | Missing native/query source contract or attribute | seller.operational-locations |
| `components/seller/protected-change-request-form.tsx:21` | Missing native/query source contract or attribute | seller.protected-change-request |
| `components/seller/protected-change-withdrawal.tsx:20` | Missing native/query source contract or attribute | seller.protected-change-withdrawal |
| `components/seller/protected-identity-form.tsx:30` | Missing native/query source contract or attribute | seller.protected-identity-upload |
| `components/seller/public-profile-editor.tsx:26` | Missing native/query source contract or attribute | seller.public-profile-withdrawal |
| `components/seller/public-profile-editor.tsx:49` | Missing native/query source contract or attribute | seller.public-profile-correction |
| `components/seller/public-profile-upload.tsx:17` | Missing native/query source contract or attribute | seller.public-profile-media |

## Verification

Artifacts are in `.test-artifacts/t34/form-catalog-coverage-astra-20261104/`.

- `final-coverage.tap`: **25/25 pass**, zero skipped, exit 0, 30.571s. Actual coverage, policy, conditional-ID and new source tests. Exact command: `node --import tsx --test --test-concurrency=1 tests/form-catalog-native-sources.test.ts tests/form-catalog-policy-ids.test.ts tests/form-catalog-policy.test.ts tests/form-catalog-coverage.test.ts`.
- The actual-source negative test removes each newly covered native/incident attribute from an isolated copy of the real UI file and requires its exact line to become an unregistered form violation. It does not mirror an implementation snapshot. Receiving-route import/re-export graphs must reach their declared native owners. New entries cannot invent core contract versions, custom questions, or generic private-answer snapshots.
- `final-native-source.tap`: final test-source cleanup rerun **3/3 pass**, exit 0, 6.707s. Includes actual disposable-memory `readFormHealth` for every new ID: all Unknown, no load/save evidence, zero observations or answers. Inventory alone never certifies compatibility or successful durable save.
- `native-memory.tap`: **32/32 pass**, zero skipped, exit 0, 173.344s. Exact command: `node --import tsx --test --test-concurrency=1 tests/form-catalog-native-sources.test.ts tests/native-task-form-contracts.test.ts tests/public-profile-contact-locations.test.ts tests/protected-identity-change.test.ts tests/order-preparation-proof.test.ts tests/seller-document-review.test.ts tests/commercial-combination-preview.test.ts`. Preserves the seven ordinary editors, required retained extensions and first-publication atomic rollback, native payout receipt/replay/guest restrictions, public-contact consent versus private security destinations, independent private operational addresses, identity evidence/current authority/holds, preparation original outcome/role revocation and independent document scope/replacement review.
- `source-sha256.json` freezes the changed source/tests, all original affected UI paths, native owner modules and receiving paths. Runtime domain modules are included as inspected dependencies, not claimed edits.

## Bounds and adjacent finding

This repairs source coverage and its precise inventory. It does not manufacture the generic core-receipt or health instrumentation absent from a feature's original native path. New native entries remain Unknown until genuine scoped load/version/save evidence exists; authoritative native records are retained. The scoped tests above are not a full release, all-route/browser or engine-parity claim. Root owns full-suite reconciliation and any compiler/lint/build/native-engine runs.

The ancillary original query group (`policy-query-first.tap`) exposed a separate handcrafted product fixture missing `product_publication_links` in `tests/form-catalog-query.test.ts` (minimum-price results/count). This was reported to root for the commerce fixture owner; that file and product source were not changed here. Its other initial failure was the now-corrected stale bank-form location. No production save-path defect was identified in this source-coverage slice, and no known defect was hidden with a source exemption. The required native health integration gap below remains explicitly open; passing source coverage does not close it.

## OPEN: required native health integration for the 21 newly inventoried save IDs

This source correction is **not full native form-health acceptance**. The controlling [System health specification §3](../specs/2026-10-31-system-health-records.md#3-health-meanings-checks-and-targets) requires separate essential-form loading/readiness and real business-workflow evidence; its exact instruction is “End-to-end save evidence comes from isolated authorized test journeys matching the release/configuration, or confirmed ordinary successful use.” Section4 requires entries to show owner, authority and current compatible version. [Implementation6, T30 step6](2026-11-01-implementation-6-verification.md#t30-finish-team-system-health-incidents-and-audit-records) requires: “Show Form Management health from real submissions and persisted outcomes, not only metadata existence.” Thus permanently Unknown source declarations are not an implementation substitute. The explicit Unknown test prevents false green while the missing bridge is completed.

The `D9` decision named in the controlling October31 sources specifically concerns the standard payout purpose and separate optional note; this correction changes neither, and D9 does not exempt other native workflows from the health requirements. [Field inventory §8](../specs/2026-10-30-form-management-field-inventory.md) supports retaining tasks, endpoints, records and historical identifiers under native ownership; it does not authorize omitting their required health evidence.

Current `lib/operations/form-health.ts::ingestCommittedFormSaves` consumes only `form_answer_sets` and `audit_logs.action='form.core_answers'` with originally captured environment/release. The newly identified native paths already persist genuine command receipts through `lib/workflows/contracts.ts::commandReceipt`, but these receipts are not mapped/scoped for form health. They must not be relabeled as generic answers or retrospectively stamped with the scanner's current environment/release.

| Native IDs | Existing real receipt/commit boundary | Minimal exact mapping |
|---|---|---|
| seller.document-change-request; seller.document-correction-upload; seller.document-replacement-upload; staff.seller-document-review; staff.seller-document-change-permission | `lib/sellers/document-review.ts::documentCommand` batches actual outcome with audit command receipt | `seller.document.command.request`, `unverified_correction`, `replacement`, `review`, `permission`; retain original document/request identity and reviewed revision |
| seller.protected-change-request; seller.protected-change-withdrawal; seller.protected-identity-upload; staff.protected-change-permission; staff.protected-identity-review; staff.protected-change-disposition | `lib/sellers/protected-change-requests.ts::protectedCommand`; evidence-only uses the real receipt directly in `protected-change-policy.ts`; payout retirement delegates through `protected-payout-disposition.ts` | `seller.protected_change.requested`, `withdrawn`, `identity_submitted`, `permission`, `identity_verified`, plus disposition actions `hold_disposition`, `bank_revalidated`, `evidence_only`, `packet_retired`; retain exact case/evidence revision |
| seller.public-profile-withdrawal; seller.public-profile-correction; seller.public-support-contacts; seller.operational-locations; seller.public-profile-media; staff.public-profile-review; staff.public-profile-correction-request; staff.public-profile-history-reconciliation | `lib/sellers/public-profile-workflow.ts::command`, reused by corrections, contact/locations and media | `seller.public_profile.withdrawn`, `correction_requested`/`correction_answered`, `support_saved`, `locations_saved`, `media_uploaded`, `reviewed`/`correction_reviewed`, `staff_correction_requested`, `legacy_history_reconciled`; retain exact revision and media outcome |
| seller.order-preparation; staff.order-preparation | `lib/orders/response-cases.ts::command` | `order.response.issue.reported` and `followup.recorded`; capture original server audience, exact portion/case/item scope and revision. Never infer original seller/staff route from later mutable roles |

Required bounded implementation:

1. Map each real native command to an explicit versioned native source contract and original authorized server route/audience. Capture sanitized source/version/environment/release provenance in the **same guarded atomic batch** as the actual domain outcome and its existing command receipt. Keep original command digest/replay semantics; do not add an invented publication, empty generic answer or second business action.
2. Ingest only confirmed original native outcome references with their original scope/clock. Private reason, PAN/identity facts, contact/address content, document/media paths, evidence and command-result payloads never become technical diagnostics. Use explicit source-authorized readers for drill-down.
3. Extend the observation source model honestly: source0151 currently permits only `runtime`, `form_answer_set`, `core_receipt`, so a genuine native-command evidence kind requires a separately reviewed additive schema/adapter design preserving all retained observations and guards. No canonical schema change is authorized here, and no new migration number was claimed while source0155 is owned elsewhere.
4. Add real contract-loading/compatibility and failure observations at the authorized native loader boundaries; readonly compatibility cannot become successful submission. Five query-only IDs must not manufacture save receipts; their truthful readonly checks are separate.
5. Prove atomic rollback produces no saved observation; committed lost-response replay deduplicates; private owner/current staff authority and source-version mismatch stay enforced; old unscoped receipts remain Unknown; stale or foreign-release evidence cannot turn health green; isolated load/save/version evidence and relevant native-engine parity are tied to exact source hashes.

Root was notified of this concrete T30 integration gap and shared receipt boundary before handoff. No further runtime/schema mutation was made pending coordinated ownership. This note closes only the identified source-policy failure; native health acceptance remains OPEN.
