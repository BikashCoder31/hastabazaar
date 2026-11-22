# Seller price guidance and public-information preview

Status: **approved for this version by the user, 31 October 2026**. Approval covers the integrated live selling-fee calculator, optional private cost/target-profit helper, clear public/private groups and customer card/detail preview described here (D19). The [version scope checklist](../plans/2026-10-31-complete-version-scope.md) retains all active work. The separate [selling/original-price and discount guidance](2026-10-31-product-discount-price-guidance.md) has subsequent D20 approval for its detailed rules, amended to retain discounts beyond 30 days without compulsory price changes. **Implementation remains on hold** until planning is complete and the user explicitly resumes work. No price, rate, cost record, form, account, product or deployment is changed.

## 1. Approved approach and existing boundaries

Add two connected parts to the existing product editor: **a live price-and-fee summary beside Selling price**, and **a customer preview in the existing Review step**. Offer a collapsed optional cost/target-profit helper. This gives useful information at the point of the decision without making sellers complete an accounting worksheet or another long form.

A general fee explanation in Help would not show the deduction for the actual entered price. A separate calculator would require copying values and could drift from the active rate. The integrated approach is approved, with the same authoritative calculation contract as the relevant commercial route. Applying a suggestion changes only the seller's editable draft/revision; the helper never changes a published price automatically.

Carry forward [Fees & programs](2026-10-31-fees-programs-promotions-workspace.md), [approved fee/discount rules](2026-10-31-fee-publication-schedules-combinations.md), [product-edit review](2026-10-31-published-product-edit-rules.md), [Form Management](2026-10-30-form-management-reliability.md), [field cleanup](2026-10-30-form-management-field-inventory.md) and the [paired screen walkthrough](2026-10-31-seller-customer-screen-walkthrough.md). D19 itself adds no rate change, tax rule, new discount funding or language/verification-badge policy. The subsequent [D21 expansion](2026-10-31-retail-categories-product-variants.md) now explicitly includes real selectable variants and new-only retail/resale; apply the calculator/preview to each selected sellable unit, not an average parent price.

Read-only source evidence: [product submission](../../../components/seller/product-submission-form.tsx) already carries selling/comparison prices and a customer-photo preview. [Commission text](../../../lib/commission/rates.ts) names a defined eligible base and exclusions, but retains the older accepted-rate continuation wording already identified as conflicting with the approved common-start rule. [Product discount helpers](../../../lib/products/discount.ts) concern merchandise markdowns, not seller commission. Reconcile actual quote consumers and commercial models during implementation; copying an old helper or hardcoding 12% in a new card is not a complete solution. No live schedule or calculator capability has been verified here.

## 2. Price entry and understandable amounts

Keep Selling price prominent. Beside/below it, show a compact per-item summary:

| Display | Meaning |
|---|---|
| **Selling price** | The proposed actual selling price, not the crossed-out comparison price. |
| **Selling fee — [applicable rate]** | The fee amount in NPR, with a short expandable explanation of the applicable route and calculation base. |
| **Amount after selling fee** | Selling value less the displayed selling fee only. It is not available payout or guaranteed profit. |
| **Estimated amount after known deductions** | Show only when other applicable deductions exist, each listed separately. Use this remaining amount as the basis before subtracting entered costs; do not label it merely Amount after selling fee. |
| **Your cost per item** | Optional private seller estimate. Help asks for materials, labour, packaging and other seller-borne costs not already shown as deductions. |
| **Estimated profit based on your costs** | Shown only when the seller has supplied a cost, including an intentional zero. State which known deductions are included and that other order adjustments may change the outcome. |

Show any additional known deduction on its own line rather than hiding it inside Selling fee. When costs are blank, do not silently assume zero or label the amount after fees as profit. Do not show a competing percentage pair such as 12%/88%.

Illustration only, using an applicable 12% fee on the full NPR 1,000 selling value, no other deductions and a seller-entered NPR 600 cost:

- Selling price: **NPR 1,000**.
- Selling fee: **NPR 120**.
- Amount after selling fee: **NPR 880**.
- Your entered cost: **NPR 600**.
- Estimated profit based on those costs: **NPR 280**.

The example is not a statement that 12% is currently effective for every seller/model. It does not promise a settlement amount or exclude the impact of valid returns, taxes, order adjustments and other seller costs. Use a short scope explanation in the interface, not a long policy notice beside every input.

The preview updates when the seller changes the draft price. Debounce and cancel/ignore older responses so a slower previous calculation cannot replace a newer one. Show Calculating, current result, or Estimate unavailable distinctly. Keep the draft price and input when the estimate is unavailable; an optional calculator must not become another form-configuration dependency. Valid draft saves and otherwise-permitted review submission may continue under their existing domain checks. Do not invent a zero fee, misleading profit or weakened order-readiness rule as fallback.

## 3. Optional target-profit helper

Expandable action: **Help me choose a price**. Inputs are **Your cost per item** and **Target profit per item**, both amounts in NPR. Start with money amounts rather than confusing profit-margin/markup percentage definitions. No seller must disclose costs or use this helper to list a product.

For a simple percentage-only scenario, the explanatory relationship is:

`candidate price = (entered cost + target profit) / (1 - applicable fee rate)`

This is explanatory, not an independent production calculator. The actual helper evaluates candidates through the same authoritative fee/base/deduction and currency-rounding rules as the route. It must round to a supported price increment and verify the resulting estimate reaches the selected target within the stated scenario; never round down and promise a target that the quote does not reach. Respect actual price limits. Invalid inputs, unavailable policy or an unsupported/non-percentage model produce a clear result instead of an arbitrary price.

Illustrative whole-rupee suggestion with the same simple 12% scenario: cost NPR 600 plus target profit NPR 400 suggests **NPR 1,137**. The fee is NPR 136.44; amount after the fee is NPR 1,000.56; estimated profit after entered costs is NPR 400.56. If supported price increments include paisa, the authoritative solver may find a closer valid price. Do not describe the whole-rupee example as the exact minimum for every rounding contract.

Show **Use this price** with the proposed selling price and resulting breakdown. Applying it changes only the current editable draft/revision and is reversible before submission. It does not publish a product, create a promotion, change a comparison price or accept selling terms. For a published product, normal D2 review/publication remains required. The seller may choose another allowed price; the estimate updates without forcing the target profit.

Costs/targets are assumptions, not verified financial facts. Show a neutral Below your target indication if the chosen price produces less than the entered target; do not create a new mandatory profit minimum or block an otherwise-valid product solely for that reason.

## 4. Current rates, future rates and calculation scope

- Read the actual commercial route, effective policy/version, fee base and applicable known deductions. Registered Seller commission and sale-linked Managed Maker fees must follow their own contracts. A fixed supplier amount uses its agreed supplier-price presentation, never a fabricated 12% deduction from retail price. Where retail price cannot determine the fixed supplier's earnings, explain that limitation and omit the unsupported inverse-price helper; do not grant new retail-price authority.
- With no future published change, show only the current effective fee. During the approved notice period, show the current estimate and a clearly labelled upcoming estimate with the actual Nepal effective date/time. Target-price calculation defaults to current terms; when a future version exists, let the seller explicitly select that future scenario. Do not silently switch the calculation basis.
- From the common effective time, covered new orders use the new effective policy and require its actual acceptance. A missing acceptance does not keep the old rate for new-order estimates or allow an order. The calculator explains the required acceptance separately and never accepts on the seller's behalf. Historical orders retain their recorded rate.
- Recalculate after a genuine published policy replacement/cancellation or effective-time boundary. Preserve the typed price/cost/target and identify the changed estimate. Do not change a saved/public price automatically or restart the whole form. Admin review sees the actual candidate price and current policy context; a prior preview cannot lock a future commission rate.
- Use the actual selling value and eligible base, excluding items such as separately stated taxes/delivery where the route requires. A comparison price is not the commission base. Respect the approved rule that platform-funded promo/referral benefits and existing shopping credit do not reduce the seller's recorded merchandise/commission basis. Actual product markdowns change the selling price. Do not introduce a seller subsidy or subtract the same deduction again as a cost.
- Default to a clearly scoped **per-item normal-sale estimate**, without guessing a future buyer's promo, cart quantity or delivery/return outcome. Order-level allocations and rounding can differ from multiplying a rounded one-item display. An actual order/earnings statement always uses its committed financial snapshot and real adjustments.
- Use integer-paisa inputs/results and the canonical rounding/allocation contract. Keep rate, basis, scenario/version and observation time with the preview context. Revalidate relevant calculations when applying/submitting and at actual order placement; a client-supplied fee/net-profit figure is never financial authority. Candidate search method and exact API design are builder choices, provided these invariants hold.

## 5. Private calculator data and public field labels

Use three clear information groups in the product editor:

| Group label | Examples | Visibility |
|---|---|---|
| **Shown to customers** | Product title, descriptions, cover/gallery, actual published price, supported public SKU, materials, dimensions, public preparation/care details and other mapped storefront fields. | Included in the customer preview; only the approved published version becomes public. This label is not a claim that a draft is already live. |
| **Private review information** | Supporting evidence or notes actually required for staff review. | Available only to the owner and explicitly entitled reviewers under current permissions; excluded from storefront output. |
| **Private pricing calculator** | Seller-entered cost and target profit. | Available to the owning seller's pricing workflow; not included in public product data or normal admin product-review payloads, notifications or reports. |

Label sections and mark exceptions inline; do not clutter every field with long warnings. Keep field names simple and show examples as help, never as prefilled product claims. Preserve the user's requested clean labels and existing optional-field behavior. Do not call a field private merely because it is hidden in one preview: the existing public SKU and every card/detail/metadata consumer need an explicit field map.

Save private calculator values only through authenticated, owner-scoped draft storage separate from public/reviewer serialization. They should return with a successfully saved private draft, with clear saved-state feedback. Do not log their values in general analytics/audit diagnostics or copy them into ordinary staff exports. The seller may clear them without altering historical orders or the public product. Apply the existing protected draft-retention rules; final technical mapping must identify real storage and access paths. Full infrastructure-level recovery remains governed by existing controls, not an “only you under all circumstances” promise. No new staff access to sellers' private costs is implied.

No PAN/citizenship numbers, bank data, pickup/return addresses, private evidence or internal review notes can enter public components, preview metadata or shared media by being classified as a product detail. Existing customer-visible contact fields retain their approved/current exposure policy; this feature does not redesign that excluded policy.

## 6. Preview before submission and better completion quality

Use the existing **Basics → Photos & details → Review** flow. Price guidance belongs in Basics. The final Review step displays the actual draft as a **product card and product-detail preview**, with supported mobile/desktop presentation and clear Draft preview — not public status. Give each section an Edit link back to the relevant fields while preserving all other progress.

The preview must use the actual allowed field/media presentation contract, including title wrapping, cover crop, price, description paragraphs, supported attributes and preparation information. Preserve original private images where the existing media workflow requires; preview the real public rendition. If a preview cannot be prepared, explain what is unavailable, retain the draft and offer Retry; do not fabricate a successful customer view or release private original URLs.

Show one short review prompt: **Check the title, photos, price and details customers will see.** The main action remains **Submit for admin review**. This is the current review step, not another long confirmation form or new mandatory acceptance checkbox. Pending reviews/new prices still require the existing approved review/publication flow.

Reduce casual/incomplete entries through useful help and visible results:

- Short, field-specific prompts such as what the buyer receives, actual size/material and preparation time; no forced new language, translation or unsupported attributes.
- Under subsequent [D22](2026-10-31-optional-product-intake-support.md), identify missing publication/order facts, failed uploads and invalid supplied values through non-blocking intake guidance and precise later-action validation. Incomplete or zero-cover intake reaches assistance; one accurate cover can suffice before publication and gift occasions stay optional. Do not force costs/materials or a four-photo rule.
- Highlight known placeholder/example text and contradictory supported values as correction guidance. Only existing domain/quality rules are blocking; do not create an opaque automatic quality score or auto-reject a product because a description is short.
- Keep optional/private details collapsed until relevant, with clear public/private grouping. The seller can see the exact description/photos that need care before submitting.
- Staff review compares the exact candidate customer preview with submitted evidence and the last public version where applicable. Staff may return specific corrections. The calculator and a seller viewing the preview are not product approval, document verification or a guarantee of description truth.

D22 now keeps every supported product-detail group accessible with optional seller intake and a linked Get help action. The private preview may show clearly labelled missing-value placeholders, never fake facts. Support receives authorized ordinary draft context but never private cost/target values; Super Admin receives the corresponding email/dashboard oversight notice. See the [D22 workflow](2026-10-31-optional-product-intake-support.md).

## 7. Later verification and decisions

Later implementation must verify the eligible normal-sale example and target helper against actual pricing contracts; per-item versus multi-quantity rounding; current/upcoming/cancelled/replaced rates; exact effective-time boundary and unaccepted terms; fixed supplier models; price changes during pending review; platform-funded benefits versus markdowns; unknown/missing fees; cost blank versus zero; stale response ordering; persisted private costs and unauthorized/public/export access; no duplicate deductions; mobile preview parity, private media, required/optional field behavior; and draft recovery without new submissions or automatic publication.

- [x] Record the user's need for price/fee understanding, target-profit guidance and public-detail awareness in this version's scope.
- [x] The user approved the integrated estimate, optional private cost/target helper, public/private grouping and customer preview behavior for this version on 31 October 2026.
- [x] Record subsequent approval of D20 contextual guidance/no universal cap and optional private costs.
- [x] Record detailed D20 and D21 approval, including the latest no-expiry/no-compulsory-price-change correction; D19 stays approved.
- [ ] Map and reconcile actual commercial calculation/storage/media contracts before implementation, without treating source inspection as a passed production test.

The approved selling-fee policy, historical order snapshots, product-review authority and existing optional-registration rules are unchanged. **Implementation and deployment remain on hold.**

### D20 price-control integration — approved with correction, 1 November 2026

The expanded [approved D20 original-price/discount rules](2026-10-31-product-discount-price-guidance.md) retains approved D19 privacy and route-aware calculations. Applying a target price changes only draft Selling price; it never raises Original price to manufacture a saving. A conflict prompts correction/removal of the claim, while the reference and customer-facing price change follow ordinary review. Product markdown, platform-funded checkout benefits, selling fees and private profit remain distinct. D20 is approved with no automatic 30-day discount removal or compulsory price change; implementation remains on hold.
