# Fees, programs & promotions — clear charges, scheduled terms and controlled offers

Status: Fees, programs & promotions approved by the user on 31 October 2026. The workspace, clear fee/benefit labels, controlled previews and preserved commission/customer-fee-waiver direction are approved. The user also explicitly approved [publishing permissions, replacement of scheduled changes and discount combinations](2026-10-31-fee-publication-schedules-combinations.md), settling D16/D17. Implementation remains on hold until planning is complete and the user explicitly resumes work. No rate, terms version, campaign, acceptance, customer balance, budget, job or production setting is changed by this document.

Related: [master work plan and approved commission policy](../plans/2026-10-30-seller-order-response.md#commission-transition-and-wording--agreed-policy), [decision index](../plans/2026-10-30-planning-readiness-review.md), [Overview](2026-10-30-super-admin-overview-review.md), [Sellers](2026-10-30-seller-management-workspace.md), [Products & storefront](2026-10-30-products-storefront-workspace.md), [Orders & customer care](2026-10-30-orders-customer-care-workspace.md), [Finance & payments](2026-10-30-finance-payments-workspace.md), [Seller Center](2026-10-30-seller-center-workspace.md), [Email delivery](2026-10-30-email-delivery-automation.md), [Form Management](2026-10-30-form-management-reliability.md) and [approved customer-fee-waiver correction](2026-10-23-customer-fee-waiver-correction-design.md).

## 1. Purpose and settled rules

Make every charge/benefit answer five questions: who pays, who benefits, what amount/base applies, when it applies and who funds it. Keep this as a separate Super Admin area, linked to Finance reporting and seller/product records. Do not merge it into Finance or create competing fee editors in several sections.

Already approved:

- Covered Registered Seller commission and sale-linked Managed Maker fees move to 12% for eligible new orders from the actual common effective time, following the 15-day notice and applicable exact-term acceptance. These are distinct settings/agreements; do not infer that fixed supplier prices become a percentage model.
- Sellers accepting/joining during notice accept the forthcoming rate for the same start time. Existing 9% sellers do not retain 9% on new orders after that boundary; missing acceptance pauses new orders until valid acceptance, while permitted dashboard/existing-order work continues.
- Older orders retain their original rates, agreements, discounts and allocations even if paid/refunded/settled later. Ordinary summaries show only the current effective fee when no future published change exists. Remove confusing percentage pairs; show the fee and meaningful rupee amounts.
- The approved customer-fee-waiver correction covers the customer's per-order marketplace fee, historically specified as NPR 10. It does not waive seller commission/managed retention, delivery or merchandise. Use the actual effective versioned fee and recorded order amounts; no claim is made that the live amount/schedule was checked today.
- Customer-fee campaigns are automatic/global, may overlap, and apply one full waiver of that positive customer charge per eligible order. Preserve separate customer-fee campaign records and historical seller-waiver facts; do not silently relabel old financial records.
- The approved commission reminder/follow-up schedule, automatic mail recovery and duplicate/obsolete-message suppression remain unchanged. No staff member can accept terms for a seller.

This is an interface and operational planning pass. It does not introduce arbitrary fee increases, new discount funding, targeted/free-shipping coupons, paid membership, new reward values, new language policy or live commercial activation.

## 2. Current local foundations and important conflicts

| Inspected local source | Implication for later work |
|---|---|
| `lib/commission/rates.ts`, commission repository | The notice constant is 15 days and time input is interpreted in Nepal time. Generated text still says a previously accepted effective rate continues until acceptance, and the repository selects accepted effective rate history. This conflicts with the later approved common-start/new-order-hold direction. Reconcile display, terms generation, acceptance and authoritative new-order eligibility/calculation together; a wording-only change is insufficient. |
| `lib/checkout/customer-service-fee.ts`, customer-fee-waiver repository/API | Separate customer-fee target and saved standard/waived/charged facts already exist. Customer-waiver mutation requires live Super Admin and commercial-policy permission. Preserve the actual policy's enabled/amount/version rather than hardcode an imaginary benefit. |
| `lib/marketplace/fee-waivers.ts` | Shared campaign structures include immutable identity/revision and deterministic earliest-start then ID selection. The file also contains older seller-commission waiver calculation. Its presence does not mean new customer campaigns may waive seller commission. Inspect consumers before changing shared code. |
| Promo policy/repository and order placement | Native fixed/percentage merchandise promos have caps, dates, total/per-customer use limits and finite budget. Placement rejects simultaneous promo/referral selection, validates quoted version and commits usage with the order. Preserve these boundaries and actual funding/allocation facts. |
| `lib/products/discount.ts`, product review plan | Product-price savings derive from actual selling and compare-at prices. They are different from a checkout promo, referral benefit or wallet payment. Detailed price-change review policy and first published-product revision review within 1 business day are approved in [D2](2026-10-31-published-product-edit-rules.md). Product price review does not change platform commission or fixed supply obligations. |
| Managed program workspace and existing reward/referral modules | Program readiness, commercial-model summaries and separate customer reward records already exist. Reorganize their interfaces without making a campaign a substitute for activation or changing earned balances. |

The [older promo/reward design](2026-09-28-promo-codes-daily-points-design.md) is context, not a launch instruction or proof of current deployment. It includes retired checkout paths and proposed numeric defaults; do not launch those checkouts or activate those defaults. Reconcile current modules and later amendments before implementation. This turn inspected local source/documents only, not production policies, effective dates, campaigns, budgets, acceptances or customer balances.

## 3. Workspace layout

Approved focused views under one Fees, programs & promotions area:

| View | Main purpose |
|---|---|
| Overview & upcoming changes | Current policies, published upcoming dates, acceptance gaps, active/ending offers and issues requiring an owner. |
| Seller fees & terms | Registered Seller commission and sale-linked maker fee, exact calculation basis, future publication, consent and history. |
| Customer charges & waivers | Current customer marketplace-fee policy and the separate automatic full-fee campaigns. |
| Discounts & promo codes | Existing merchandise promo lifecycle, usage/cost limits, eligibility, previews and redemption history; links to reviewed product prices. |
| Programs | Managed Maker settings/readiness and supported referral/reward program settings, with separate scope and permission checks. |
| History & performance | Versioned decisions, notices, campaign outcomes, actual discounts/fee relief and linked Finance reporting. |

Each card/row clearly identifies Type, Who benefits, Funding source, Scope, Current status, Nepal start/end time, published revision, usage/cost where applicable, owner and next action. Filters include Scheduled, Active, Paused, Ended/expired, Draft and Needs attention. Lifecycle state and effective status remain distinct: published can mean scheduled, while expired is a time-derived outcome.

Keep one primary editor for each policy/campaign. Seller Management links to the same acceptance record; Finance shows the same original order fee/campaign facts; Products links to the same price revision. A new sidebar group must not expand ordinary staff permissions or create duplicate terms tasks.

The [approved seller price/public-preview design](2026-10-31-seller-price-public-preview.md) carries these approved fee rules into the product editor for this version. It includes an optional private cost/target-profit helper and live rupee estimates without changing the fee base, fixed-supplier model, future effective date or historical order amounts. D19 and detailed D20 pricing/discount rules are approved; the 30-day check is advisory and never automatically removes a discount or forces a price update. [D21](2026-10-31-retail-categories-product-variants.md) now applies estimates to the selected sellable variant/pack with its actual route and fee policy; categories do not silently select a new commission rate.

## 4. Plain fee language and calculations

| Display label | Meaning |
|---|---|
| Selling fee — Registered Seller | Commission on the route's defined eligible sale base. |
| Selling fee — sale-linked Managed Maker | Platform fee under that maker's actual accepted sale-linked agreement. Keep legal/model context available without showing a confusing percentage pair. |
| Agreed supplier amount | Fixed-price supplier model, where actually supported; do not invent a 12% fee or 88% promise for it. |
| Customer marketplace fee | A separate per-order customer charge from the effective policy. It is not a percentage of seller earnings. |
| Customer marketplace fee waiver | Relief of that customer charge only, with a saved campaign/version. |
| Product sale / Promo discount / Referral discount | Separate merchandise-price or checkout benefits with the actual funding and allocation identified. |
| Shopping credit used | Money-denominated credit applied under its allowed rules. It is not another discount, points balance or cash refund. |

Seller/admin ordinary fee summary: Current selling fee [rate] and its calculation basis. Only when a future published change exists, add New selling fee [rate] from [actual Nepal date/time] and the applicable acceptance state/action. No empty upcoming card or persistent old-rate comparison after the change; historical rates remain on historical orders and in History.

Illustration after valid 12% effectiveness, using an eligible NPR 1,000 fee base: Selling fee NPR 120; Amount after this fee NPR 880 before other recorded adjustments. This is not guaranteed profit, immediately withdrawable earnings or a replacement for the route's real tax/delivery/discount rules. Do not independently store a competing 88% value for routine display.

For an enabled NPR 10 customer fee with a valid waiver, show Customer marketplace fee NPR 10, Fee waiver −NPR 10 and Fee payable NPR 0. If the fee policy is disabled or zero, do not invent a NPR 10 saving or a waiver redemption. Ordinary views need not display empty zero-benefit rows. Keep the seller fee unchanged by the customer waiver.

## 5. Commission publication, consent and the common start time

Planned staff journey: choose commercial route → draft rate/basis/terms/reason → choose compliant effective time → preview affected sellers and before/after order examples → publish exact version → monitor consent and exceptions. Expose the real source version and publication time; do not treat saving a draft as starting notice.

Use the actual full 15-day notice interval and Nepal display. Coordinate the distinct Registered Seller and managed sale-linked publications/acceptance versions to achieve the user's common-start policy. If their actual versions/readiness/dates conflict, show a staff task and reconcile before enabling affected new-order behavior. Do not backdate, synthesize consent, silently cancel/reschedule a live policy or hardcode a guessed start date for 12%.

At the boundary T, authoritative placement must use the then-effective policy and matching acceptance for every covered seller. Accepted during notice means Accepted — starts [T], not early fee application. Unaccepted at T means new orders paused, not 9% orders allowed. An unplaced stale cart/quote must be revalidated; a committed earlier order retains its saved fee. Staff contact, email delivery and notification reads are not acceptance.

Use an explicit consent receipt bound to the version, displayed rate/basis, effective date, route, seller and accepting actor/time. A material change must not inherit acceptance of another version. Form styling/help-text changes must not force a fresh consent or destroy saved work; define financial versus editorial version changes in the native policy contract.

For future edits/cancellation: show affected sellers, required notices and the resulting current/upcoming policy before confirmation. Publish a new immutable version for changed financial terms, applying the required notice interval and fresh matching consent where required. Do not rewrite an already-effective policy or retrospectively change orders. Cancelled/replaced future schedules suppress obsolete notices and reevaluate actual required terms without manufacturing acceptance. [Detailed replacement/overlap rules](2026-10-31-fee-publication-schedules-combinations.md#3-replacing-an-announced-commission-change) are approved under D16.

The missing-acceptance hold removes only new-order eligibility. Keep permitted dashboard, document correction, product preparation, support and existing-order handling, and do not freeze otherwise-valid historical payouts solely for this hold. Valid acceptance removes only that hold and resolves its task, with other eligibility checks still active. Public listing availability follows the approved visibility/ordering matrix; never expose private consent history to customers.

## 6. Accepted-terms follow-up — preserve the approved schedule

| Moment | Seller notice / staff work |
|---|---|
| Publication, normally T−15 days | Announce current/new fee, exact start, effect and acceptance action; create persistent dashboard work. |
| T−7 days | Remind only sellers still missing acceptance. |
| T−3 days | Assistance reminder and staff outreach; assign within 24 hours and make first guidance attempt by T−1. |
| T−1 day | Final advance reminder with exact start time. |
| T | Enforce the source-state new-order hold; one relevant seller notice, grouped Super Admin email and immediate queue update. |
| T+3 days | Help reminder for still-unaccepted sellers and unresolved-cause follow-up. |
| T+7 days | Final routine automated seller reminder, individual staff review, then weekly unresolved-case review. |
| Valid acceptance | One confirmation; stop stale reminders and resolve only the terms task/hold. |

Preserve approved post-hold staff review/contact within 24 hours, second attempt by 48 hours and Super Admin review by 72 hours. Assign reported technical/delivery problems within 24 hours with the existing 48-hour technical recovery target and truthful overdue follow-up. Keep daily outstanding/overdue staff summaries only as supplements to the required D22 Super Admin email/dashboard copy for every genuine operational event. Exclude resolved attention work and never create another event or email merely because a scan repeats.

Count deliberate staff resends against the approved rolling 24-hour routine-reminder limit, with distinct state-change notices handled as already agreed. Late joiners get the current relevant notice and case-based follow-up, not the whole missed backlog or a personal 15-day grace period. Outages do not postpone T; retry automatically under the approved mail policy and suppress resolved/obsolete work before handoff. The order-response 6/12-hour schedule and Finance review targets are separate.

## 7. Product discounts and promo codes

Product sale pricing stays in the approved product/version workflow: selling price plus optional genuine compare-at price, with derived savings and no invented reference price. Keep product approval and policy D2's price-review classification; a promotion manager must not silently rewrite a seller's listing or grant publication authority. Placement/homepage featuring is not proof of a discount.

For existing promo codes, recommend a focused editor with code/name, fixed or percentage amount, percentage cap where applicable, minimum eligible merchandise subtotal, Nepal start/end, finite total/per-customer use limits, finite discount budget and reason. Show how much the customer saves, who funds it and the remaining budget. Do not add controls for unsupported category targeting, free shipping or guest coupons simply to make the screen look complete.

Keep current native boundaries: one promo per order; signed-in eligible customer for account-based promo use; no simultaneous promo and referral discount. Preserve shopping-credit rules on the remaining eligible merchandise amount. HastaBazaar-funded benefits must not silently reduce the seller's agreed sale value or change the seller-fee base. If another funding arrangement is proposed later, it needs its own contract/approval and exact allocation rather than a label change.

Draft → preview → publish/schedule → effective activity → pause/end/expiry uses immutable financial revisions and recorded reasons. Existing orders keep their original promo version/amount. Stable code identity and accumulated usage/budget history survive edits and republishing; a retired code cannot be reused for unrelated history. Do not lower limits below actual consumption or automatically reset budgets when a name/date changes.

Quotes show applicable terms and an authoritative amount but do not consume/reserve a promo by themselves. Final placement rechecks identity, cart, eligibility, effective time, revision, stock, limits and budget together. If the last use/budget is gone or terms changed, preserve the cart and show the new total for review; do not silently shrink an advertised discount or place the order at a different payable amount.

## 8. Customer marketplace-fee waivers

Use the approved separate customer-fee campaign model. The editor shows campaign name/description, global scope, fee target, Nepal start/end, reason and the existing Save draft, Publish, Pause, Resume and End controls. Full waiver means the effective positive customer-fee amount once per eligible new order; it is not a cash coupon, merchandise markdown or seller-commission holiday.

Overlapping eligible campaigns do not stack. Preserve deterministic earliest start, then immutable ID selection, and display which campaign actually applies. Pausing one may leave another active waiver; preview that outcome instead of claiming all waivers stopped. Start is inclusive, end exclusive. No publishing/resuming expired campaigns into the past, negative fees or credit from a fee that was never charged.

Current waiver controls have a time window but no proven native financial budget/usage cap analogous to promo codes. Label cost forecasts as estimates; do not display an unenforced hard cap or promise automatic stopping at a spend amount. A new waiver-budget cap is outside the approved D17 scope and is not a prerequisite to finish this plan. Forecast customer-fee revenue foregone and actual waived totals without calling either a cash refund.

Seller-commission waiver records from the older interpretation remain explicitly historical with their original beneficiary/basis. The approved correction retires that old path for new orders; inventory actual retained campaigns/endpoints and show cutover impact before later implementation. Do not relabel/delete records, fabricate campaign closure or convert old orders into customer waivers. No individual seller exemption or seller fee waiver is newly authorized here.

The fee waiver can accompany an otherwise eligible registered, managed or mixed order; it never activates a seller, publishes a product, bypasses consent or makes stock available. It remains one order-level benefit across multiple sellers/items.

## 9. Programs and combined-benefit preview

Managed Maker program cards show actual route/model, configured versus live-ready state, current/future terms, acceptance coverage, outstanding company/seller responsibility and links to the same seller activation/product/Finance records. Do not make a program switch verify documents, enable real settlement, approve products or lift unrelated restrictions. A fixed supplier model and sale-linked model keep their own contracts, obligations and historical calculations; transitions need the existing reviewed route-change process.

Organize existing referral and loyalty/reward settings in separate subviews with their own source versions, budgets/limits and history. Distinguish points earned, shopping credit issued/used and referral benefits. Do not activate old proposed point values, add a cash withdrawal, devalue issued points or reset historical balances. Current supported cycle/reward behavior must be inventoried; the older daily-points document is not authority to replace newer cycles. Pause stops the relevant future earning/usage only under its actual contract, without erasing already-earned liabilities or existing orders.

Recommend an interactive preview within this workspace during later implementation, using a sample cart/date and current or proposed versions. It shows eligibility, exact winning campaigns, customer payable, seller fee/amount basis and HastaBazaar-funded benefit cost separately. A preview is private and creates no order, redemption, acceptance, ledger entry or campaign publication.

| Combination | Baseline to preserve / show in preview |
|---|---|
| Product sale price + eligible promo | Promo operates on the authoritative current eligible merchandise value; preserve native funding/basis rules and prevent double-counting product savings. |
| Promo + referral discount | Current native checkout rejects this combination. Explain the choice instead of silently selecting one. |
| Promo/referral + shopping credit | Apply only under native remaining-merchandise rules; credit is separate payment value and cannot silently cover excluded delivery/customer fees. |
| Customer-fee waiver + eligible merchandise benefit | Distinct targets can coexist where native contracts permit; waive the customer charge once and keep seller fee calculations intact. Verify the combined path before release. |
| Several customer-fee waivers | One deterministic winner, no stacking. |
| Several commercial routes in one cart | Resolve per-line seller/model facts and one per-order customer fee; preserve current ordering gates and historical provenance. |

Displaying a preview does not authorize arbitrary combination/funding changes. Show unsupported combinations as such; do not invent delivery discounts, additional seller subsidies or a single pooled reward balance. The [explicit combination and calculation matrix](2026-10-31-fee-publication-schedules-combinations.md#4-which-benefits-can-combine) is approved under D17; unsupported extensions remain outside scope.

## 10. Publication, pause, errors and authority

Recommend a consistent review-before-publish screen: financial target, who benefits/pays, scope, dates, limits, original/proposed versions, illustrative amounts, affected participants, notices and any blockers. A staff member can save an incomplete draft; publication requires actual action-specific rules. Distinguish a financial policy publication/acceptance change from a short-lived promotional campaign so an unnecessary consent or 15-day timer is not imposed on every unrelated edit.

Preserve current Super Admin/commercial-policy authority for fee policies, customer-fee campaigns and promo mutations, and each program's existing permission checks. Ordinary staff may view assigned acceptance/support tasks as allowed; that does not authorize rate edits or publication. Finance approval is settled by the single-Super-Admin amendment: no compulsory second person. Financial preparation/approval authority remains separate from commercial-policy and product-publication permissions. Any new delegation or approval threshold needs a separate decision.

Every save/publish/pause/end rechecks actor, source revision and timing, records reason/audit and uses a stable request identity. Retrying after an uncertain response must retrieve the prior outcome rather than publish again, restart notice or consume a budget twice. Preserve editable draft input and show changed financial facts when another reviewer has acted. Apply the approved Form Management reliability design: stable core controls with protected money, eligibility, consent and version semantics; irrelevant optional questions cannot disable the workflow.

At quote and placement, use authoritative server time/effective versions even when a scheduler or dashboard was offline. A scheduler sends notices and detects operational issues; it is not the sole enforcement of policy start, campaign expiry, acceptance or budget. Missing trustworthy rate/fee data must surface a specific configuration task and block only the unsafe action; do not guess 9%, 12%, zero or an invented waiver. Saved orders/history remain readable from their own records.

Recommended incident behavior: an authorized, audited pause stops future promotional uses through authoritative eligibility, with a preview of remaining overlapping offers and truthful customer messaging. It must not remove benefits already committed to an order. End/expiry preserves history. Financial policy rollback is a new version/change process, not restoration of an old database or editing accepted order facts.

## 11. Orders, cancellations, refunds and Finance reporting

Save the exact fee policy, accepted route terms, campaign revision, funding source and per-order/per-line amounts at placement. Reports show standard charge, actual charge, customer-fee relief and platform-funded merchandise cost separately. Aggregate order-level fees/waivers once before joining to multiple lines; do not multiply NPR 10 across a multi-seller order.

Cancellation/return/refund calculations use original paid/net amounts and saved allocations. A waived fee has no collected fee amount to refund; partial or repeated refunds cannot exceed actual collectible/refundable amounts or reintroduce a previously waived charge. Preserve actual customer payments/wallet restoration and seller/refund adjustments; campaign cost is not automatically cash payable to the customer.

Preserve the documented native promo baseline: a successfully committed order consumes its promo use and budget even if later cancelled/refunded; failed checkout consumes neither, and replay of the same committed order does not consume again. Communicate that rule clearly and verify all actual native aftercare paths before release. Wallet restoration/refunds use their own original recorded allocation; they do not replenish promo capacity. Do not re-award points or create another credit because a case opened. D18 maps the remaining referral/reward/credit aftercare behavior; any desired change to these business rules needs separate approval. A rolled-back failed order transaction must not leave an orphan redemption or spent credit.

Performance views show committed uses/waived orders, actual benefit cost, related sales with clear basis, remaining promo limits and case/refund adjustments where supported. Label forecasts/contribution illustrations honestly; they are not verified profit or a bank balance. Finance links to these same source records, retaining the approved distinction between liabilities, available earnings and actual transfers. Reports and exports remain permission-filtered.

## 12. Notices and follow-up

Use the approved commission schedule and acceptance queue, with precise policy/version links and scoped resolution. Staff see changed/published/paused/expired campaign outcomes and failed policy operations where action is required. Eligible customers see accurate offer terms at relevant shopping/checkout surfaces; do not send unsolicited bulk promotional email just because a campaign is published. Any marketing distribution/consent policy is separate scope.

Customer transactional notices and receipts reflect the benefit actually committed. A rejected quote or expired offer should not send a You saved confirmation. Concurrent boundary transitions create one canonical outcome, with shared bell/inbox read state for the approved roles. Financial changes and notices must not expose private seller contacts, consent evidence or other customers' redemptions.

Deduplicate event/version/recipient/channel/milestone, retry the same job and recheck current relevance before handoff. Acceptance/resolution or schedule cancellation suppresses obsolete reminders; a genuine new policy may notify. Preserve the approved 5/10/20/40/60-minute then hourly delivery recovery and Super Admin outage/recovery notices. A mail failure cannot alter a fee, restart T, consume a promo use or grant acceptance.

## 13. Later acceptance walkthroughs

| Scenario | Required outcome |
|---|---|
| No future published fee / draft future fee | Ordinary summary shows only the actual current rate; drafts/previous/cancelled versions remain in authorized management/history. |
| Before/at/after common T, old seller/new joiner/accepted during notice | Correct current/upcoming display, no early or personal-delayed application, same new-order 12% rule for covered routes, historical orders unchanged. |
| Missing consent / later consent / stale terms form | New orders held using exact actual version, dashboard/existing obligations retained; acceptance clears only its own hold without duplicate notices. |
| Revised/cancelled overlapping fee schedules | Preview conflicts and resulting consent/notice rules, preserve history and no synthesized acceptance/backdated start. |
| Product sale, capped/fixed promo, referral and credit | Correct native eligibility/funding, clear excluded combinations, no hidden seller subsidy or double-counted savings. |
| Concurrent last promo use/budget, expired or revised quote | At most the valid committed redemptions, atomic order/usage effects, safe re-quote and no silently different payable amount. |
| One/multiple customer-fee campaigns | Actual positive customer fee waived once, deterministic overlap, correct pause behavior and no seller commission change. |
| Zero/disabled customer fee / mixed seller cart | No fictional saving or duplicated order-level fee; all native ordering checks remain active. |
| Retained legacy seller-waiver history | Historical amounts/beneficiary preserved and no old campaign path silently reactivated for new orders. |
| Managed/fixed/reward/referral programs | Correct model and version, no simulation bypass, invented default rewards, rewritten earned points or duplicated liabilities. |
| Cancel/return/refund across changed policy/campaign | Original allocations and net charge, bounded refunds, correct native usage/credit restoration and no new price/rate on an old order. |
| Worker outage, retry, resolved seller, pause/resume races | Effective policies enforced without scheduler dependence; one relevant event, no stale backlog burst or duplicate publication. |
| Permissions, private previews, unavailable forms/data, mobile | Safe scoped controls, no real mutation from preview, retained drafts, specific blockers and readable accessible workflows. |

Use fictional campaigns/quotes, controlled time and isolated fixtures with captured mail when work resumes. Verify display → quote → authoritative placement → saved order → cancellation/refund/reporting and native runtime concurrency. No live policy change is a test. Preserve canonical local launch/data safeguards; staging remains held under the latest preference and no production work starts from planning approval. No application tests or live campaign/fee checks were performed this turn.

## 14. Remaining decisions and scope

- D16 — settled: the detailed authority/replacement rules are approved, including one live future schedule per route/coordinated transition, fresh notice/consent and cosmetic versus financial edits. Preserve the approved 12% common-start and consent-hold policy; implementation/source mapping remain outstanding.
- D17 — settled: the explicit combination/calculation matrix is approved. New targeting, funding arrangements, customer-fee-waiver budget caps and unsupported combinations remain outside scope and do not block the approved plan.
- D18: verify the documented committed-promo/no-capacity-restoration baseline and map remaining referral/points/credit aftercare. This is compatibility work, not a request to select a new refund rule; separately approve any desired business change. Preserve paid/net limits and historical evidence.
- D2 remains the product price-edit review mapping; D10 remains full navigation/release scope. The already-approved reminder/Finance/order targets are not reopened.

Fees, programs & promotions, its [detailed publication/replacement/combination rules](2026-10-31-fee-publication-schedules-combinations.md), and Finance & payments with its targets are approved. Remaining Finance authority/funding and other choices are listed in the decision index; none are silently chosen here. Implementation remains on hold until planning is complete and the user resumes work.
