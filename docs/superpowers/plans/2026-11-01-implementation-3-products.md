# Complete version — Offers, fees and product entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Prepared 1 November 2026. Documentation only; implementation remains on hold until the user resumes it. This is part 3 of one release, not a separate release.

**Goal:** Complete the ordered tasks below against their approved source requirements.

**Architecture:** Extend the existing repositories, guards, feature-owned forms and shared projections. Use the [orchestration plan](2026-11-01-complete-version-implementation.md) for cross-task contracts and policy precedence.

**Tech Stack:** Existing React 19 / vinext / TypeScript application, Drizzle schema, D1/SQLite and native MariaDB adapter, Node test runner and approved browser tools.

**Spec:** [All 20 workstreams](2026-10-31-complete-version-scope.md); each task lists its canonical sources. The source requirements remain controlling when a short task summary omits detail.

## Global Constraints

Read the [orchestration constraints](2026-11-01-complete-version-implementation.md) and [new-chat handoff](2026-11-01-new-chat-handoff.md) first. No code, data, release or live record changes are performed by preparing this plan. During implementation preserve the canonical checkout and dirty checkpoint; do not seed/reset/migrate existing local data to pass startup. Update the [progress ledger](2026-11-01-implementation-progress.md) with evidence after each task. Planned filenames are exact intended locations; if an existing implementation already provides the responsibility, record that mapping and reuse it rather than duplicate it.

## Review Focus

Apply the five failure modes in the orchestration plan to the owning tasks below. Test actual state/transactions, not only source-text patterns. Existing targeted tests are starting coverage, not proof that the new cases are already implemented. New test files must be written before their related new behavior. Do not create artificial red tests for unchanged, already-proven behavior.

## T12. Create expandable category templates and new-product rules

**Workstreams:** V20, V16. **Depends on:** T03, T05.

**Canonical requirements:** [2026-10-31-retail-categories-product-variants](../specs/2026-10-31-retail-categories-product-variants.md); [2026-10-31-optional-product-intake-support](../specs/2026-10-31-optional-product-intake-support.md).

**Files**

- Inspect/reuse; modify only where required: [db/schema.ts](../../../db/schema.ts); [lib/products/submission.ts](../../../lib/products/submission.ts); [components/seller/product-submission-form.tsx](../../../components/seller/product-submission-form.tsx).
- Create if not already supplied by a verified equivalent: `lib/products/category-contracts.ts`; `components/seller/category-detail-groups.tsx`; `tests/category-template-intake.test.ts`.
- Test: `tests/category-template-intake.test.ts` (planned); [tests/product-submission-validation.test.ts](../../../tests/product-submission-validation.test.ts).

**Interfaces:** Consumes category IDs, core form and product origin/condition facts. Produces getCategoryDetailGroups(categoryId) with optional discoverable groups and publication/order readiness requirements.

**Behavior and acceptance cases**

- [ ] New clothing, stationery, electronic and handmade drafts can save with optional groups empty.
- [ ] Used/refurbished/open-box/demo offers cannot pass new-only publication; unsupported categories reach help without fabricated attributes.
- [ ] Creating a fifth category and a subcategory works without code hardcoding four groups.
- [ ] Changing template labels preserves answers; moving category revalidates affected offer facts without deleting unrelated content.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Support new handmade, retail and resale products in expandable categories/subcategories. Clothing, stationery, electronics and handmade are starting template examples, never a four-category ceiling.
- [ ] 4. Map category-relevant dimensions such as size/material/care, pack quantity, model/specification/warranty without showing every group expanded. Let sellers discover every supported detail and request missing fields/categories via support.
- [ ] 5. Keep intake optional; distinguish missing descriptive details from facts genuinely necessary for a truthful offer, publication, safe ordering or evidence review.
- [ ] 6. Preserve existing category/occasion IDs and URL mappings. New category/template publication uses authorized review and affects drafts predictably.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/category-template-intake.test.ts tests/product-submission-validation.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T12's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T13. Implement real variants, independent stock and legacy offer mapping

**Workstreams:** V20. **Depends on:** T01, T12.

**Canonical requirements:** [2026-10-31-retail-categories-product-variants](../specs/2026-10-31-retail-categories-product-variants.md).

**Files**

- Inspect/reuse; modify only where required: [db/schema.ts](../../../db/schema.ts); [lib/db/repositories/products.ts](../../../lib/db/repositories/products.ts); [lib/products/submission.ts](../../../lib/products/submission.ts); [lib/runtime/node-bindings.ts](../../../lib/runtime/node-bindings.ts); [deployment/babal/mariadb-schema.sql](../../../deployment/babal/mariadb-schema.sql).
- Create if not already supplied by a verified equivalent: `lib/products/offers.ts`; `lib/products/offer-inventory.ts`; `components/seller/variant-editor.tsx`; `tests/product-offer-inventory.test.ts`; `drizzle/0082_product_sellable_offers.sql`; `deployment/babal/mariadb-product-sellable-offers.sql`.
- Test: `tests/product-offer-inventory.test.ts` (planned); [tests/product-revision-concurrency.test.ts](../../../tests/product-revision-concurrency.test.ts); [tests/billing-seller-sku.test.ts](../../../tests/billing-seller-sku.test.ts).

**Interfaces:** Consumes OfferSnapshot, category facts and guarded inventory adjustments. Produces validateOfferMatrix, reserveOfferStock and versioned sellable offers shared by submission, public selection and order snapshots.

**Behavior and acceptance cases**

- [ ] 3 option types/100 included combinations succeeds; a fourth type or 101st included offer is rejected with retained draft.
- [ ] Two checkouts cannot reserve the last unit twice; a draft stock edit cannot change live availability.
- [ ] Retiring/reintroducing an offer preserves history and does not reclaim already-reserved units.
- [ ] Pack/single-unit allocations reconcile; variant changes do not rewrite historical order selections or prices.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Allow up to 3 option types and 100 included combinations independently in live and candidate versions. Count paused/zero-stock included offers; exclude retired history. Explain overflow and support smaller selections without truncation.
- [ ] 4. Give each real offer stable identity, selected option values, its own price, image association and stock/capacity. Handle pack quantities and allocation without representing the same physical stock twice.
- [ ] 5. Require explicit initial stock confirmation; drafts/review candidates do not alter live reservations. Manage available/reserved separately, concurrent adjustments safely and zero-stock visibility honestly.
- [ ] 6. Map legacy single offers without inventing combinations from free text. A genuinely identical retired offer may reuse its identity/history after review; do not reactivate old stock or old orders automatically.
- [ ] 7. Thread offer identity through invoice, fulfillment, cancellation, return, refund and reporting contracts before downstream work.
- [ ] 8. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/product-offer-inventory.test.ts tests/product-revision-concurrency.test.ts tests/billing-seller-sku.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T13's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T14. Implement effective commission, terms acceptance and schedule replacement

**Workstreams:** V14. **Depends on:** T02, T04, T10.

**Canonical requirements:** [2026-10-31-fees-programs-promotions-workspace](../specs/2026-10-31-fees-programs-promotions-workspace.md); [2026-10-31-fee-publication-schedules-combinations](../specs/2026-10-31-fee-publication-schedules-combinations.md); [2026-10-30-seller-order-response](2026-10-30-seller-order-response.md).

**Files**

- Inspect/reuse; modify only where required: [lib/commission/rates.ts](../../../lib/commission/rates.ts); [lib/db/repositories/commission-rates.ts](../../../lib/db/repositories/commission-rates.ts); [lib/db/repositories/commission-continuity.ts](../../../lib/db/repositories/commission-continuity.ts); [components/seller/commission-fee-notice.tsx](../../../components/seller/commission-fee-notice.tsx); [components/admin/commission-settings.tsx](../../../components/admin/commission-settings.tsx); [app/admin/commission/page.tsx](../../../app/admin/commission/page.tsx).
- Create if not already supplied by a verified equivalent: `tests/commission-common-start.test.ts`.
- Test: `tests/commission-common-start.test.ts` (planned); [tests/commission-routes.test.ts](../../../tests/commission-routes.test.ts); [tests/marketplace-commission.test.ts](../../../tests/marketplace-commission.test.ts); [tests/commission-continuity.test.ts](../../../tests/commission-continuity.test.ts).

**Interfaces:** Consumes recorded effective rate/schedule/accepted terms and source order snapshots. Produces one authoritative current/future fee view and acceptance gate for new orders; old continuity helpers must not override the new common-start policy.

**Behavior and acceptance cases**

- [ ] Order committed before T uses its old rate; at T the new applicable rate and matching acceptance gate apply.
- [ ] Joining during the notice interval does not grandfather 9% after the 12% effective date.
- [ ] Replacing a schedule with 10 days left requires at least 15 full days; old acceptance does not count for changed terms/date.
- [ ] Accepted seller gets no stale reminders; routine email cap spans replaced versions; fixed-supplier obligations remain their own model.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Read actual scheduled 12% record and effective timestamp; do not invent or move it. Show Selling fee, current rate and clear future start only when a future schedule exists; remove confusing 9/91 and 12/88 pairs.
- [ ] 4. At the approved common start, both existing sellers and sellers joining during notice use the new applicable rate for new orders. Preserve recorded rates for already-committed orders, even if paid later.
- [ ] 5. Require exact-version acceptance by the start date; missing acceptance blocks new orders only, retains dashboard and existing obligations. Use T−7/−3/−1/T/T+3/T+7 seller reminders and approved staff follow-up deadlines from the master.
- [ ] 6. Replace a future schedule atomically with reason, version and fresh full 15-day notice from publication; preserve cancellation/acceptance history and suppress obsolete messages. No accidental cancellation of the actual schedule during development.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/commission-common-start.test.ts tests/commission-routes.test.ts tests/marketplace-commission.test.ts tests/commission-continuity.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T14's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T15. Unify promotion combinations, permissions and aftercare allocations

**Workstreams:** V14, V13. **Depends on:** T13, T14.

**Canonical requirements:** [2026-10-31-fee-publication-schedules-combinations](../specs/2026-10-31-fee-publication-schedules-combinations.md); [2026-10-31-fees-programs-promotions-workspace](../specs/2026-10-31-fees-programs-promotions-workspace.md).

**Files**

- Inspect/reuse; modify only where required: [lib/incentives/promo-policy.ts](../../../lib/incentives/promo-policy.ts); [lib/db/repositories/promo-codes.ts](../../../lib/db/repositories/promo-codes.ts); [lib/db/repositories/fee-waivers.ts](../../../lib/db/repositories/fee-waivers.ts); [lib/db/repositories/customer-fee-waivers.ts](../../../lib/db/repositories/customer-fee-waivers.ts); [lib/checkout/reviewed-quote.ts](../../../lib/checkout/reviewed-quote.ts).
- Create if not already supplied by a verified equivalent: `tests/promotion-allocation-contract.test.ts`.
- Test: `tests/promotion-allocation-contract.test.ts` (planned); [tests/promo-checkout.test.ts](../../../tests/promo-checkout.test.ts); [tests/promo-aftercare.test.ts](../../../tests/promo-aftercare.test.ts); [tests/platform-service-fee.test.ts](../../../tests/platform-service-fee.test.ts).

**Interfaces:** Consumes offer selling price, commercial-route fee base and eligible tender/campaign versions. Produces immutable per-line benefit, funding and tender allocations reused by checkout and aftercare.

**Behavior and acceptance cases**

- [ ] Illustrative 1,000 selling price, 100 promo, 200 credit, 100 delivery, waived 10 fee yields 800 remaining payment; applicable 12% seller fee remains 120.
- [ ] Promo+referral double stacking fails; concurrent final budget use cannot overspend.
- [ ] Aftercare uses original rounded line/tender allocations and cannot refund more benefit or cash than recorded.
- [ ] Expiry/cancellation does not automatically restore successful-checkout promo use contrary to the approved rule.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Enforce the approved publishing roles and one promo OR referral, eligible credit, plus at most one customer marketplace-fee waiver. Product markdown is already part of the approved selling price.
- [ ] 4. Do not reduce seller commission basis for platform-funded promo/referral/credit; do not reapply product discount twice. No new delivery subsidy, seller-commission holiday or targeting rules.
- [ ] 5. Reserve/consume usage atomically and preserve actual order allocations for cancellation, partial return, refund, expiry and recovery.
- [ ] 6. Classify every current incentive route, including retained legacy behavior; reconcile D18 actual compatibility rather than silently dropping an existing instrument.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/promotion-allocation-contract.test.ts tests/promo-checkout.test.ts tests/promo-aftercare.test.ts tests/platform-service-fee.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T15's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T16. Add private profit helper, truthful pricing and customer preview

**Workstreams:** V07. **Depends on:** T13, T14, T15.

**Canonical requirements:** [2026-10-31-seller-price-public-preview](../specs/2026-10-31-seller-price-public-preview.md); [2026-10-31-product-discount-price-guidance](../specs/2026-10-31-product-discount-price-guidance.md).

**Files**

- Inspect/reuse; modify only where required: [lib/products/discount.ts](../../../lib/products/discount.ts); [lib/products/truthful-presentation.ts](../../../lib/products/truthful-presentation.ts); [components/seller/product-submission-form.tsx](../../../components/seller/product-submission-form.tsx); [db/schema.ts](../../../db/schema.ts); [deployment/babal/mariadb-schema.sql](../../../deployment/babal/mariadb-schema.sql).
- Create if not already supplied by a verified equivalent: `lib/products/price-guidance.ts`; `components/seller/price-profit-preview.tsx`; `tests/product-price-guidance.test.ts`; `drizzle/0083_private_price_guidance.sql`; `deployment/babal/mariadb-private-price-guidance.sql`.
- Test: `tests/product-price-guidance.test.ts` (planned); [tests/product-discount.test.ts](../../../tests/product-discount.test.ts); [tests/product-truthfulness.test.ts](../../../tests/product-truthfulness.test.ts).

**Interfaces:** Consumes selected OfferSnapshot and authoritative route fee calculation. Produces calculatePriceGuidance(input) with fee/amount-after-fee, optional owner-private estimated profit and a public-only preview projection.

**Behavior and acceptance cases**

- [ ] At illustrative 1,000 and applicable 12%, fee=120 and amount-after-fee=880; cost 600 produces estimated profit 280 only when no other deduction applies.
- [ ] Compare-at <= selling price or evidence from a different variant cannot produce a misleading discount.
- [ ] At day 30/day 60 the approved price and discount remain; dismissal suppresses remaining suggestions; same-price republication does not restart the cycle.
- [ ] Seller-owned private inputs are absent from foreign/admin normal review and serialized public preview.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Show selling price, optional genuine former selling price for that same offer, NPR savings and consistent percentage rounding. No universal price cap; flag implausible/inconsistent claims for guidance and evidence review.
- [ ] 4. Optional private cost and target-profit inputs help suggest a draft price, with known deductions separated; blank cost is unknown, not zero. Never include costs/profit in normal admin review, support, public HTML, logs or telemetry.
- [ ] 5. Label customer-visible fields and preview the actual selected offer card/detail. Seller must confirm a suggested draft change; nothing automatically reprices the published product.
- [ ] 6. Implement D20's advisory-only days 23/29 notices, optional dismissal and suppression. No day-30 expiry, mandatory repricing, order hold, automatic repeating cycle or ignored-reminder escalation; retain real evidence-based moderation.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/product-price-guidance.test.ts tests/product-discount.test.ts tests/product-truthfulness.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T16's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T17. Complete optional product entry, support and correction workflow

**Workstreams:** V06, V02, V20. **Depends on:** T03, T05, T12, T13, T16.

**Canonical requirements:** [2026-10-31-optional-product-intake-support](../specs/2026-10-31-optional-product-intake-support.md); [2026-10-30-products-storefront-workspace](../specs/2026-10-30-products-storefront-workspace.md).

**Files**

- Inspect/reuse; modify only where required: [components/seller/product-submission-form.tsx](../../../components/seller/product-submission-form.tsx); [lib/products/submission.ts](../../../lib/products/submission.ts); [lib/db/repositories/products.ts](../../../lib/db/repositories/products.ts); [app/seller/products/new/page.tsx](../../../app/seller/products/new/page.tsx); [app/sell/application/products/new/page.tsx](../../../app/sell/application/products/new/page.tsx).
- Create if not already supplied by a verified equivalent: `components/seller/product-help-request.tsx`; `tests/product-assistance-intake.test.ts`.
- Test: `tests/product-assistance-intake.test.ts` (planned); [tests/product-form-render.test.ts](../../../tests/product-form-render.test.ts); [tests/product-form-consolidated.test.ts](../../../tests/product-form-consolidated.test.ts); [tests/product-submission-validation.test.ts](../../../tests/product-submission-validation.test.ts).

**Interfaces:** Consumes category groups, offers, private/public projection and stable draft version. Produces one product/reference with draft, help-needed, review and correction transitions; all supported product detail groups remain discoverable.

**Behavior and acceptance cases**

- [ ] Incomplete and zero-cover drafts reach help; they cannot accidentally publish.
- [ ] After interrupted upload/config refresh the seller resumes the same draft/reference and retains selected offers.
- [ ] Staff factual changes do not silently overwrite seller-confirmed price, identity or claims.
- [ ] Same help/review transition replay creates one case/task/event; support unavailable is a recoverable state, not lost submission.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Provide focused steps, save/resume, one clear cover-photo entry, optional additional photos and optional gift occasions. Keep intake fields optional without misleading 'required' clutter.
- [ ] 4. Allow incomplete/zero-cover assistance submission; publication has its own real-facts gate. Link missing category/field requests to support and the same product reference rather than forcing duplicate listings.
- [ ] 5. Provide customer preview before submit, plain errors, upload retry and preserved values. Staff can propose factual corrections; seller confirms material changes before review/publication.
- [ ] 6. First assistance triage within one service day; notify the seller, responsible team and Super Admin email+dashboard with clear next actor and no private profit data.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/product-assistance-intake.test.ts tests/product-form-render.test.ts tests/product-form-consolidated.test.ts tests/product-submission-validation.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T17's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.


