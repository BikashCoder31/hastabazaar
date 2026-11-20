# T24 legacy Finance/aftercare repair — 2026-11-03

## Scope and current verification

Repaired the25 aftercare/Finance failure groups from the current78pass/28fail legacy run. The three public catalogue/checkout failures remain assigned to root/T31; no readiness gate was stubbed. The full suite was not rerun during repair, as requested.

Final combined focused command used `node --import tsx --test --test-concurrency=1 --test-name-pattern=... tests/returns-complaints.test.ts`, selecting the original25 groups plus explicit subcase splits/new proofs. **33/33 passed,0skipped, exit0,121.744s**, captured at `.test-artifacts/t30/t24-repaired-focused-current.tap`. Its exact named results identify every selected case.

Exact focused command:

```powershell
node --import tsx --test --test-concurrency=1 --test-name-pattern="partial refunds allocate original shopping|seller earnings and payouts enforce|item return, refund liability|two seller parcels separate|R018 packing ordinary|Super Admin carrier remittance|Admin carrier submission|actual carrier receipt posting|F02 standard delivery refunds|F02 competing approval commands|F04 dual-role|F04 legacy NULL|F06 managed partial refund completion|F06 tiny partial refunds|F06 failed managed reversal|F08 cancelling the final inactive|F05/F06 fixed-supply|F05 historical standard payout|F06 first collected managed|F06 refund completed between accrual|F06 several unearned tiny|F04 high-value|F02 failed refund retains|F02 concurrent other-item|F02 competing failed-refund packet|T24 .*COD" tests/returns-complaints.test.ts
```
 The changed shared intake helper's existing replacement-stock race was checked separately: **1/1, exit0,6.988s**, `.test-artifacts/t30/t24-replacement-helper-regression.tap`.

The test file now has114 executed cases when run without a filter: the original106 plus three guest-COD proofs, one competing retry-packet proof, and four additional separately registered excess/role/payout-stage cases. This is the expected inventory, **not an unexecuted114-case pass claim**. All inspected targets allocate SQLite `:memory:`; no canonical DB, native/browser/global process, actual provider, transfer, activation or deployment was used. Root controls final global/native verification and the later complete run after the catalogue integration.

## Actual runtime defect found and narrowly fixed

The old remittance fixtures first failed because they tried to post a claim without independent company receipt. After recording real fictional company cash through `recordCompanyCashReceipt` and calling `reconcileCodReceipt`, legitimate guest orders still failed at commit. SQL `o.customer_id<>?` evaluates NULL for a guest. The JavaScript economic-party check allowed a guest, but its SQL commit proof rejected every guest.

Root authorized the narrow runtime correction in `lib/payments/cod-reconciliation.ts`: `(o.customer_id IS NULL OR o.customer_id<>?)`. No actor permission, receipt amount, source revision, independent seller/rider conflict, registered-customer exclusion or monetary cap was removed.

RED: the focused guest-success case failed with the rollback message; the first three lawful legacy remittance cases failed the same way. GREEN:8/8 in `.test-artifacts/t30/t24-cod-reconciliation-current.tap`, including valid actual guest receipt/replay, registered-own-customer SA denial, and role-loss/guest→own-customer source changes immediately before commit. Failure retains the pending claim and original verified company receipt, leaves its revision and parcel version untouched, and writes no allocation. Separate excess/demoted/suspended actual-posting cases now run independently; the original excess proposal can no longer mask both authority subcases.

Runtime file SHA256 at ownership freeze: `64A35C5B4C499F13E0D8ED78DB6D2ABCF73B397F0D05E0B775C5C6F0EEEB6FAF`.

## Repaired evidence and preserved invariants

- **Original carriage:** construct and retain the synthetic original order's real fair per-item allocation before intake. The cancellation cases construct the explicit original60k/two-store contract, invoke actual native whole-seller cancellation, preserve original60k and its immutable event, retain native40k adjustments and then record actual custody/collection. No direct edit to current totals impersonates a cancellation. Refunds require each exact saved share and cumulative40k remains bounded.
- **Ready race:** a newly Ready but unhanded portion becomes `review_requested`; actual `order_fulfillment_holds` exist, item state remains Ready, and no cancellation/stock release event is invented. The independent actor handles the positive final-parcel cancellation; a personal customer cannot perform staff cancellation on their own order.
- **Actual custody and cash:** old bare delivered/paid fixture labels are replaced with an explicitly constructed preparation point followed by native parcel assign/dispatch/collection/delivery commands before intake. Existing custody/partial-collection scenarios retain their source history. Deferred managed cases now commit real customer collection, then inject a failure in the separate post-cash worker batch to reach the unearned recovery/race state; they no longer write `collected_paisa` to pretend actual money arrived.
- **Refund funding/execution:** use authenticated fictional original customer instructions and verified contact, verified company account/independently evidenced free capital, approved exact packet, actual start and separately recorded bank outcome. Known failure has explicit no-debit evidence; unknown outcomes are not converted to failure or resent. Packet/outcome replay does not duplicate cash, wallet credit, stock or reversal.
- **Physical disposition:** the standard case records actual receive/inspect/restock before closing. Its stock assertion is original observed stock plus exactly one safe inspected return. SA waivers retain actual fictional reasons/evidence where appropriate. Financial payment and remaining physical work stay separate.
- **Original money/benefits:** partial refund restores the original shopping-credit/discount share once; remaining credit and caps remain tested. The historical12% commission base/reversal survives current fee settings. Merchandise reversal remains distinct from the exact separately evidenced original-delivery responsibility adjustment; the latter explains changed managed net balances rather than being ignored or charged as another merchandise reversal.
- **Fixed supplier and managed accrual:** customer refund leaves the single accepted fixed-price supplier obligation intact. The managed tests reach original cumulative tiny rounding/zero-delta consumption, competing accrual IDs, refund-between-pre-read-and-claim rollback, actual first-parcel cash versus final collection, post-commit retry and consumed-refund no-op proofs. Added delivery responsibility is asserted separately.
- **Payouts:** beneficiary/identity is independently verified before native payout preparation. Original reserved earnings are distinct from verified company capital. One eligible SA may approve/start/record the actual funded packet, including a confirmed no-debit failure and exact replay; packetless legacy start/payment remains refused. Approval/start/payment model-change scenarios are three independent tests, and the payment-stage mutation interleaves at commit without partial payout events.
- **Current actor/source races:** F04 requester, current owner, legacy NULL requester, high-value approve/reject and commit-time ownership changes now reach their original authorization guards instead of failing at missing delivery setup. No case-specific conflict was dropped.

## Two old expectations required explicit remapping

The original F02 delivery-capacity test attempted arbitrary amounts from a common pool, and a proposed replacement with two open cases for the same item was correctly refused by the one-open-case policy. The repaired test races two actual approval commands for the **same retained case**. One wins its exact original share; the loser leaves no refund/event/audit. Different items keep their own legitimate exact allocations.

The old failed-refund tests assumed failed payment released another item's global delivery entitlement. Current approved obligations and per-item provenance retain the original failed entitlement; only the known unsuccessful payment attempt/funding reservation is released. Tests now prove another item cannot steal it, lawful other-item approval and original retry remain distinct even when interleaved, one source obligation survives the fresh packet, and paid delivery totals remain40k. A separate actual simultaneous retry-preparation race proves one active packet and no losing receipt/reservation. This preserves the economic cap/race requirements without reinstating the obsolete pooled-allowance model.

## Fixture protocol corrections

The legacy TestD1 wrapper returned node:sqlite NULL-prototype rows, unlike the plain JSON object contract used by D1 and the actual mysql2 parser. A fresh command against an existing obligation therefore failed canonical JSON serialization even with valid content. The test wrapper now projects query rows into ordinary objects; canonical runtime validation was not weakened or edited.

The shared isolated `executeFixtureRefund` helper now reads its funding/bank timestamps from the actual fixture DB clock. A real tiny-refund run exposed a JavaScript/SQLite millisecond skew as a rejected future bank timestamp; no runtime future-date guard was relaxed.

## Canonical basis and remaining work

Read applicable T24–T28 mapped requirements: cancellation/return supplement§3–5,§7–10; manual payments§7–9 and acceptance matrix; Finance/payments§7–11; refunds-after-payout recovery§1–4; bank/identity/payout changes; and single-SA amendment§1–4. Original terms, benefits, personal conflicts, three linked financial records, simulation/live activation boundaries and all existing holds remain intact. The managed legacy fixtures do not establish live activation readiness.

The stale **Approve remittance** paired-screen affordance documented in the earlier reconciliation remains T31-owned. The three public catalogue cases and a final full114-case run remain due. Native/global/browser checks were not run by this agent; the authorized guest source fix must be included in root's final verification. No failing or masked requirement is waived.

Changed files: `lib/payments/cod-reconciliation.ts` (one predicate); `tests/returns-complaints.test.ts`; new helpers `legacy-cod-receipt.ts`, `legacy-return-money.ts`, `legacy-payout-capital.ts`; fixture-clock correction in `execute-fixture-refund.ts`; this note and the reconciliation addendum. No schema, UI, shared permission guard, canonical data or payment gate was changed.

## Remaining three catalogue cases — completed targeted follow-through

Root then authorized repair of the three remaining setup cases only. Read current Products/storefront and real-category/variant requirements. Reused `readyCheckoutSeller` for each actual fixture seller: independently reviewed fictional identity/PAN evidence and the exact retained owner/commission terms. These are original legacy flat SKUs, with no invented axes or synthetic selectable variants. Their existing supported legacy publication/cart path is exercised; no publication, stock, public visibility, payment capability or approval predicate is replaced.

Initial readiness repair:2/3 passed; the document case reached its next precise failure (`documents.length`1 rather than2). The old test equated delivery with cash. Added `legacy-checkout-fulfillment.ts`, which uses native parcel setup, assignment, dispatch, delivery and separately recorded actual fictional customer collection. It records no paid flag directly. The document case now proves an uncollected delivered order still has only its original statement, then exact collection/replay produces one paid receipt and preserves the original document, ownership, accepted terms, totals and fulfillment assertions.

The referral case also now uses actual custody, collection and independently received/reconciled company cash rather than direct delivered/captured updates. An intermediate real-protocol RED (`0` instead of5000) exposed the old missing remittance/actual-delivery clock assumptions. It now retains uncollected/unremitted negative checks and the full7-day window, earns once after the actual window/remittance, and preserves original referral/spend/cancellation amounts and wallet immutability. Physical event times are bounded after the actual checkout placement and reward boundaries follow actual delivery.

Final exact command:

```powershell
node --import tsx --test --test-concurrency=1 --test-name-pattern="referral checkout rewards only collected|mixed-seller checkout includes preparation|checkout retains accepted terms and issues immutable" tests/returns-complaints.test.ts
```

Result: **3/3 passed, exit0,12.291s**, `.test-artifacts/t30/t24-catalogue-readiness-current.tap`. Earlier RED is retained at `t24-catalogue-readiness-first.tap` and in the tool transcript. No runtime source or capability gate was changed, and no override was injected. These are native-domain memory tests, not an actual public API/browser availability or live-selling claim; paired public capability integration remains T31/root-owned. No full114-case, native, browser or global run was started. The test file and helper source are frozen for root's final typing and complete-suite run.

## Complete current suite — final authorized rerun

After final memory-target inspection and root authorization, executed the complete command without a name filter:

```powershell
node --import tsx --test --test-concurrency=1 tests/returns-complaints.test.ts
```

**114/114 passed,0fail,0skipped, exit0,343.865s.** Full output: `.test-artifacts/t30/t24-full-repaired.tap`. All seven owned source/test/helper hashes were unchanged through execution; retained snapshot: `.test-artifacts/t30/t24-full-repaired-source.json`. This supersedes the earlier78/106 current failure result as the complete repaired-suite checkpoint. No source was edited during execution and no guard was weakened to obtain it. This is complete memory-suite proof, not native/browser/public-route or deployment proof. Root's T30 native/typecheck checkpoint is independently reported by root; this agent did not start those processes.
