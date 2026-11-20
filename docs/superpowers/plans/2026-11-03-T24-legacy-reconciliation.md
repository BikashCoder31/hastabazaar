# Current T24 legacy-suite reconciliation — 2026-11-03

## Actual result

Command: `node --import tsx --test --test-concurrency=1 tests/returns-complaints.test.ts`.

**78 passed,28 failed,0 skipped /106; exit1;404.029 seconds.** Full output: `.test-artifacts/t30/t24-legacy-current.tap`. Exact failing names/errors/current test lines: `.test-artifacts/t30/t24-legacy-current-failures.json`.

This replaces the stale92/106 checkpoint as the current full-run result. The file spans auth, catalogue, delivery, cancellation, aftercare, COD, payouts, refunds and managed accounting; it is not exclusively a T24 unit suite. Its fixture explicitly opens `new DatabaseSync(':memory:')`, loads current source migrations and uses transactional TestD1 wrappers. Typed fake-provider helpers are already present. No canonical database, native/browser/global process, provider/network, real money or source fix was used for this reconciliation.

## Exact failure groups and interpretation

| Tests | Count | Current symptom | Reconciliation |
|---|---:|---|---|
|10,21,22|3|`One or more cart items changed availability. Review your cart and try again.` at checkout.|Old fixture inserts published product rows but does not establish current catalogue/seller readiness. Cart visibility/readiness rejects them before the intended referral/delivery/document assertions. Fixture setup drift; the downstream assertions remain unverified. Establish actual fictional current seller/evidence/terms/public product readiness, preserving the original historical order snapshots.|
|11|1|`refund_requires_actual_execution_packet` at direct `UPDATE refunds SET status='paid'` (line878).|Packetless SQL payment is intentionally fenced by source0105. Use the real fictional funding/destination/statement/approval/execution/outcome protocol. Do not remove the guard or substitute approval/reference for actual payment.|
|26,93|2|`Use the original verified payout execution packet and actual bank outcome.`|Legacy payout `start_processing`/payment methods are retired. Test93 expects an older CHECK failure but correctly receives the new earlier refusal. Use T26 packet protocol and retain mixed-managed-payout rejection proof; the old maker/checker labels do not reinstate a distinct-person requirement.|
|29,79,80,82,83,86,88,89,92,94,95,96,97,98,99,100|16|`Reconcile the original saved delivery allocation before approving this refund.` at `returns.ts:1110`; some assertions instead expect older capacity/ownership errors.|The fixture has a positive original delivery charge but no complete saved per-item allocation/cancellation adjustment provenance. F02 directly edits current totals without the native allocation history. The new original-allocation guard stops these cases before refund execution, recovery rounding, actual ownership/race or rollback assertions. These16 outcomes are **masked/unverified**, not proof those downstream behaviors pass or fail. Build lawful original/cancellation allocations and actual packet/physical facts, then rerun every original assertion.|
|39,74,77,78|4|39/77: actual company receipt and deductions must be matched in Incoming payments.74: actual `pending`, expected `posted`.78: first excess `propose_remittance` accepts a pending claim rather than the expected rejection.|A remittance claim/reference is no independent company receipt, even when submitted by SA. Current source deliberately keeps proposals pending and creates a Finance exception. Actual matched receipt/allocation and approved costs are needed for posting.78 stops in its first `excess` iteration: later demotion/suspension cases did not execute. Split proposal retention from actual-posting capacity/authority races; retain all race coverage.|
|67|1|`Missing expected rejection` at line5723 after packing→Ready while using the old fingerprint.|Current code explicitly converts a newly review-required request to `review_requested`; it does not execute cancellation/stock release. Ready is not physical handoff and the approved policy permits a scoped cancellation request/hold. Reconcile this stale direct-cancellation expectation with actual review/hold facts and the paired screen's changed-action message. Do not restore blanket Ready denial or allow stale direct economic execution.|
|90|1|`An eligible reviewer without a personal customer or supplier interest must decide this case.` at final-parcel cancellation.|The fixture assigns `orders.customer_id='admin-1'` and then asks that same Admin to perform staff cancellation. Current economic-party guard correctly refuses. Use a separate eligible reviewer for the positive delivery-clock path and retain a separate negative personal-interest case.|

Mail/retry cases5–6 and the final expiration cases105–106 pass with current typed delivery fixtures. The repaired replacement-stock race81 passes. Dedicated physical lifecycle/native/browser suites were not rerun here; no inference of current physical-suite closure is made from this legacy result.

## One concrete screen behavior gap, separate from fixture drift

`components/admin/parcel-controls.tsx:171–188` still renders **Approve remittance** for a pending cash record and sends `approve_remittance`. `lib/operations/parcels.ts:946` unconditionally refuses that action and requires an actual company receipt/deductions match in Incoming payments. This is a source-proven dead end in the paired screen, rather than evidence that the protective financial guard should be relaxed. T31 should replace it with an exact authorized Incoming payments/receipt-matching destination and show claimed/pending versus independently received/posted. Retain the current own-rider release hold and user/party restrictions. Actual browser verification remains due.

By contrast, current payout controls filter old direct processing/payment actions and link to `/admin/payments/payouts`; current return controls filter packetless refund actions and the return page links to `/admin/payments/refunds?case=...`. Those old legacy API calls alone do not prove a remaining payout/refund screen dead end.

## Approved rules retained

Controlling sources are cancellation/return supplement§3–5,§7–10; Finance/payments§1,§7–11; and the later single-Super-Admin amendment§1–4.

- Ordinary eligible unpaid COD confirmed/packing whole-seller portions can cancel after fresh direct preview/confirmation. Ready but unhanded goods require the scoped request/hold and staff review; actual carrier handoff requires interception/return handling. No label pretends custody or automatically restores stock. Reassignment, carrier delay and review do not reset original case age.
- Company funds approved reverse carriage and eligible attributable original delivery, preserving saved allocations/cumulative caps. Missing historical facts require reconciliation. No guessed allocation, customer penalty or no-fault seller debt is introduced to satisfy a test.
- Receipt, inspection/disposition, authorized refund and actual refund remain separate. Paid money does not fabricate receipt/restock/replacement delivery; legitimate SA refund-without-return needs actual evidence. T25 funding/execution packets and uncertainty safeguards remain mandatory.
- One **eligible current** SA may prepare/approve/record covered Finance stages. This removes the arbitrary distinct-person requirement; it does not remove permission, original source, party-conflict, funding, bank/destination, evidence, version, race, real receipt or actual transfer checks. A proposal/approval never moves money.

## Proposed nonoverlapping continuation

1. **T31 paired-screen owner:** fix the concrete parcel remittance dead end and existing audited form-read/role/context gaps. Own screen/form-read and protected destination changes, with real mounted route/browser tests using published forms/current authority. Do not edit accounting/funding guards or silently claim these28 failures fixed.
2. **T34 catalogue fixture owner:** repair only test10/21/22 catalogue/contact/current seller readiness in the isolated helper or specific cases, preserving actual historical snapshots and intended cart totals; then rerun their original assertions. Coordinate common fixture changes before touching the shared106-test file.
3. **T34 Finance/aftercare integration owner:** own the remaining25 legacy cases and shared financial fixture adapters. Establish immutable original delivery allocations, native cancellation adjustments, company statements/current funding, real packet execution and actual physical facts; migrate retired method calls to the supported protocol. Preserve economic-party negatives and all masked race/reversal/rounding assertions. Separate current claim-only remittance tests from actual verified posting and current-role races. Reconcile Ready-review expectation explicitly without weakening source guards.
4. **Root verification owner:** rerun the full106-case command after targeted GREEN cases and coordinate T33 native/T34 browser/global checks. Record actual final pass/fail/skip with source identity; this read-only report closes only the stale verification question, not T24/T25 or all20 delivery scope.

No application/test source was changed by this reconciliation. Only this report and current test-output artifacts were written.

## Subsequent authorized repair checkpoint

The25 non-catalogue groups were subsequently repaired through real isolated domain protocols. Focused verification is33/33 GREEN (plus replacement-helper regression1/1); see `2026-11-03-T24-legacy-repair.md`. This is not a replacement full-suite pass claim: the old full run above is before those repairs and the complete114-case inventory has not been rerun. Three catalogue cases remain root/T31-owned.

The lawful remittance repairs exposed an additional actual runtime defect hidden by the old retired-method setup: guest `customer_id=NULL` failed the reconciliation commit predicate. Root authorized a narrow NULL-aware conflict correction; valid guest, registered own-party denial and commit-time role/source races passed. Therefore the original remittance failures were not exclusively fixture drift after the legitimate receipt path was exercised. The paired-screen stale remittance button remains separate and unresolved here.

The remaining three catalogue setup cases were subsequently authorized and repaired with actual seller readiness and native custody/collection/remittance facts: targeted3/3 GREEN, with original checkout/cart/rounding/stock/document assertions retained. See the final follow-through in `2026-11-03-T24-legacy-repair.md`. A complete114-case current run remains due; no full-suite pass is inferred from the targeted groups.

Final root-authorized complete rerun after the repairs: **114/114 passed,0fail,0skipped, exit0,343.865s**, `.test-artifacts/t30/t24-full-repaired.tap`; all seven owned source/test/helper hashes unchanged. This supersedes the earlier full-run failure checkpoint and the pending-full-run statements above. Detailed repair/current verification evidence is in `2026-11-03-T24-legacy-repair.md`. Actual public capability/API/browser integration remains separately T31-owned.
