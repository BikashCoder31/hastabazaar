# T27 customer refund bank-return source — 2026-11-03

Canonical checkout: C:/Users/abinash/Desktop/HastaBazaar. Source-only work; no canonical database, launcher, deployment, real bank service, seller contact, commit, seed, migration, restore or reset was used.

## Changes

- Reused the prior customer-refund-reversal domain module and initial test.
- Added generator `scripts/generate-customer-refund-reversal-source.ts`, SQLite source0140 and matching MariaDB source parity file.
- Native INSERT proof requires a completed original return_refund obligation, paid original outgoing packet with retained outgoing bank identity, exact NPR returned bank credit from the original customer into the same company account version after the original bank debit, original paid cash cap shared across reversal records, unique unused receipt, active nonconflicted Super Admin.
- Dispositions are append-only and unique per reversal. Retain links the exact receipt_return obligation/customer/cash and reserved or returned use. Restore links an existing liability correction with the same case, revision, actor and request.
- Native guards block further collection while the customer reversal is unresolved and prevent applying returned customer money to seller recovery or another receipt use.
- Extended the test to reissue the separately reserved returned cash through authenticated destination verification, fresh company funding, actual paid outcome and replay, asserting unchanged original seller refund entries.

## Evidence

`node --import tsx scripts/generate-customer-refund-reversal-source.ts` — passed; writes source files only.

`node --import tsx --test --test-concurrency=1 --test-name-pattern='native reversal proof' tests/customer-refund-reversal.test.ts` — passed 1/1 in disposable SQLite memory fixture. Fixture asserts every PRAGMA database_list file is empty.

`node --import tsx --test --test-concurrency=1 tests/customer-refund-reversal.test.ts` — latest result 1 passed / 1 failed at pending source blocker assertion, while root integrates source blocker. Actual reversal recording/replay and unchanged original paid/native facts pass before that assertion; full retry payment assertions remain unexecuted until source integration.

## Required integration / remaining verification

Root owns shared recovery source, guards, correction command, schema and MariaDB generator. Exported CUSTOMER_REFUND_REVERSAL_BLOCKER and pending SQL are ready. Source reads must expose pending boolean and blocker. Every command source guard must compare pending state to invalidate a racing command. Correction command optional customerRefundReversalId must bypass only the exact pending blocker, retain all other checks, and commit helper guards plus finish in the native correction batch. Include MariaDB parity source in shared schema generation.

Still required: full retain/reissue test green; restore/correction collected-money test and actual restoration payout; negative role/party/time/reused-receipt test matrix; MariaDB native validation; UI/history integration and complete journey verification. T27 is not marked complete.

## Updated verification after shared integration

`node --import tsx --test --test-concurrency=1 tests/customer-refund-reversal.test.ts` — **passed 4/4**, latest exit0, duration10871.8161ms. This supersedes the earlier expected blocker failure and the transient shared attribution-module import cycle (fixed by that module's owning agent).

Executed proof:

1. Returned customer credit recorded/replayed without rewriting original paid packet/native charge; explicit retain links receipt_return; verified retry destination and fresh independently evidenced company funding; actual completed customer reissue and replay; original seller charge unchanged.
2. Native mismatched amount, unknown packet, personal customer actor, credit predating original debit, duplicate receipt, update/delete history and unrelated retry obligation rejected.
3. Actual seller repayment20000, customer refund reversal, linked correction/replay to zero liability, exactly20000 restoration, actual completed restored seller payout/replay; original customer charge and original paid seller payout retained. Independent actual company funding was refreshed before the restored transfer.
4. Simultaneous incoming repayment reversal10000 and outgoing customer refund reversal: premature correction rejected; actual incoming bank attribution/replay resolves first while customer pending blocker and zero collectible balance remain; no fake retain disposition; linked responsibility correction then restores only the actual retained10000.

Root integrated the pending source flag/blocker, atomic source-state comparison, optional linked correction and exact-blocker bypass for incoming bank attribution. UI/command/schema/Maria integration remains owned by root. Native MariaDB/browser journey verification remains outstanding; T27 remains active.

## Protected UI, grouped correction and atomic original-cash pool

Additional owned files: `app/api/admin/refunds/route.ts`, `components/admin/refund-funding-review.tsx`, new `components/admin/customer-refund-reversal-review.tsx`, `lib/payments/refund-workspace.ts`, new API/browser/native test files under `tests/customer-refund-reversal-*`.

- Existing registered `system.refund-finance` form now supports `customer_reversal` and `customer_reversal_retain`; existing refund command audit/outcome recovery remains the source of truth.
- Completed original paid merchandise refunds are available for returned-credit recording. Candidate credits match original customer, company account version, later bank time, remaining original paid cash cap and unused verified NPR money. Restricted candidate transaction identities are returned only to Super Admin views.
- New recovery panel provides exact reserved original-customer reissue selection for retain, or an explicitly announced correction covering all listed pending returned credits. Grouped input must match the complete current pending set; missing, foreign, duplicate or mixed single/plural references fail. One existing native liability correction links multiple immutable dispositions; reversal uniqueness remains intact.
- Retain POST replay and GET outcome recovery recheck original personal-interest checks and current recovery case authority. New history recovery controls preserve opaque saved-attempt access after successful recording/retain/correction removes the original form from the refreshed UI.
- Source0140 now includes `customer_refund_return_pools`, an atomic counter keyed by the original paid packet. AFTER INSERT accumulation shares one retained cash cap across different receipt CASs without modifying the original paid packet. Native guards enforce cap/projection and retain the pool. MariaDB parity uses an atomic `ON DUPLICATE KEY UPDATE`; native MariaDB execution itself remains unverified here.

### Latest executed evidence

`node --import tsx --test --test-concurrency=1 tests/customer-refund-reversal-api.test.ts tests/customer-refund-reversal.test.ts` — **6/6 passed**, exit0, duration17021.4831ms, after grouped helper and pool changes. Covers original four flows plus exact grouped protected-command/parser/recovery behavior and real protected refund route checks.

`node --import tsx --test --test-concurrency=1 tests/customer-refund-reversal-native.test.ts` — **1/1 passed**, exit0, duration17013.0641ms, using explicitly authorized disposable Miniflare D1 cloned only from inspected SQLite memory data. Three independent half-size returned credits race one original paid cash cap: exactly two succeed, one is rejected; pool/SUM equals original cash. Successful attempts replay, then one grouped correction/replay writes two dispositions and restores exactly20000. Original paid packet stays paid.

`node --import tsx --test --test-concurrency=1 tests/customer-refund-reversal-browser.test.ts` — **2/2 passed**, exit0, duration19304.3802ms. Browser plugin not available; used the repository's esbuild + Playwright intercepted-request harness. Rendered record and retain forms hit actual protected refund API, lose success acknowledgements, reload, and recover without extra POST or money. Grouped correction form announces both pending credits, submits their exact IDs to actual recovery API, loses acknowledgement, reloads completed history and recovers one native correction/two dispositions. No pageerrors; opaque attempt storage clears after recovery.

Screenshot inspected: `output/customer-refund-reversal-mobile.png`,390px mobile viewport. It is the deliberately unstyled intercepted test harness, proving content/control availability; this is not full site CSS or canonical-preview visual verification.

Root global typecheck initially found only narrow test typings (unknown JSON outcomes and browser callback parameter); those were corrected. Root owns final global typecheck and aggregate integration evidence. No canonical database modification, deployment, real service, mail or seller contact occurred. T27 remains active pending the root's complete journey/integration audit.

## Final notice/history and retained-interest review

Final review found common seller notifications require a `seller_recovery_events` row whose revision equals the updated case and whose request ID matches the notice event. Recording a returned customer refund now updates each affected case with a revision CAS, appends `customer_refund_reversed` with publicMessage, and prepares common notices under a per-case suffixed request ID in the same batch. Retain now appends `customer_reversal_retained` at its next revision under the original request ID before notices. Root whitelisted both actions for public-safe seller history.

The service and source0140 native proof now additionally exclude retained original seller/customer interests from linked recovery snapshots and personal conflicts in the exact company account version. MariaDB source renders string snapshot IDs with JSON_UNQUOTE and array membership with JSON_CONTAINS. Negative tests replace current seller ownership while preserving the original snapshot, then prove the old interested seller cannot record the reversal through either service or native INSERT. A deliberately adverse company-account conflict snapshot is installed only in an inspected memory fixture, with all native guards restored before proving service/native denial. No reversal, pool or case event is created by denied attempts.

`node --import tsx --test --test-concurrency=1 tests/customer-refund-reversal-api.test.ts tests/customer-refund-reversal.test.ts` — **7/7 passed**, exit0, duration15620.97ms after final notice/history/interest changes. Assertions include exact matching next-revision events, one queued owner email and in_app notice for record and retain despite replay, seller statement publicMessage visibility, and no private evidence/reference leakage.

Native race test now conservatively retries only uncommitted stale-case revision attempts using fresh reads before proving the original packet cap. The actual independent returned bank credits remain separately recorded; failed attempts create no reversal or financial effects.

### Final rerun after notice and authority fixes

- `node --import tsx --test --test-concurrency=1 tests/customer-refund-reversal-native.test.ts` — **1/1 passed**, exit0,17201.1604ms. Includes actual native D1 retained-old-owner service/native INSERT denial, revised conservative case-CAS race retries, exact original cash pool cap, two history events and exactly four owner notices (email+in_app for each actual recorded partial credit) despite successful request replays, then one grouped correction/replay.
- `node --import tsx --test --test-concurrency=1 tests/customer-refund-reversal-browser.test.ts` — **2/2 passed**, exit0,8566.4129ms after final notification/retained-interest changes. Both use fully intercepted requests against in-memory fictional fixtures; no canonical preview or external service was launched.

The reserved native/browser slot is released. Customer-refund reversal sources are frozen for root final aggregate tests, generated-schema integration and typecheck.

### Final review: retained and current logical company-account interests on saved outcomes

Independent review found saved retain history/replay called original customer/current case/receipt authorization without the returned receipt account-interest helper. Saved-read authorization now selects the original obligation ID and executes `retainedReversalInterestGuards` in its own atomic guard batch. This adds no financial rows, debt, transfers, or new command outcomes. GET reports actual authorization errors as403 without returning the retained result.

The original retained account version's `conflicts_json` is immutable. Earlier fixture rewrites with native triggers temporarily disabled are hostile stored-state defense only; they do not demonstrate a supported eligibility change. The new regression instead invokes supported `saveCompanyAccountDraft` on the **same logical account**, adding the acting operator to a replacement version's declared conflicts while keeping the receipt-retained version unchanged and all immutable triggers enabled. The interest helper and source0140 native record/disposition eligibility checks now exclude interests on both the receipt-retained version and the logical account's latest version. Reading saved history does not require that latest draft to be verified.

The focused new service/API expectations were red on this reachable version replacement (service missing rejection, POST200 instead403). After repair, full memory/service/API plus scanner regression passed8/8,exit0,40451.6057ms. The API asserts retain replay403, saved GET403 with no outcome, original account conflicts unchanged, exactly one retained disposition and preserved original paid packet. Service coverage also preserves original ledger rows, one retain event, completed reissue facts, and rejects both direct saved authorization and replay after replacement. SQLite and Maria0140 artifacts were regenerated from the authoritative slice generator; shared combined regeneration belongs to root.

Native affected eligibility check: `node --import tsx --test --test-reporter=spec --test-name-pattern 'native current same-account interest' tests/customer-refund-reversal-native.test.ts` passed1/1,exit0,15446.4192ms. It proves supported account-version replacement with retained original conflicts unchanged; service record/retain authority rejection; direct source0140 INSERT rejection for a second valid actual returned credit and its otherwise linked retain disposition; and unchanged paid original/one original reversal/no disposition. The initial combined two-case native run failed before assertions in `nativeFinanceClone`'s atomic data-load batch with `fetch failed` in both fixtures. The filtered eligibility rerun passed without altering clone helpers or fixture/native safety guards. No MariaDB process was started.

Existing legitimate native cap/group flow rerun: `node --import tsx --test --test-name-pattern 'native competing returned credits' tests/customer-refund-reversal-native.test.ts` passed1/1,exit0,24148.9819ms. This confirms exact original paid cap serialization and grouped correction/replay still work under the added current-account exclusion. Native fixtures were disposed; no workerd or Maria server remains owned/running. Sources frozen and native window released for root global typecheck. These focused native successes were separate filtered runs, not a claimed fresh combined2/2 run.
