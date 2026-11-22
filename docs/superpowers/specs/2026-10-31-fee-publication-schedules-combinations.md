# Fee publication permissions, scheduled replacements and discount combinations

Status: publishing permissions, scheduled commission replacement rules and discount combinations approved by the user on 31 October 2026. This settles D16 and D17, alongside the approved parent workspace, common-start 12% transition, notice/acceptance/reminder rules and customer-fee-only waiver direction. Approval records the intended behavior; implementation remains on hold until planning is complete and the user resumes work. This document changes no live schedule, permissions, agreement, campaign, balance, product or order, and sends no messages.

Related: [approved Fees workspace](2026-10-31-fees-programs-promotions-workspace.md), [master work plan](../plans/2026-10-30-seller-order-response.md), [decision index](../plans/2026-10-30-planning-readiness-review.md), [Products & storefront](2026-10-30-products-storefront-workspace.md), [Finance & payments](2026-10-30-finance-payments-workspace.md), [Email delivery](2026-10-30-email-delivery-automation.md) and [Form Management](2026-10-30-form-management-reliability.md).

## 1. Approach and evidence

Use existing reserved financial authority, immutable published terms and a fixed, explainable combination matrix. Allow departmental recommendations without giving ordinary staff permission to publish money changes. Add one reviewed replacement operation for an announced future commission change rather than editing the old record or requiring staff to complete separate cancellation and publication steps. The user approved this approach on 31 October 2026; implementation remains outstanding.

Alternatives considered: letting all marketing/Finance admins publish would broaden current reserved authority; live editing of announced terms would invalidate consent/history; separate cancel-then-schedule leaves a failure gap. Requiring a second Super Admin for every campaign would add an unrequested dependency for routine commercial administration. The approved approach uses a Super Admin final decision with a preview and audit, preserving applicable program checks and financial evidence/authority under the latest single-Super-Admin amendment.

Local read-only evidence:

| Source | Constraint to carry forward |
|---|---|
| `lib/marketplace/permissions.ts` | `commercial_policy.manage` is reserved for Super Admin and not among configurable ordinary Admin permissions. Product review/publication are separate permissions; staff cannot review their own seller product. |
| `app/api/admin/commission/route.ts`, `lib/db/repositories/commission-rates.ts` | Scheduling requires commercial-policy authority, at least 15 elapsed days, current revision and no other live future rate. Only future schedules can be cancelled; published records and cancellation reasons are retained. Replacement is not currently a single operation here. |
| `lib/db/repositories/business-settings.ts`, `lib/managed-commerce/accepted-terms.ts` | Registered and managed fee sources/agreements are distinct. Effective settings, company identity and accepted term snapshots must match the correct route; a fee setting is not commercial activation. |
| Customer-fee-waiver API/repository | Super Admin plus commercial-policy access; automatic customer-fee target is separate from old seller-waiver history. |
| Promo/loyalty/referral API and repositories | Super Admin checks exist. Some routes use the unrelated `admin.invite` permission as an entry gate; map the commercial operation correctly when implementing, without granting staff invitation powers to operate promotions. |
| `lib/db/repositories/orders.ts`, `wallet.ts`, `promo-codes.ts`, `lib/incentives/promo-policy.ts` | One promo or referral; wallet applies to remaining merchandise only; current product price forms the subtotal; quote/placement rechecks, finite promo use/budget and original allocations matter. |
| `lib/checkout/customer-service-fee.ts` | One actual positive customer fee is waived in full with saved attribution. Zero/disabled fees do not create a fictional waiver benefit. |

This is not a live policy/deployment audit. Read actual scheduled source versions, dates and routes before later implementation/cutover. Do not replace the currently announced 12% change simply because this plan defines replacement controls.

## 2. Publishing permissions

| Action | Approved authority | Important boundary |
|---|---|---|
| View current seller fees/required terms | Seller sees own applicable terms; staff see the context needed for their authorized task | No access to other sellers' private details, campaign customer lists or bank evidence through this workspace. |
| Prepare a commercial recommendation | Assigned departmental admin, within their task scope; Super Admin can prepare directly | A recommendation/task is not a native financial draft, consent, publication or spending approval. Current financial draft APIs remain restricted. Implement the approved scoped proposal workflow when work resumes; no broad new admin grant. |
| Create/edit native fee, promo or waiver drafts; inspect detailed campaign budgets/redemptions | Super Admin with the matching commercial capability | A saved draft is private and has no effective date/notice consequences until published. Ordinary staff get only necessary proposal/operational summaries through authorized views. |
| Publish/schedule/replace/cancel future commission, change customer charges, publish/pause/resume/end promos or customer-fee waivers | Super Admin with live commercial authority and all native validations | Authority applies to emergency pauses too. Staff report an incident and escalate; they do not gain a hidden pause or publish bypass. Expiry/limits may stop usage automatically under an already-published rule. |
| Change program financial settings, referral/reward rules or budgets | Super Admin with the actual settings/commercial authority | Preserves existing review dependencies, earned liabilities and program activation controls. No new power to transfer money, waive bank review or change another actor's acceptance. |
| Submit own product price/sale-price changes | Seller with own-product access | Goes through the approved product workflow; does not publish a platform promo or set commission. D2 now approves reviewed selling/compare-at price changes and first published-product revision review within 1 business day. |
| Approve & publish a product, including approved price content | Staff with both `product.review` and `product.publish`, with ownership/conflict checks | Financial-policy authority does not substitute for product authority. No self-review, activation bypass or implied publication through a campaign. |
| Seller accepts applicable current/future terms | The authorized seller/account actor under the native agreement contract | Staff can explain and link to the task; they cannot tick acceptance on the seller's behalf. Read email/acknowledged support contact is not consent. |

Super Admin may prepare and finally publish a commercial proposal themselves after reviewing the impact; no universal second-person approval is introduced. The later [approved single-Super-Admin finance amendment](2026-10-31-single-super-admin-finance-approval.md) also permits one eligible Super Admin to prepare/approve/execute/record refunds (including high-value), payouts, COD and recovery/write-offs. It supersedes older separate-person financial wording without granting product or ordinary-staff permissions, or removing evidence/hold/personal-conflict checks.

At every save and final action, recheck active account, actual operation permission, scope, source version, expected state and timing. Hiding a button is insufficient. Losing permission after opening a preview blocks its submission. Scheduled policies and expiry continue under their published authority even if the original publisher later loses access; revocation alone must not silently cancel a business policy.

The review screen names the action precisely (Publish promo, Schedule fee change, Replace scheduled change), displays before/after rate or benefit, base/funding, routes/audience, dates in Nepal time, notice and fresh-acceptance effects, limits and affected sellers. Record actor, reason, time and immutable versions. Financial controls retain native validation regardless of optional custom form fields. Uncertain responses offer View recorded outcome before another attempt; retries use the same request identity and cannot repeat publication or spending.

## 3. Replacing an announced commission change

### A. Types of edit

| State or proposed edit | Approved behavior |
|---|---|
| Unpublished draft | Edit freely within draft permissions; no notice or acceptance has begun. |
| Internal note or UI formatting/help outside the accepted agreement, with identical meaning | Audit a presentation/administrative revision. Do not alter the stored agreement, reset notice, change the fee version or invalidate consent. |
| Rate, calculation base, covered route/scope, required contractual wording or effective time changes | New immutable financial/terms version; fresh full notice and exact-version acceptance. Treat a lower fee or a postponed start consistently, without guessing consent. |
| Future schedule cancelled with no replacement | Super Admin cancellation with reason and impact preview. Current effective valid terms continue; cancel the future task/notices. No replacement rate or new seller agreement is fabricated. |
| Schedule already effective at final confirmation | Cannot replace/cancel it as a future schedule. Publish a new future change with the required notice; preserve current enforcement and historical orders. |

Do not edit accepted contractual text in place under the label of a typo fix. Keep the exact accepted text in history. Cosmetic presentation changes outside that text must not cause the repeated form-version errors the user wants removed.

### B. One safe replacement flow

1. Select the existing future change. Preview original and proposed rate/base/terms, exact routes, original/new start, sellers already notified or accepted, required fresh acceptance and notices. Preparing this replacement leaves the original future policy in force.
2. Publish a distinct replacement version with a reason. Its start must be at least 15 full elapsed days from successful replacement publication, displayed in Nepal time. The old start can be retained only if that full interval still fits; otherwise propose a later common start and require the publisher to confirm that date explicitly. Do not silently move it.
3. Record the old future version as Replaced, link both versions, publish the replacement and create the corresponding notification/task facts as one guarded operation. If any required component fails or is stale, the old future schedule remains intact and no replacement announcement is issued. A separate intentional cancellation remains available.
4. Keep at most one published upcoming commission change per applicable route/coordinated transition. Multiple private drafts are allowed. No published overlapping competing future rates, ambiguous picker, separate repeated notice timers or automatic revival of a replaced version.
5. Coordinate the distinct Registered Seller and managed sale-linked sources for the approved common-start transition. The exact source versions must be reconciled into one publication/replacement result with a common start. Reject partial publication/replacement; no success banner or notices when only one route changed. Fixed supplier prices are outside this percentage change. A future request affecting just one route must be separately scoped, not silently substituted for the agreed combined transition.

Illustration only: an original change was due 10 days from now. A material replacement published now needs a start at least 15 days from now. The current effective rate continues until that replacement starts; the original future version never becomes effective after a successful replacement. This is not permission to move the real 12% schedule during planning.

### C. Acceptance and ordering

Acceptance of replaced version A remains historical evidence and is not acceptance of B. Mark it Accepted — replaced, with a clear link to B. Require matching B acceptance by its new common start. Do not carry acceptance merely because the number remains 12%; changed date, scope or required terms still matter under these approved rules.

Keep current and upcoming obligations distinct. Onboarding during notice explains both and records consent against each applicable version through the native contract (distinct receipts or a verifiable bundled receipt naming both); future acceptance must not stand in for missing current acceptance. Replacing a future version must not erase valid current acceptance. Do not invent legacy consent during migration: preserve verifiable evidence or ask the seller to complete the actually-required current task.

Before B starts, sellers with valid current terms can receive eligible orders at the current rate. At B's start, covered new orders use B only after valid B acceptance; missing acceptance holds new orders. Accepting a later future version does not clear an unmet current-version hold. Cancelling A clears only A's future reminders/task, never an unrelated current terms, identity, suspension or payment restriction. Dashboard access and permitted existing-order work remain available.

A committed order keeps its original terms even if payment, shipment or refund comes later. Unplaced carts/quotes are revalidated at final placement. At the exact boundary, authoritative server time and source state win over a browser clock; expired replacement previews fail safely. Replay of an already-successful authorized request retrieves its original outcome rather than repeating a change after the boundary.

### D. Notices and recovery

For a replacement, provide one version-specific announcement to sellers previously offered the superseded version, whether accepted or outstanding, plus currently affected sellers. Show a plain explanation, new date and fresh acceptance action. For cancellation, explain that the future change was cancelled and show the actual current terms. Staff see updated acceptance coverage and assigned help tasks without duplicated cases for the same replaced obligation.

Supersede queued obsolete messages before sending and recalculate the approved T−7/T−3/T−1/T/T+3/T+7 follow-ups for the replacement. A notice already delivered stays in history; its link resolves to the current truthful status. Late joiners receive only relevant current notices. The rolling 24-hour routine-email limit carries across versions; deliberate resends count. A genuine replacement/cancellation is a distinct state-change notice, not another routine reminder. Deduplicate by event, version, recipient and channel, and check current unresolved state before dispatch/retry. Changing read status does not complete the acceptance task. Preserve approved automatic retry/recovery and Super Admin outage/recovery alerts.

Publication is the start of notice, not draft save or successful email delivery; the dashboard notice must be available with publication. Email outages do not secretly postpone the effective time. If staff decide a material schedule change is needed, use this explicit versioned process. Never replay a batch of superseded reminders after recovery.

## 4. Which benefits can combine

The following fixed matrix is approved, preserving native boundaries rather than introducing arbitrary stacking switches. Allowed means all ordinary product, customer, campaign, route, minimum, date, budget and stock checks also pass; it is not evidence of live end-to-end deployment.

| Combination | Approved rule | Calculation and explanation |
|---|---|---|
| Product sale price + one promo code | Allow | Promo uses the actual current eligible merchandise subtotal after product markdown, not the crossed-out comparison price. |
| Product sale price + one eligible referral offer | Allow | Uses that same current merchandise value; retain first-order/account/phone and anti-self-referral rules. |
| Two promo codes | Do not allow | One selected code per order; show the reason and let the customer choose, without silently switching. |
| Promo code + referral discount | Do not allow | One merchandise incentive source per order. Replacing the selected offer requires a reviewed new total. |
| Product sale price + shopping credit | Allow | Credit is existing payment value, limited to remaining eligible merchandise and available balance. |
| One promo OR referral + shopping credit | Allow | Apply the eligible discount first, then credit to the remaining merchandise. No credit against excluded delivery/customer fees. |
| Customer marketplace-fee waiver + product sale price, one promo/referral and/or credit | Allow | Separate fee target; waive the actual positive customer fee once per order without changing seller commission. |
| Two overlapping customer-fee-waiver campaigns | One benefit only | Earliest eligible start, then immutable campaign ID selects the winner; no stacking, cash excess or automatic extension. Pausing one may expose another still-valid campaign. |
| Points + shopping credit as two tender lines | Do not allow | Redeem eligible points to credit through the existing conversion first; that issued credit can be used once. Points are not a second independent checkout discount. |
| Delivery discounts, seller-commission holidays, new category-targeted/guest coupons | Not added in this phase | Preserve actual supported types; no hidden additional targeting, seller subsidy or new fee waiver scope. |

One published product price supplies each line; do not repeatedly apply several product markdown percentages or invent a higher comparison price. Product price editing/review remains the approved product workflow with D2 field classification now approved. Platform-funded promo/referral benefits and use of existing credit do not reduce the seller's recorded merchandise/commission basis; an actual product markdown does change its approved selling price. Calculate each commercial route from its own contract. Fixed supplier obligations are not converted into a 12% commission.

The order calculation is: current eligible merchandise S, minus one valid promo/referral D, minus selected credit W, plus delivery L and the actual customer fee remaining after any waiver C. Require 0 ≤ D ≤ S and 0 ≤ W ≤ S−D and available credit; total = S−D−W+L+C. Preserve native minimum-subtotal and percentage-cap calculations before credit, tax/charge treatment and integer-paisa rounding/line allocation. Do not apply percentage discounts to delivery/customer fees or silently clamp invalid financial configuration into a new offer. Offer removal or a corrected quote requires review before placement. Zero-payable handling remains the actual supported payment contract, not an invented paid bank receipt.

Illustrative NPR amounts only, assuming an eligible promo and the shown fee/delivery: a product's comparison price is 1,200 and approved sale price is 1,000; 10% promo saves 100; chosen credit pays 200; delivery costs 100; a 10 customer fee is waived. The customer pays 800 through the remaining payment method. The product markdown is already included in the 1,000 and must not be subtracted twice. At an applicable 12% rate on a 1,000 eligible seller base, the selling fee is 120 and the amount before other route adjustments is 880. Promo cost 100, fee revenue foregone 10 and previously-issued credit used 200 are distinct report entries; credit consumption is not a new 200 promotional expense. These are not actual live rates/campaign balances or a guaranteed payout.

No checkout quote consumes a promo, reserves its budget, spends credit or awards rewards by itself. Recheck the entire combination, saved quote, source revisions/time, available budget/use counts and balance at placement; commit its saved allocation and consumption once with the order. Competing last-use/last-budget checkouts cannot both consume one remaining entitlement. If conditions change, keep the cart, show the changed total/offer and require review. Do not silently remove a discount or place at a higher total. Account-specific incentives require the actual signed-in account; the automatic fee waiver does not confer that eligibility.

Mixed-seller orders still have one chosen merchandise incentive and one order-level customer fee/waiver, allocated to lines using native rules. The same calculation is used in preview, checkout, order, refund and reports; seller and customer projections expose only their relevant facts. Never multiply the single waived fee by the number of sellers/products.

## 5. Aftercare and visibility

Keep original campaign/financial versions, bases, rounded allocations, fee waiver attribution and funding source on the order. Customer-visible savings and payment lines must reconcile with actual payable amounts; seller fees stay in seller/admin views. Do not present credit used as another percentage sale. Expired/cancelled offers must not continue advertising a saving in checkout. A campaign publication does not authorize bulk marketing email.

Preserve the native baseline: successful promo redemption consumes its use/budget even after cancellation/refund; failed checkout consumes neither; exact successful replay does not consume twice. A customer-fee waiver creates no fee refund because no fee was collected. Refunds/credit restorations follow original paid allocations and existing aftercare rules, never the latest campaign or current commission. D18 remains verification/mapping of referral/reward/credit aftercare; any desired business change is separate. No automatic double credit, negative fee or restored promo capacity is added here.

## 6. Later verification and decision boundary

- Permission matrix through both UI and direct requests: ordinary admin recommendation versus financial draft/publication, revoked access, product review/publish separation, ownership conflicts, private-budget/customer/bank data and no staff-forged seller acceptance.
- Future replacement before/at/after original start; full 15-day boundary; retain old start when valid; show/confirm later start when needed; two competing publishers; retry after uncertain success; no half-replaced Registered/Managed transition.
- Cancel with no replacement, replace previously accepted future terms, current versus future consent, onboarding/legacy consent without fabrication, no reinstatement of an old future policy and no old-rate orders after a new effective unaccepted policy.
- Cosmetic form/layout changes preserve drafts/consent. Financial revisions change the correct agreement only. Source unavailability blocks the unsafe action with a specific task; no guessed fee or lost history.
- Every matrix combination, account eligibility, invalid referral/promo conflicts, percentage caps, minimums, rounding, fee zero/disabled/overlap, mixed carts, fully discounted merchandise, credit and zero-payable contract.
- Final budget/use/credit races, stale quotes, retained cart and reviewed new total, cancellation/refund original allocations, no doubled fee reporting, no duplicate reward/redemption and no restored promo allowance by accident.
- Replacement/cancellation/acceptance and mail outage races suppress obsolete notifications; version-specific dashboard task and shared read state stay accurate; automatic recovery sends only still-relevant notices.

These are future tests using fictional records, controlled time and captured mail when implementation is resumed. No application tests, runtime changes, migrations, live policy publication, email or deployment occur during this planning turn. Preserve canonical local data/launcher safeguards and the current deployment hold.

D16 and D17 are settled by the user's 31 October 2026 approval: sections 2–3 govern authority and scheduled replacements; section 4 governs combinations/calculations. Unsupported extensions remain outside scope. D18 is technical aftercare compatibility work; D2 product-edit rules and its one-business-day revision-review target are approved; remaining Finance/operational choices are recorded separately in the decision index. Builder choices include internal schema/component names and transaction mechanics that preserve these outcomes; they may not invent a delegation, consent exception, shorter notice or new combination to simplify implementation. Implementation remains on hold.
