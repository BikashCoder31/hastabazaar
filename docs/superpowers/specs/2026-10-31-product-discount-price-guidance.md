# Selling price, original price and discount guidance

Status: **D20 pricing and discount rules approved on 1 November 2026, amended by the user's subsequent no-expiry correction**. Selling/original prices, genuine comparison evidence, optional private costs, contextual guidance without a universal price cap, variants and published-price review are approved. The user explicitly removed automatic 30-day discount removal and compulsory renewal/price changes. The 30-day check is advisory only, as clarified below. D19, D21 and D22 remain approved. **Implementation remains on hold.** No product, price, campaign, fee, database or live setting changes here.

## 1. Intent and approach

Make the actual product price easy to identify, keep discount claims honest, and help sellers understand the outcome of their chosen price. Use the approved [D19 calculator and preview](2026-10-31-seller-price-public-preview.md), [D2 product revision rules](2026-10-31-published-product-edit-rules.md) and [fee/discount combinations](2026-10-31-fee-publication-schedules-combinations.md).

Read-only evidence, checked again for this planning update: [the existing editor](../../../components/seller/product-submission-form.tsx) exposes Original price, Discount percentage and Current / selling price together. A percentage edit changes selling price, while changing either price recalculates the percentage. [The display helper](../../../lib/products/discount.ts) already derives savings from the two money amounts, uses one decimal where needed, handles sub-0.1% savings and prevents a positive price showing 100% off. [Current product validation](../../../lib/products/submission.ts) enforces supported positive prices but admits an equal comparison price, which has no saving. Later implementation must reconcile those contracts, rather than hide one field and leave conflicting calculations. This is source behavior, not a fresh production test.

Approaches considered:

- Keep three equally prominent editable fields: preserves the current interaction but leaves competing inputs and unclear authority.
- Enforce universal minimum/maximum margins or category-average price caps: cannot establish fair prices for different materials, labour, quality and custom work; no reliable market benchmark is established by this plan.
- **Recommended:** one primary Selling price, an optional discount section with derived savings, the approved private earnings helper, and staff review of actual public prices/claims. An optional percentage tool proposes a price through an explicit Apply action.

The user approved contextual pricing guidance and review without a universal cap, with optional private costs. The detailed discount controls/reference-price treatment remain proposed for review. No market-data collection, AI valuation, automatic price change, promotion scheduler or compulsory cost disclosure is added.

## 2. Seller fields and customer display

| Seller control | Behavior |
|---|---|
| **Selling price (NPR)** | Prominent first field: the actual per-item merchandise price before any separately disclosed checkout charges or permitted checkout benefits. This is the authoritative price for the draft. |
| **Show a discount** | Off for a new product unless the seller chooses it. Existing valid comparison-price drafts restore their actual selection. A normal product does not need an original price. |
| **Original price (NPR)** | Appears when showing a discount. Help: Your genuine previous selling price for this same item/option. It needs the reference review described below; do not raise it merely to create a larger discount. It is not the seller's cost, profit target or an automatically accepted manufacturer price. |
| **Customer saving** | Read-only amount and percentage derived from Original price and Selling price. No independent saved percentage that can disagree with the prices. |
| **Calculate from a discount** | Collapsed tool: with a valid original price, enter a percentage to preview a new selling price, savings and the updated fee/net/profit result. **Use this selling price** updates only the draft/revision. |
| **Price and earnings summary** | Approved D19 breakdown on the actual selling price. Keep private cost/target values separate from the original price and customer-facing output. |

Customer example, for an approved comparison price:

**NPR 1,200** · ~~NPR 1,500~~ · **Save NPR 300 (20% off)**

Seller example using the same merchandise value, an applicable 12% fee on that full value, no other deductions and an entered NPR 800 cost:

| Calculation | NPR |
|---|---:|
| Selling price | 1,200 |
| Selling fee | 144 |
| Amount after selling fee | 1,056 |
| Private entered cost | 800 |
| Estimated profit based on entered cost | 256 |

The customer discount is 20%; the selling fee is 12% in this illustration. They have different meanings and bases. Do not calculate the fee on NPR 1,500, add 20% and 12% together, or present 1,056 as available payout. Actual route/base/deductions and effective policy govern the real calculator. Fixed supplier arrangements retain their approved separate calculation and price authority. No current effective date/rate is inferred from this example.

### 2.1 Keep the price meanings separate

| Amount | What it means / who sees it |
|---|---|
| Selling price | Actual merchandise price for the selected sellable unit, shown to customers once published. Separately itemized delivery/checkout charges and eligible benefits remain separate. |
| Original price | An approved genuine previous selling-price comparison for that same offer. Show it crossed out only while its current claim is supported; it is not another amount charged. |
| Saving | Original minus selling price, plus the percentage calculated from those two amounts. It is not seller earnings or a second deduction at checkout. |
| Seller cost and target profit | Optional owner-private inputs to the pricing helper. Never copied to ordinary support/admin review, public output, email or reports. Blank cost is not zero. |
| Selling fee / amount after fee | Seller/admin calculation using the actual route, applicable effective policy and permitted base. Customer savings and platform fees are different calculations. |

Without Show a discount, display only the valid Selling price. Do not require Original price to submit or publish an otherwise-valid normal-price offer. With missing/invalid prices, preserve D22 draft and assistance access; the preview shows Price not provided or the precise conflict, never a fake zero/free offer.

## 3. One calculation authority and clear editing rules

- Savings amount = original price minus selling price. Savings percentage = savings amount divided by original price, multiplied by 100. Calculate using canonical integer-paisa money and the supported rounding/price limits; derive presentation percentages from the final money amounts. Never calculate money from a rounded display badge.
- Selling price must satisfy the existing domain limits and be positive. When Show a discount is on, Original price must be valid and strictly greater than Selling price. Explain the error next to those fields; allow an incomplete draft and D22 assistance intake, but never approve/publish an invalid enabled price pair. Retain invalid text as flagged draft input rather than converting it into authoritative money. Equal prices should use normal-price presentation. Invalid, zero, negative, blank, nonfinite or over-precision values do not create a fake saving.
- The percentage helper requires a value above zero and below 100 and a resulting valid positive selling price. Show the rounded final amount and its derived saving before Apply. A tiny positive price must never display as 100% off/free. Reuse or deliberately reconcile the existing display precision in all consumers; do not let input precision imply a different realized discount.
- Editing Original price normally keeps Selling price unchanged and recalculates savings. Editing Selling price recalculates savings, fees and private estimated profit. Only the explicit percentage helper applies a new selling price. Avoid circular updates and silent changes on blur, refresh or a fee-policy boundary.
- D19 **Use this price** changes Selling price only. If the existing original price is now equal/lower, keep the entered values and highlight the conflict with actions to remove the discount or correct its genuine reference. Never manufacture a higher original price to preserve a badge.
- Turning off Show a discount removes comparison-price display from the editable candidate and leaves Selling price unchanged. It does not raise the price to the old original amount. Preserve undo/draft recovery and the old published version until the required review/publication completes. Do not automatically end a sale or introduce a new timed-price feature.
- Store/revalidate the actual two-price candidate on the server. Client-supplied savings, fee or profit are not authority. Price/version changes preserve drafts and require normal review; published historical order prices and savings snapshots remain unchanged. Customer quotes are revalidated under the existing checkout rules.

### 3.1 Common editing cases

| Seller action or supplied values | Planned result |
|---|---|
| Selling 1,200, discount off | Preview NPR 1,200 only; no original price, saving or discount badge is needed. |
| Original 1,500, selling 1,200, discount on | Preview Save NPR 300 (20% off), subject to reference review before public display. |
| Original and selling both 1,200 | Explain there is no saving. Offer Turn off discount without changing Selling price; do not publish a zero-percent discount claim. |
| Original 1,000, selling 1,200 | Flag that Original must exceed Selling for a discount. Preserve both inputs and offer to remove the claim or correct its genuine reference; never inflate Original automatically. |
| Original is blank, invalid or unsupported | Incomplete draft/help submission remains available. The claim cannot publish; normal-price publication becomes possible after the seller explicitly removes it in the candidate or supplies a supported valid reference. |
| Seller changes Original from 1,500 to 1,600 | Keep Selling at 1,200; recompute the draft saving. The changed reference claim needs fresh review/evidence, not automatic approval. |
| Seller enters 25% in Calculate from a discount, Original 1,500 | Preview Selling 1,125 and Save NPR 375 (25%). Apply only through Use this selling price; do not change a live product or submit automatically. |
| Profit helper suggests a Selling price at or above Original | Apply only the requested Selling price in the draft and identify the comparison conflict. Do not invent a higher Original to preserve the badge. |
| Seller turns discount off | Candidate retains its current Selling price and removes its comparison display. Existing public content changes only through the permitted review/publication or scoped moderation process. |
| Seller wants to end the offer and charge a higher regular price | Explicitly enter the intended new Selling price and submit that price change for review. Turning off the badge alone does not raise the payable amount. |

Draft preview marks an unapproved comparison as a draft. A reference review or calculator failure preserves input and gives a precise help/Retry path. It cannot create a new required-cost field, clear unrelated details or bypass authoritative price/publication checks.

### 3.2 Currency, rounding and discount magnitude

Keep canonical integer-paisa money and existing supported price precision/domain bounds. A calculation helper must show the final supported Selling price and actual derived saving before Apply. Do not store a separate editable discount percentage that competes with those money values.

Carry the existing display convention consistently into card/detail/preview: up to one decimal where needed, **<0.1% off** for a real smaller saving, and never **100% off** while a positive Selling price remains. Show the exact supported money saving; percentage rounding never changes the price, tax/fee base or refund. Example: Original NPR 1,000 and Selling NPR 999.50 save NPR 0.50; the percentage is below 0.1%, not zero money saved.

A positive product Selling price remains necessary under the actual domain contract. The percentage helper accepts more than 0 and less than 100, with a resulting supported positive price; this does not prohibit a separately supported fully funded checkout promotion under D17. Do not add free-product/timed-sale behavior by implication.

There is no new universal maximum discount percentage or minimum margin beyond valid arithmetic and actual supported price bounds. A very large claimed discount receives factual price/reference review; it is not automatically accepted because the math works or rejected by an invented percentage threshold.

## 4. Truthful comparison prices and admin review

Original price is a supported comparison claim, not a marketing number to inflate. A new product with no genuine previous offered price can be submitted and published at its Selling price without a discount badge. Do not fabricate an original price from cost, profit target or a desired percentage. A listing can be new to Hastabazaar but have genuine prior seller-offer evidence elsewhere; assess that evidence rather than treating platform age as automatic proof or disqualification.

Admin product review shows the candidate selling/original prices, derived saving, last approved public price/version and any available dated price history. Review the same product/quantity/quality, not a different item or bundle. A comparison claim needs a recorded supporting reference: an actual prior public price/version or other dated evidence the authorized reviewer checks. Do not require every seller to upload another document when existing price history supplies that evidence. Staff can ask for clarification without access to private cost/target values.

An unsupported original price must be corrected or removed before the candidate discount is published. Reviewing the comparison claim is part of the normal product/price review, not a separate financial payment approval. Staff may return a specific correction; a seller can remove the claim and continue at the proposed selling price through the usual review path. Do not quietly rewrite the seller's selling price or mark unverified claims approved.

Before later rollout, inventory existing comparison-price records and preserve history. Legacy original prices are not automatically proven by migration. If their claim cannot be supported, queue review and suppress the unsubstantiated crossed-out/savings presentation consistently while retaining the otherwise-valid actual selling price and listing; do not mass-delete products or rewrite orders. Record the presentation restriction, notify the owner through the normal review channel once, and permit correction. Reconcile actual media/price/cache consumers before enabling this change.

Public card, product detail, shop/search, customer preview, saved/cart summaries and supported metadata must agree on the same approved prices and savings presentation. Checkout benefits remain separate under D17; a promotion/referral/credit does not invent a new original price or merge into the product's discount badge. No unapproved comparison claim leaks from a private draft preview or stale cache.

### 4.1 What supports Original price

Approved reference standard: a genuine previous regular selling offer from this seller for the same product/variant, quantity/pack, condition and comparable offer scope, in the supported currency. It must have been genuinely available to buy; an unpublished draft, proposed launch price or browse-only price before ordering was enabled is not evidence of that earlier selling offer. A completed prior sale can support it but is not the sole possible evidence.

| Source | Review treatment |
|---|---|
| Actual platform price/availability history | Prefer existing dated public-offer history and relevant evidence. A raw comparison-price column or approval badge alone does not prove the item could be bought at that price. Do not demand another upload when verified history supplies the facts. |
| Seller's earlier offer outside the platform | Accept for review an identifiable dated catalogue/listing/receipt or other evidence of this seller's actual offer, with the item, unit and period matched. Retain private evidence/reference; a screenshot alone is not an automatic approval. |
| Manufacturer MRP/RRP, another shop's price, wholesale cost or a hoped-for future price | Do not silently use it as this seller's previous Original price. An MSRP/market-comparison discount program is not added in this version. Genuine manufacturer/specification information may still appear where the approved category contract supports it, without becoming an unreviewed savings claim. |
| Temporarily inflated, stale or materially different offer | Do not automatically approve it from the number or age of a record. Inspect the actual history/period and comparable unit/condition; request clarification or remove the unsupported claim. Do not select the highest historical price simply to maximize a percentage. |

Record the evidence/source reference, price, offered period, exact offer identity and reviewer basis. The approved reference is bound to the particular candidate/price pair and evidence version; it is not a reusable permission to choose any future higher number. No arbitrary universal look-back/minimum-days rule or new statutory claim is invented here. The advisory 30-day check below is not an approval expiry, proof that a seller's earlier price is genuine or a legal safe harbour. Thirty days passing alone is not evidence that a comparison is inaccurate. Actual applicable price-claim requirements must be mapped before live release; a concrete conflict returns for review instead of being guessed.

Every later price/reference or material offer change returns through D2 review. Show the last actual public Selling price and change amount/percentage alongside the proposed reference. For example, a rise from 1,000 to 1,200 is visibly a 200 price increase even if the seller proposes an older 1,500 comparison; the reference's relevance must be reviewed afresh. Publication history never changes old order prices.

#### Advisory 30-day price check — latest user correction controls

The user explicitly said the discount must not be removed and changing prices must not be compulsory. Therefore a reviewed discount continues at its approved Selling/Original prices after 30 days unless the seller chooses a reviewed change or an actual evidence-based moderation issue requires action. No monthly renewal, required upload, order/payout hold, automatic price change or automatic badge removal follows this advisory check.

The following reminder mechanics carry forward the previously agreed 7-day/1-day spacing as informational prompts, without an expiry or response deadline:

- For a genuinely public discounted price pair, suggest a check 30 elapsed days after that price pair is first published. Send the two advisory notices 7 days and 1 day before that suggestion date (days 23 and 29). An Approve only/unpublished candidate starts no public-price reminder. Ordinary text edits, pauses, stock changes and republishing the unchanged prices do not reset the cycle.
- Copy: **Review your prices if you want to make a change. Your approved prices and discount will stay as they are.** Show this under Suggestions, not overdue/required tasks. Actions are Review pricing and optional Dismiss suggestion. Taking no action is valid. There is no forced Keep current prices confirmation.
- A seller may change pricing at any time, before or after the suggestion date. Draft edits do not alter public prices; D2 review and explicit publication still apply. A real newly published Selling/Original pair can start its own advisory cycle. Do not generate endless 30-day repeats for an ignored unchanged price pair.
- A relevant published update, removal of the comparison, explicit dismissal or loss of public visibility stops obsolete pending notices. Reappearance of the identical pair does not backfill skipped notices or manufacture another cycle. Retain one cycle identity so retry/republication cannot duplicate it.
- Group due offer suggestions for the same product/window into one message/task, listing the affected variants. Do not send one copy per variant or staff role. Use the approved seller/review-owner routing and Super Admin email plus dashboard/bell visibility; there is no mandatory admin response deadline or escalation merely because this suggestion is ignored. Notification delivery failure monitoring remains separate.
- At day 30 and later, keep the valid price pair and discount display unchanged. Do not store or expose an expiry countdown, Claim expired status, renewal requirement or an automatic removal job for this suggestion.

Example only: Original NPR 1,500 and Selling NPR 1,200 show Save NPR 300 (20% off). After 30 days they still show the same figures. If the seller later chooses Selling NPR 1,100, it becomes public only after normal price review/publication; existing orders keep their recorded amounts. The seller does not have to change a price or re-enter the product.

Ordinary evidence-based review still applies if a comparison is actually unsupported, inaccurate or materially changed. Passage of 30 days, ignoring an advisory notice or leaving a valid price unchanged is not such a finding. Existing unsupported claims/media use the scoped correction process below. Keep comparison figures in the controlled Pricing display so duplicate image/text claims do not become inaccurate when the seller does choose a change; genuine packaging/manufacturer facts are not automatically this seller's Original-price claim.

### 4.2 Admin workflow and existing claims

One product review shows current and proposed Selling/Original amounts, derived savings, exact variant/pack, the previous public price/history, reference evidence and seller explanation. Price-only candidates stay concise; private cost/target values are excluded. Do not make an unrelated category field or a four-photo requirement block an otherwise-valid price correction.

Use existing **Request changes**, **Reject candidate**, **Approve only** and **Approve & publish** authority. A reviewer can request a missing reference or a corrected/removal candidate. Support/staff-prepared factual changes use D22 confirmation rules. Do not silently change the seller's Selling price or partially approve a price while publishing unreviewed shared product content. The complete-product/revision targets already approved remain in force; this creates no separate financial approval or compulsory second reviewer.

For an already-public unsupported claim, use a scoped, auditable comparison-presentation restriction under the authorized product/moderation workflow. Preserve the stored historical prices/evidence but suppress the unsubstantiated crossed-out price, saving and related structured claim across public consumers. Keep the actual Selling price and listing available if their other requirements remain valid. Notify the seller of the precise correction, with one linked review task.

Inspect claims embedded in titles, descriptions, photos and promotional placements as well as the structured badge. Hiding the badge does not fix an unsupported claim still printed in the cover image. Request/prepare the necessary content correction; if the misleading content cannot be safely isolated while retaining a valid truthful listing, use the existing scoped withdrawal process with a reason and next action. Do not mass-delete products or rewrite historic orders to clean up claims.

A corrected claim can return only through fresh exact-version review and explicit publication/restoration of that restriction. Draft edits, a cache refresh or a successful calculator response cannot restore it. Ordinary pending-price revisions keep the last valid public version; a genuine active misleading claim is handled through the separate scoped moderation action.

Legacy rollout must inventory affected references, confirm compatible display/metadata consumers and attach correction outcomes before calling the change complete. It must not label every old value verified or silently increase any customer price.

### 4.3 Variants, checkout and notifications

Each approved D21 offer carries its own Selling price and any reviewed Original price. An explicit bulk Apply can prepare equal prices/references for selected rows, but reference validity still matches each actual offered unit. Never compare a single-item price to a pack, one capacity to another, or the cheapest Selling price to a different variant's highest Original price.

Keep the approved D21 public display rules: use the actual eligible From-price set; show a common parent saving only when the represented offers share the same valid price pair, otherwise show the selected offer's saving. No unreviewed Up to X% campaign is introduced.

D17 combinations stay unchanged: product markdown is already included in Selling price; an eligible promo OR referral uses that merchandise value, then eligible credit, with any customer-fee waiver separate. Do not add product and promo percentages, treat credit as a discount or deduct the markdown twice. Platform-funded benefits keep their approved seller-base treatment. The selling-fee calculator uses the applicable Selling-price base, never the crossed-out Original price.

Price/reference edits do not reprice committed orders, change their fees/refunds or restart an issued manual-payment window. Unplaced carts/quotes revalidate the current authoritative offer and show any changed price/claim before the normal customer confirmation. Removing a false saving cannot silently change the Selling price.

All genuine submissions, feedback, decisions, publication/restriction/restoration and other operational notification events use the approved seller/team routing and mandatory **Super Admin email plus dashboard/bell**, including the acting Super Admin. Deduplicate by event/recipient/channel; suppress obsolete reminders and retry eligible failures automatically. No email is generated for every price keystroke, and a price change does not create an unsolicited customer marketing campaign.

## 5. Help with low or high prices — approved approach

**Low-price guidance is private and evidence-based.** If the seller supplies costs, show estimated loss, break-even or profit using the applicable route and known deductions. If a target is supplied, show Below your target and the optional supported target-price suggestion. Empty cost does not mean zero. Helpful warnings do not create a minimum margin or prevent an otherwise-valid intentional low-margin/loss-leading price from reaching review. These private warnings, costs and target values do not enter normal reviewer payloads.

**High-price review needs context.** Show the seller and reviewer the difference in NPR and percentage from the last approved public selling price, where one exists. Give reviewers relevant public materials, size, craftsmanship, preparation and product details, then allow price clarification/correction through the existing review workflow. A new product has no invented previous price or market average. Do not label a handmade item overpriced solely because it exceeds a category average, has a high margin or differs from another seller's work.

There is no new universal numeric cap, minimum profit, automatic market-price claim or percentage-based auto-rejection. All public price changes already require D2 review. That review handles large changes and unsupported discount claims while the calculator catches arithmetic and seller-cost mistakes. The system cannot guarantee a fair market price from the two price fields or self-reported costs alone. Future benchmark-based advice would require a separately reviewed data source and policy; it is not added to this version by implication.

D21 [category/variant planning](2026-10-31-retail-categories-product-variants.md) applies this guidance to each actual selected sellable unit. Never mix one variant's lowest selling price with another variant's original price or private cost.

## 6. Later acceptance cases and remaining decision

Later verify: normal price with no original; valid/invalid enabled discount; blank/zero/extreme values and rounding; percentage Apply versus ordinary edits; target helper conflicting with original price; turning discount off retaining selling price; current/future fees and unsupported models; private cost non-disclosure; documented and unsupported legacy/new claims; pending revision versus public version; no 100% badge on a positive price; consistent public consumers; old cart revalidation; immutable orders; mobile/keyboard/draft/error recovery; exact reviewer authority and deduplicated correction notices.

Include same/different variant or pack references, prior genuinely orderable history versus browse-only/draft history, external same-seller evidence, MRP/competitor/cost misclassification, inflated/intervening/stale price history, unsupported claims embedded in media, isolated badge restriction versus necessary withdrawal, corrected restoration and stale publication races. Verify the exact numerical examples, no percentage stacking and no drift between draft/approved/public/order values.

For the advisory check, verify 23-day/29-day notices before the suggested day-30 review point, no expiry/mutation at day 30 or later, optional dismissal, no overdue escalation or automatic repeated cycle, stopped obsolete reminders and unchanged actual prices/orders. Verify product/variant batching, unpublished/hidden versions, changed versus unchanged price publication and notification deduplication. Actual unsupported claims remain subject to the ordinary evidence-based moderation workflow; time alone does not trigger restriction.

- [x] Preserve approved D19 pricing/profit/customer-preview behavior and all-version inclusion.
- [x] D20: user approved private optional cost-based guidance and contextual admin review without a universal price cap; costs remain excluded from normal admin review.
- [x] User approved the detailed D20 pricing/discount rules on 1 November 2026; then explicitly amended the 30-day check to retain the discount and make any seller price update optional.
- [x] Supersede the previous automatic-expiry/compulsory-reapproval proposal. The advisory check must never remove a discount, change a price, block orders or require a response solely because 30 days passed.
- [x] Carry forward approved price controls, reference evidence, scoped unsupported-claim correction and the latest no-expiry instruction. Final paired-screen presentation is now approved on 1 November 2026.
- [ ] Map actual price/history/rounding/metadata contracts and prepare isolated acceptance evidence after planning is complete; never treat this proposal as a production test.

**Implementation, configuration publication and deployment remain on hold.**
