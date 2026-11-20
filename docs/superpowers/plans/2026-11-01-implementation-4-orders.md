# Complete version — Publication, checkout and orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Prepared 1 November 2026. Documentation only; implementation remains on hold until the user resumes it. This is part 4 of one release, not a separate release.

**Goal:** Complete the ordered tasks below against their approved source requirements.

**Architecture:** Extend the existing repositories, guards, feature-owned forms and shared projections. Use the [orchestration plan](2026-11-01-complete-version-implementation.md) for cross-task contracts and policy precedence.

**Tech Stack:** Existing React 19 / vinext / TypeScript application, Drizzle schema, D1/SQLite and native MariaDB adapter, Node test runner and approved browser tools.

**Spec:** [All 20 workstreams](2026-10-31-complete-version-scope.md); each task lists its canonical sources. The source requirements remain controlling when a short task summary omits detail.

## Global Constraints

Read the [orchestration constraints](2026-11-01-complete-version-implementation.md) and [new-chat handoff](2026-11-01-new-chat-handoff.md) first. No code, data, release or live record changes are performed by preparing this plan. During implementation preserve the canonical checkout and dirty checkpoint; do not seed/reset/migrate existing local data to pass startup. Update the [progress ledger](2026-11-01-implementation-progress.md) with evidence after each task. Planned filenames are exact intended locations; if an existing implementation already provides the responsibility, record that mapping and reuse it rather than duplicate it.

## Review Focus

Apply the five failure modes in the orchestration plan to the owning tasks below. Test actual state/transactions, not only source-text patterns. Existing targeted tests are starting coverage, not proof that the new cases are already implemented. New test files must be written before their related new behavior. Do not create artificial red tests for unchanged, already-proven behavior.

## T18. Implement complete product review, publication and published edits

**Workstreams:** V06, V03. **Depends on:** T10, T13, T17.

**Canonical requirements:** [2026-10-30-products-storefront-workspace](../specs/2026-10-30-products-storefront-workspace.md); [2026-10-31-published-product-edit-rules](../specs/2026-10-31-published-product-edit-rules.md).

**Files**

- Inspect/reuse; modify only where required: [app/admin/products/[id]/page.tsx](../../../app/admin/products/[id]/page.tsx); [components/admin/product-review-actions.tsx](../../../components/admin/product-review-actions.tsx); [lib/db/repositories/products.ts](../../../lib/db/repositories/products.ts); [lib/products/eligibility.ts](../../../lib/products/eligibility.ts).
- Create if not already supplied by a verified equivalent: `tests/product-publication-revision.test.ts`.
- Test: `tests/product-publication-revision.test.ts` (planned); [tests/product-revision-concurrency.test.ts](../../../tests/product-revision-concurrency.test.ts); [tests/managed-maker-public-listings.test.ts](../../../tests/managed-maker-public-listings.test.ts).

**Interfaces:** Consumes complete candidate revision, accurate cover, offer evidence and SellerCapabilities. Produces guarded Approve & publish, Approve only, request changes/reject and auditable publication/revision outcomes.

**Behavior and acceptance cases**

- [ ] Approve candidate A while seller saves B cannot publish unreviewed B.
- [ ] Price change remains candidate until approved; stock decrement and pause do not overwrite pending content.
- [ ] Published browse-only product is public but all ordering paths remain gated.
- [ ] Double-click or uncertain response yields one publication/audit/event and a recoverable known result.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Review the whole exact candidate, each included offer, public claims/price/media and category evidence. One accurate cover is enough; occasions remain optional.
- [ ] 4. Approve & publish is the primary approved action; optional approval-only stays distinct. Product visibility can precede ordering when commercial/fulfillment gates remain unmet.
- [ ] 5. Use approved field classification: substantive price/public-content/offer changes need review, while supported stock/pause actions take effect through their guarded operational path. Keep old approved version public during review.
- [ ] 6. First published-product revision review within one service day; diff current/candidate, preserve seller corrections and history, invalidate relevant public cache/metadata on actual publication.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/product-publication-revision.test.ts tests/product-revision-concurrency.test.ts tests/managed-maker-public-listings.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T18's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T19. Align public discovery, product, shop and cart presentation

**Workstreams:** V08, V20. **Depends on:** T09, T13, T16, T18.

**Canonical requirements:** [2026-10-31-seller-customer-screen-walkthrough](../specs/2026-10-31-seller-customer-screen-walkthrough.md); [2026-10-31-retail-categories-product-variants](../specs/2026-10-31-retail-categories-product-variants.md).

**Files**

- Inspect/reuse; modify only where required: [app/shop/page.tsx](../../../app/shop/page.tsx); [app/products/[slug]/page.tsx](../../../app/products/[slug]/page.tsx); [app/makers/[id]/page.tsx](../../../app/makers/[id]/page.tsx); [app/cart/page.tsx](../../../app/cart/page.tsx); [components/catalog/product-card.tsx](../../../components/catalog/product-card.tsx); [components/commerce/cart-view.tsx](../../../components/commerce/cart-view.tsx); [lib/products/truthful-presentation.ts](../../../lib/products/truthful-presentation.ts).
- Create if not already supplied by a verified equivalent: `tests/public-offer-consistency.test.ts`.
- Test: `tests/public-offer-consistency.test.ts` (planned); [tests/managed-maker-product-presentation.test.ts](../../../tests/managed-maker-product-presentation.test.ts); [tests/product-buy-now.test.ts](../../../tests/product-buy-now.test.ts).

**Interfaces:** Consumes published public projection and selected OfferSnapshot. Produces consistent public cards/details/search/cart/metadata with exact purchase eligibility and preserved cart choices.

**Behavior and acceptance cases**

- [ ] A price/variant/publication change updates cards, detail, metadata and cart consistently.
- [ ] Browse-only product has no working buy/add-to-cart bypass via client or direct endpoint.
- [ ] An unavailable line does not erase other sellers' cart items.
- [ ] Public projection never leaks private evidence through HTML, JSON, image routes or fallback content.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Inventory all public consumers, including homepage, related products, feeds/metadata, images and shop fallback. Remove assumptions that every seller/product is handmade; retain existing language policy.
- [ ] 4. Show actual selected variant price/discount/availability, clear options and truthful unavailable/browse-only states. Avoid displaying one variant's cheapest discount as every variant's price.
- [ ] 5. Keep buyer-facing business/legal-seller facts appropriate; hide private PAN, citizenship, operational address, beneficiary evidence and seller costs.
- [ ] 6. Preserve mixed-seller cart and valid inputs when one line changes, retires, sells out or becomes held; explain affected lines and provide safe choices.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/public-offer-consistency.test.ts tests/managed-maker-product-presentation.test.ts tests/product-buy-now.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T19's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T20. Carry immutable offers and policy snapshots through checkout

**Workstreams:** V08, V20, V14. **Depends on:** T13, T14, T15, T19.

**Canonical requirements:** [2026-10-31-seller-customer-screen-walkthrough](../specs/2026-10-31-seller-customer-screen-walkthrough.md); [2026-10-31-retail-categories-product-variants](../specs/2026-10-31-retail-categories-product-variants.md); [2026-10-31-manual-payment-rules](../specs/2026-10-31-manual-payment-rules.md).

**Files**

- Inspect/reuse; modify only where required: [app/api/checkout/route.ts](../../../app/api/checkout/route.ts); [lib/checkout/reviewed-quote.ts](../../../lib/checkout/reviewed-quote.ts); [lib/checkout/validation.ts](../../../lib/checkout/validation.ts); [lib/db/repositories/orders.ts](../../../lib/db/repositories/orders.ts); [components/commerce/checkout-form.tsx](../../../components/commerce/checkout-form.tsx); [db/schema.ts](../../../db/schema.ts).
- Create if not already supplied by a verified equivalent: `tests/checkout-offer-policy-snapshot.test.ts`.
- Test: `tests/checkout-offer-policy-snapshot.test.ts` (planned); [tests/checkout-reviewed-quote.test.ts](../../../tests/checkout-reviewed-quote.test.ts); [tests/checkout-config-recovery.test.ts](../../../tests/checkout-config-recovery.test.ts).

**Interfaces:** Consumes reviewed quote, offers, capability/hold state and accepted terms versions. Produces committed immutable order-line identity, selected options, prices, fees, seller/model, fulfillment/address, benefit and tender snapshots.

**Behavior and acceptance cases**

- [ ] Two buyers contesting the last unit produce one reservation; replay produces one order.
- [ ] New hold or commission start between quote and commit is rechecked; old committed orders retain their snapshots.
- [ ] Mixed-seller partial failure preserves customer input and offers a new explicit quote without silent repricing.
- [ ] Order/invoice/return lookup resolves the exact historical offer even after it is retired.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Revalidate authoritative selected offer, stock, price, permission/holds and terms at commit; preserve customer entry when a new quote must be reviewed.
- [ ] 4. Reserve real per-offer units once and atomically commit order/tender/benefit allocations. Separate order creation, payment evidence and fulfillment actionability.
- [ ] 5. Retain original rates/terms/selected options through later payment, product edits and seller identity changes; use snapshots in invoices, seller views and customer order detail.
- [ ] 6. Keep manual-payment/COD options inactive until the corresponding route's T21 evidence is ready; reject unsupported methods rather than simulating production success.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/checkout-offer-policy-snapshot.test.ts tests/checkout-reviewed-quote.test.ts tests/checkout-config-recovery.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T20's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T21. Implement manual receipts, payment deadlines and COD reconciliation

**Workstreams:** V11, V08. **Depends on:** T11, T20.

**Canonical requirements:** [2026-10-31-manual-payment-rules](../specs/2026-10-31-manual-payment-rules.md); [2026-10-30-finance-payments-workspace](../specs/2026-10-30-finance-payments-workspace.md).

**Files**

- Inspect/reuse; modify only where required: [db/schema.ts](../../../db/schema.ts); [lib/db/repositories/orders.ts](../../../lib/db/repositories/orders.ts); [lib/orders/first-cod-review.ts](../../../lib/orders/first-cod-review.ts); [lib/checkout/reviewed-quote.ts](../../../lib/checkout/reviewed-quote.ts); [deployment/babal/mariadb-schema.sql](../../../deployment/babal/mariadb-schema.sql).
- Create if not already supplied by a verified equivalent: `lib/payments/manual-receipts.ts`; `lib/payments/payment-window.ts`; `components/admin/manual-payment-review.tsx`; `tests/manual-payment-window.test.ts`; `drizzle/0084_manual_payment_allocations.sql`; `deployment/babal/mariadb-manual-payment-allocations.sql`.
- Test: `tests/manual-payment-window.test.ts` (planned); [tests/commerce-financial-native.test.ts](../../../tests/commerce-financial-native.test.ts).

**Interfaces:** Consumes company instruction version, immutable payable balance and real bank-credit/COD evidence. Produces guarded recordReceipt/allocateReceipt/expirePaymentWindow operations with owned exceptions and one stock release.

**Behavior and acceptance cases**

- [ ] Proof image without matched credit cannot mark Paid or release prepaid fulfillment.
- [ ] At cutoff−1ms qualifying claim gets one fixed buffer; at cutoff a new claim cannot backdate eligibility.
- [ ] Concurrent full allocation/expiry/top-up/cancellation cannot double release stock or consume one credit twice.
- [ ] Partial payment does not authorize partial dispatch; excess is money owed back, not seller earnings.
- [ ] Collected COD is not remitted company cash; uncertain remittance stays reserved and owned.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Receipt upload creates a claim, never verified money. Finance matches actual bank credit/reference/account/amount and duplicate use; separate bank transaction time from system confirmation time.
- [ ] 4. Implement 24 elapsed-hour window, one reminder 6 hours before deadline and one fixed 4-staffed-hour buffer only for qualifying pre-cutoff unresolved claims or positive partial allocations. Under the current continuous calendar that buffer is 4 elapsed hours.
- [ ] 5. At/after the applicable cutoff enforce expiry even if worker is late; release reservation once. Late real money goes to reviewed refund/new-order allocation, never automatic revival.
- [ ] 6. Handle partial, excess, duplicate, ambiguous, late, reversed and third-party payer evidence per approved rules. Preserve exact balance and owned Finance tasks; no rounding tolerance or automatic waiver.
- [ ] 7. Separate COD collected, company remitted, reconciled and disputed states; one eligible Super Admin may complete permitted finance steps with real evidence and audit.
- [ ] 8. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/manual-payment-window.test.ts tests/commerce-financial-native.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T21's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T22. Implement seller order response, delivery actions and delay follow-up

**Workstreams:** V09, V02, V03. **Depends on:** T04, T20, T21.

**Canonical requirements:** [2026-10-30-orders-customer-care-workspace](../specs/2026-10-30-orders-customer-care-workspace.md); [2026-10-30-seller-order-response](2026-10-30-seller-order-response.md).

**Files**

- Inspect/reuse; modify only where required: [lib/orders/progress.ts](../../../lib/orders/progress.ts); [lib/db/repositories/orders.ts](../../../lib/db/repositories/orders.ts); [lib/db/repositories/order-tracking.ts](../../../lib/db/repositories/order-tracking.ts); [components/seller/order-fulfillment-actions.tsx](../../../components/seller/order-fulfillment-actions.tsx); [app/seller/orders/[id]/page.tsx](../../../app/seller/orders/[id]/page.tsx); [app/admin/orders/[id]/page.tsx](../../../app/admin/orders/[id]/page.tsx).
- Create if not already supplied by a verified equivalent: `lib/orders/response-clock.ts`; `tests/order-response-followup.test.ts`.
- Test: `tests/order-response-followup.test.ts` (planned); [tests/order-email-history.test.ts](../../../tests/order-email-history.test.ts).

**Interfaces:** Consumes per-seller genuinely actionable release and scoped holds. Produces seller new-order notice, 6h reminder, 12h staff escalation/customer delay update and owned follow-up tasks.

**Behavior and acceptance cases**

- [ ] 6h/12h trigger once per current actionability cycle and are suppressed immediately after meaningful progress.
- [ ] Initial unpaid order gets payment reminders, not seller-preparation reminders.
- [ ] Valid hold resumes remaining allowance; new-order terms hold cannot pause an actionable existing order.
- [ ] Two delayed seller portions produce coherent customer updates without duplicate messages or lost staff ownership.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Start preparation responsibility only after actual payment/COD/commercial release; initial payment hold does not start a seller response clock.
- [ ] 4. Use immutable progress facts for preparing, ready, actual handoff and delivery; seller marking Ready or a label is not carrier custody.
- [ ] 5. After 6 hours without qualifying progress remind the seller; at 12 hours alert order staff/Super Admin and update affected customer truthfully. Staff first follow-up within 2 hours after escalation; Super Admin unresolved checkpoint at 24 hours from original actionability.
- [ ] 6. Pause accumulated response time only for approved scoped blockers that prevent the actual action. Workload, unread email or future-term restrictions do not excuse existing work.
- [ ] 7. Keep next customer update within 24 hours or earlier promised time while unresolved; no invented delivery ETA or automatic cancellation/refund.
- [ ] 8. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/order-response-followup.test.ts tests/order-email-history.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T22's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T23. Implement cancellation cutoffs and scoped dispatch holds

**Workstreams:** V10, V09. **Depends on:** T20, T21, T22.

**Canonical requirements:** [2026-10-31-cancellation-return-rules](../specs/2026-10-31-cancellation-return-rules.md).

**Files**

- Inspect/reuse; modify only where required: [lib/cancellation/repository.ts](../../../lib/cancellation/repository.ts); [lib/cancellation/accounting.ts](../../../lib/cancellation/accounting.ts); [lib/cancellation/notifications.ts](../../../lib/cancellation/notifications.ts); [components/commerce/customer-aftercare.tsx](../../../components/commerce/customer-aftercare.tsx).
- Create if not already supplied by a verified equivalent: `tests/cancellation-custody-races.test.ts`.
- Test: `tests/cancellation-custody-races.test.ts` (planned); [tests/commerce-financial-native.test.ts](../../../tests/commerce-financial-native.test.ts).

**Interfaces:** Consumes original seller portions, actual custody/payment/customization and current cases. Produces cancellationPreview/cancelSelectedParcels-compatible guarded decisions, scoped holds and Finance obligations.

**Behavior and acceptance cases**

- [ ] Cancellation and physical handoff race has one valid authoritative outcome; late custody evidence is reconciled, not backdated.
- [ ] Partial receipt or pending claim prevents an unsafe direct cancellation path but not the customer's support route.
- [ ] Seller cannot begin custom work after accepted hold and charge for it.
- [ ] Stock/tender restoration happens once; release of cancellation hold does not clear independent payment/safety hold.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Keep self-service cancellation to one or more whole seller portions with explicit item/quantity preview. Narrower/mixed-state requests become supported staff exceptions, never silently cancel extra products.
- [ ] 4. Apply approved matrix: eligible ordinary unpaid COD before Ready/handoff can cancel; custom preparation, Ready, prepaid/partial/claim/collected cases need review; after real handoff use interception/return help.
- [ ] 5. Save request and dispatch/preparation hold atomically; every relevant action respects it. Staff first action within 2 elapsed hours, decision or specific blocker/next action by 24 hours.
- [ ] 6. Preserve original custom agreement/work evidence; no new cancellation fee, automatic deposit forfeiture or forced substitute. Separate cancellation result from actual cash/credit refund state.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/cancellation-custody-races.test.ts tests/commerce-financial-native.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T23's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.


