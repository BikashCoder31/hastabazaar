# Retail, category forms and real product variants

Status: **category and variant rules approved for the work plan on 1 November 2026**, including expandable categories/subcategories, three option types, 100 included combinations per product version, independent prices/stock, allocation, reintroduction and admin review. The user explicitly included retail and resale alongside handmade products and requested category-specific forms, proper product variants and review rules. The user selected **new products only for now**. They also approved pricing guidance and review without a universal price cap, with optional private costs excluded from normal admin review. These directions supersede the earlier exclusion of new selectable-variant infrastructure. The detailed D21 rules and limits below are now approved. D20 discount/reference-price rules are approved with the latest no-expiry/no-compulsory-price-update correction. **Implementation remains on hold.** No code, data, live category, product, price, permission, order or deployment changes here.

Approved D22 amendment, 31 October 2026: the user subsequently required optional entry for all seller product details, a complete discoverable detail library, preview-guided completion and support assistance. They also required Super Admin email plus dashboard/bell for operational notifications, including support, seller applications and product submissions. The [optional-intake/support design](2026-10-31-optional-product-intake-support.md) supersedes mandatory-field assumptions at intake below; necessary offer facts are completed before publication/ordering. Implementation remains on hold.

User approval, 1 November 2026: approve the detailed category and variant rules with expandable categories and subcategories. Sections 3–8 govern category access, limit counting, safe overflow/help, stock allocation, reintroduction and review. This is planning approval, not implemented or verified behavior. D22 optional form/support/Super Admin notifications and all previously approved policy remain settled.

## 1. One marketplace and separate classifications

Use the existing Seller Center, Super Admin Sellers and Products & storefront workspaces. An eligible business selling new retail/resale goods normally follows the existing Registered Seller route; eligible makers retain their actual reviewed route. Selling clothing does not make someone a Managed Maker, and selling a handmade product does not automatically change a Registered Seller's commercial contract.

Keep these separate: seller/business eligibility and commercial route; product category; factual maker/brand; condition; and selectable product options. One reviewed seller can request several supported categories in the same shop. Preserve permissive initial registration and dashboard completion. Later product publication/order activation still has action-specific requirements; a category selection does not supply missing identity, registration, company clearance, fee consent or payout evidence.

Condition scope is settled: unused new goods, including newly made handmade products. Retail resale means resale of new goods, not second-hand condition. Used, refurbished, renewed, open-box and display/demo units are outside this version. Do not offer those selectable conditions or let a title/description hide them under New. A questionable condition gets a correction/review outcome, not automatic relabelling. Returned stock cannot become New merely because a refund completed; inspection and applicable resale eligibility must be recorded before stock is restored.

Approaches considered: separate shops/dashboards per seller kind would duplicate review and money work; one universal long form would recreate irrelevant-field failures. The user selected the recommended shared workspaces with category-relevant forms and real variants. Keep one product editor and review history, using explicit category contracts and one sellable-unit model.

### Expandable categories and subcategories — approved clarification

The four example groups are references, not the complete catalogue or a limit of four. Super Admin can manage additional supported categories and subcategories, such as Clothing → Shirts/Pants/Dresses, through the existing controlled category/template workflow. Relevant permissions, stable category references, affected-product previews and versioned field/eligibility mappings still apply; adding a label does not automatically approve every product or enable a new commercial route.

Handmade describes the actual product/production where relevant, not a compulsory separate listing: a handmade sweater can belong under Clothing. Keep one product and its stock/history; do not duplicate it across handmade/retail views. More categories do not change the per-product three-option-type/100-combination limits. Seller requests for missing categories/subcategories go through the approved support route with Super Admin email/dashboard oversight.

## 2. Source evidence and boundaries

Read-only local inspection found:

- [Product submission](../../../lib/products/submission.ts) carries one price, comparison price and inventory count per product. Size/colour/variations/specifications are descriptive text, not a complete selectable-offer model. Warranty duration and category-relevant dates already have validation.
- [Schema](../../../db/schema.ts), [cart](../../../lib/db/repositories/cart.ts) and [products](../../../lib/db/repositories/products.ts) use product-level inventory and cart identity. Cart uniqueness is currently cart plus product. Real variants therefore need coordinated data, inventory, cart, checkout and aftercare work, not just dropdowns.
- [Public shop](../../../app/shop/page.tsx) and [header](../../../components/layout/site-header.tsx) still have craft/maker-focused discovery text. Product detail already distinguishes supplier from legal seller in places. Map all consumers before generalising the public presentation; these observations do not prove production capability.

Carry forward approved [Form Management](2026-10-30-form-management-reliability.md), [field cleanup](2026-10-30-form-management-field-inventory.md), [product revisions](2026-10-31-published-product-edit-rules.md), [pricing/private preview](2026-10-31-seller-price-public-preview.md), [fee combinations](2026-10-31-fee-publication-schedules-combinations.md), [cancellation/returns](2026-10-31-cancellation-return-rules.md) and [manual payments](2026-10-31-manual-payment-rules.md). No new fee rate, international seller route, automatic transfer, category-specific tax determination, mandatory second approver or language/badge-policy redesign is introduced.

## 3. Seller category access and the common form

Super Admin owns the enabled category/template policy. A seller can choose a supported category and prepare a draft before full activation. If current reviewed seller eligibility already covers the category and current policy, reuse it; do not make the seller repeat registration or a category application for every product. A first submission with a genuinely uncovered category requirement creates one linked seller/category eligibility task in the product review workspace. Explain the missing requirement and owner; assignment alone does not approve it. A pending seller/category decision must not block the permitted intake needed to perform that review. Publication waits for actual applicable eligibility; ordering retains its separate checks.

An unknown or disabled category offers **Request a category** and preserves the private draft. Staff map it to a supported category or explicitly approve a suitable template. An Other field cannot bypass electronics or other specific review rules. No blanket enable-all-categories action is implied. Existing supported categories stay mapped and historical references remain valid.

Keep the approved three-stage editor: **Basics → Photos & details → Review**. Basics includes category, title, description, selling-unit/price/stock guidance; relevant option rows and details expand only when needed. The final stage previews the actual card/detail and selectable offers. Older four-step wording is superseded for this plan; no duplicate standalone price wizard is added.

Seller entry is optional for saving and initial review/assistance intake under D22. Missing name, category, price, stock, photo or descriptive fields must not block that intake; incomplete information remains a private candidate/assistance request. Before publication, staff and seller establish usable truthful identity/description/category, valid offers/prices and an accurate cover, plus genuinely necessary category/variant facts. Ordering adds actual stock/capacity/preparation/fulfillment readiness. Gift occasions and unrelated extra details remain optional. Do not coerce missing values into fabricated defaults.

Use **Brand** with a truthful Unbranded choice where appropriate; do not force a seller to invent a brand. Show actual producer/maker separately when relevant. Photos and short help identify what is shown publicly. Sourcing invoices, registration/identity evidence and internal review notes use protected review fields. Private cost/target values stay in owner-only calculator storage, outside ordinary staff product-review payloads. A reviewer can request relevant sourcing/claim evidence without demanding profit disclosure.

### Category selection and access outcomes

| Situation | Planned result |
|---|---|
| Known enabled category, current seller eligibility sufficient | Recommend its relevant fields in the same editor; continue ordinary product review without another seller application. |
| Known enabled category, missing seller/category-specific evidence | Accept optional intake, link one scoped eligibility task to the product and name the party who must act. Staff can assess content in parallel; publication/ordering each wait only for their actual applicable checks. |
| Seller cannot identify a category, or needs an unsupported option/field | Keep the saved draft and allow **Get help / Request a category** with no mandatory category just to request help. Support proposes the accurate mapping; Super Admin controls new category/template enablement. |
| Category is disabled for new offers | Keep permitted drafts and assistance; do not accept it as a live public offer or evade its rules through Other. Existing published products follow the actual disablement/visibility scope and transition; a new-intake restriction does not automatically withdraw safe existing listings. |
| Category changes on a published product | Create a reviewed candidate with an affected-field/eligibility comparison. Preserve the currently valid version and privately retained old answers. A new safety/eligibility finding applies its own scoped containment immediately. |

Category recommendations are not compulsory seller-entry fields. Staff should request only the facts relevant to this product and the affected action, not every possible attribute in the template. Do not turn optional specification fields into prerequisites merely because a template contains them.

## 4. Category-specific fields

The latest D22 direction makes these seller-entry fields optional. Recommend the relevant details and explain any facts still needed before publication/ordering; incomplete entries can reach staff assistance. Unrelated or hidden fields cannot block intake or publication. Each category/subcategory has a versioned relevance/publication/validation mapping; these starting template rules are approved; actual enabled subcategory mappings still require operational/source preparation.

| Template | Recommended information and relevant publication facts | Helpful extra details and selectable options |
|---|---|---|
| **Clothing, pants and wearable accessories** | Garment/item type and unit/pack count; for fit-dependent garments, offered size labels plus a size guide or actual measurements with units. State One size only when that is the actual offer. Support any actual brand/material claim; do not default unknown information to Unbranded. | Material, colour, fit, care and additional measurements where useful. Material is a recommendation unless an actual claim or applicable published subcategory rule makes it necessary. Size/colour combinations are real variants when they change the customer's selection. Accessories without a meaningful fit dimension do not require a clothing size chart. |
| **Stationery and office/school supplies** | Item type, what one purchase contains and pack quantity/unit; relevant distinguishing size/specification such as paper size/pages or writing/ink type. Brand or Unbranded. | Material, paper weight, colour, dimensions and use/care instructions when relevant. Pack size, colour or tip size may be variants. A pack of ten is one listed sales unit with its count clearly disclosed. |
| **Electronics and accessories** | Brand/model or precise unbranded item identifier, what is included, the subcategory's distinguishing specifications and any compatibility/power information needed to assess the offer. Active electronic-device templates require an explicit warranty offered Yes/No declaration; an offered warranty requires its provider, duration and supported claim terms. Passive accessory templates require warranty details only when a warranty is claimed or an applicable published rule requires them. | Capacity, colour or supported configuration variants within the same model family; dimensions/weight and installation/use instructions when relevant. Model-specific power/plug/battery/safety or sourcing evidence is requested when the category/claim requires it, not as a universal form for all accessories. |
| **Handmade goods** | Existing common product contract and truthful description of what is supplied; actual stock/capacity/preparation readiness belongs to ordering, not a new browse-only publication gate. Material/size information is needed only where an applicable category/claim rule requires it. No new blanket materials requirement for ordinary existing handmade listings. Category-specific clothing/electronics requirements apply when a handmade product belongs there. | Materials, craft/origin story, dimensions, care, colour/size variants and supported customization description. Do not require a factory brand, electronics specifications or a second generic maker application. |
| **Other enabled general goods** | Common form plus the approved relevant unit/material/dimension/use requirements from its published template. | Only supported relevant attributes. A newly requested category needs explicit template/eligibility review; this template is not a way to evade restricted or specialised conditions. |

For electronics, the product policy must name who handles the offered warranty and what the customer does; a manufacturer warranty claim needs an actual supporting basis. A seller selecting No warranty does not remove defect/misdescription remedies. Do not invent universal warranty periods, technical certifications or legal exemptions. Actual category constraints and applicable evidence are operational mapping before enabling the affected class.

Zero-photo incomplete intake can reach assistance under D22; at least one accurate usable cover is needed before publication, and one can suffice. Additional photos may be requested with a specific reason when an option/model/claim cannot be assessed. One image may represent several variants only when accurate; do not generate or assume unpictured colours or require a universal image count per variant. Reuse protected uploads and public rendition controls.

### 4.1 Which missing facts affect which action

Every category field remains optional at seller intake under D22. The following approved classification controls later publication; a label being listed in the template is not sufficient to make it mandatory.

| Classification | Publication rule |
|---|---|
| **Common offer facts** | Identify what the buyer receives: real title/category, useful accurate description, valid price for each included offer, accurate cover, unit/pack contents/count and unambiguous option meaning. Do not publish a vague pack whose quantity or actual selected unit cannot be determined. New-only condition must be established. |
| **Fit-dependent clothing** | Size labels and either an applicable size guide or actual measurements with units are needed so the offered fit is identifiable. A true One size item can use its actual measurements/fit information. Non-fit accessories do not acquire this gate. |
| **Stationery distinguishing facts** | Require the dimensions, page/sheet count, ink/tip specification or similar fact only where the published subcategory contract identifies it as necessary to distinguish that offered item. Examples: paper's A4/A5 size and pack count, a notebook's stated page count, or a sold pen-tip size. Do not require every stationery attribute for a pencil case. |
| **Electronics/device facts** | Exact model/item identifier, contents and the relevant compatibility/power/selected configuration must be sufficient to identify and use the offer. Active-device templates require the explicit warranty declaration above. For passive accessories without a warranty claim, omit unknown warranty information; never default it to No warranty or Guaranteed. |
| **Conditional claims/evidence** | If a listing makes a material, brand, authenticity, warranty, safety, sourcing or other relevant claim, the claim must be accurate and supported as the actual published rule requires. A claim can be corrected/removed through review where the product is otherwise eligible. No invented licence, certification or universal paperwork requirement. |
| **Recommendations** | Care, extra photos, craft/story, unclaimed optional material information, extra measurements and gift occasions can improve customer understanding but do not block publication solely because they are blank. |
| **Ordering-only readiness** | Actual available stock/capacity, preparation, delivery quote/service inputs and commercial/terms/payment readiness gate ordering separately. Their absence must not be turned into a new blanket browse-only publication prohibition. Public delivery/availability claims must still be truthful. |

The enabled subcategory's versioned contract must explicitly list the applicable facts and conditions. Category owners map those contracts against actual goods/requirements before enabling publication, rather than leaving each implementer/reviewer to infer mandatory fields from table wording. Reviewers can request precise evidence for a genuine product concern and record why; they cannot require all recommendations from every seller. Missing facts lead to a linked correction/help task, with the exact affected action shown.

## 5. Real variant editor

The seller chooses **One option** or **Multiple options**. A simple product uses one standard sellable unit behind the scenes and needs no visible dropdown. A multi-option product has named option types and the combinations the seller actually offers, such as Size M + Colour Blue. The requested starting limit is **up to three option types and 100 offered combinations per product version**, with its counting/overflow rules below now approved. These are editor/offer limits, not price controls or a lifetime order/history limit. A genuine capacity gap must be brought back with evidence, not used to silently lower the requested limit.

Example, fictional new clothing:

| Offered option | Selling price | Available stock | Image |
|---|---:|---:|---|
| Blue / M | NPR 1,200 | 5 | Accurate blue garment photo |
| Blue / L | NPR 1,250 | 2 | Same photo if accurate |
| Black / M | NPR 1,200 | 0 | Accurate black garment photo |

Each offered combination has a stable internal variant ID, platform identifier, supported public seller SKU, price, comparison price where used, stock, relevant photo mapping and active/paused state. The platform generates a stable reference; custom seller SKU is optional under the mapped SKU contract and must not collide within the seller's active inventory. Never use a mutable label such as Blue/M as the only database identity.

Normalize option labels to reject duplicate equivalent combinations. Option types cannot have two identical names. Generate a preview of combinations and let the seller select/remove only those genuinely offered before submission; do not automatically stock every mathematical combination. Zero stock is valid and means unavailable, not an invalid product. Blank or invalid price/stock on an offered row is flagged for completion/help; D22 intake retains incomplete rows without coercing them into valid live offers. Relevant factual price/readiness checks still apply before publication/ordering.

Bulk actions can **Apply this price to selected options** or copy common details, with affected rows and overwrite preview. They do not copy inventory to every option silently. Cost/target copying is a separate explicit private action. No universal price cap or compulsory cost/target field is added. Keep the row editor usable on a phone, with a selected-option summary rather than an unmanageable wide grid.

Options must describe the same product family. Unrelated brands/models, a new condition or a different underlying product require a separate listing. Correcting spelling of the same option may retain its ID through review; changing M into XL, capacity, physical pack count or another actual offer creates a new variant identity. Archive the previous identity as appropriate and retain all order/evidence history.

Free-text personalization is separate from a stock variant. Existing approved made-to-order behavior remains; this feature does not introduce an unlimited custom-option configurator, build-your-own bundles, shared raw-material inventory or automatic assembly.

Shared category, brand/model family, condition and warranty/return policy apply consistently within a product revision. Option-specific unit contents, measurements and shipping inputs must describe the actual selected offer. If a genuinely different warranty/model or contractual offer cannot be represented by the reviewed template, use a separate product rather than hiding the difference in a label. Fixed-supplier variants need an actual reviewed mapping to their supplier unit/amount terms; retail prices or another variant cannot invent supplier earnings. Preserve existing accepted obligations.

### 5.1 What the limits count

| Term/rule | Concrete meaning |
|---|---|
| **Option type** | One customer choice, for example Size, Colour or Pack size. A product may use zero (one standard offer), one, two or three types; sellers are never required to fill three. Descriptive fields such as care instructions and the private pricing helper do not consume an option type. |
| **Option value** | A choice within a type, for example M/L under Size or Blue/Black under Colour. Use meaningful supported values, with units where needed. There is no need to offer every possible value. |
| **Offered combination** | One exact choice of one value for every active type, such as M + Blue + Pack of 1. It becomes one stable sellable offer after the required checks. A published multi-option row cannot leave a type ambiguous or use a wildcard that hides several physical offers. |
| **100 maximum** | Count every combination included in that candidate/current public version, including zero-stock, paused and browse-only combinations. Changing stock to zero, hiding a row on another page or pausing it does not free a slot. |
| **Old and pending versions** | Each coherent candidate and current public version must satisfy the limit independently. Do not sum the old and replacement versions to make a permitted revision fail. Retired historical offers/orders do not consume active slots and remain preserved. Removing an offer from a candidate does not delete its old orders or immediately remove the current public offer. |
| **Duplicate choices** | Reject equivalent duplicate combinations from a publishable offer set using normalized labels and stable values; trim/case-only spelling differences must not create a second stock pool. Do not automatically merge genuinely different values or infer that two ambiguous size labels mean the same thing. |
| **Single option** | One standard offer needs one price/stock/readiness record and no extra customer selector. Reuse its stable identity when only descriptions change. Converting to real variants is a reviewed change with explicit stock allocation. |

A publishable product still needs at least one genuine valid offer. An empty option set can remain a private draft/assistance request; removing the last row does not automatically withdraw the existing public product. Use its explicit pause/withdrawal workflow when necessary.

Examples: 5 sizes × 4 colours × 3 pack choices = **60** possible combinations. 10 sizes × 5 colours × 2 packs = **100** if all are offered. 10 × 6 × 2 = **120** possible combinations, but a seller may select only the 70 genuinely offered and stay within the limit. Possible combinations are not automatically offers or inventory.

### 5.2 Adding combinations and handling the limit

Show the selected-offer count and limit before adding rows, such as **70 of 100 combinations**. Allow choosing actual combinations directly; a large theoretical cross-product must not force the seller to generate or stock every row. An explicit generation/copy action previews exactly which rows will be created, including duplicates and existing rows.

At a fourth type or 101st included combination, explain the precise issue beside the options and offer to reduce the selection or **Get help with these options**. Keep the saved draft, valid rows, intended option requirements and permitted bounded draft input. Do not silently truncate rows, discard work, fake a successful offer creation or create an unlimited runtime offer set. The draft can still enter D22 assistance with its unresolved limit issue; normal security/payload protections remain.

Support can arrange an accurate smaller selection or genuinely separate product families/listings when appropriate. Do not blindly duplicate a product merely to bypass the limit: separately reviewed listings need clear customer identity and independently allocated physical stock. A special higher limit or fourth axis is not an ordinary per-seller override; it needs an explicitly reviewed future capability/policy change. Closing the help request cannot lift a limit or publish an invalid candidate.

### 5.3 Price, photo and stock per offer

Every publishable combination has its own valid **Selling price (NPR)**. Prices may be equal or different. If Original price is used, it belongs to that same offer; the approved D20 reference-price/discount rules apply, with advisory reminders and no automatic 30-day expiry. No parent average or unrelated option's price is used for checkout. A bulk price action shows the selected affected rows and overwrites only after the seller applies it; published price changes still need admin review.

Show the approved fee/amount-after-fee helper for the selected row using its actual route and effective rate. A blank or invalid price remains draft text for assistance, never a zero/free public offer. Private cost/target values remain optional per sellable unit and unavailable to ordinary support/admin review. A selected public photo may be shared across variants only if it depicts them accurately; the seller is not forced to upload a different photo for every size.

Keep **Available to sell**, **Reserved for orders** and the seller's **Paused** state separate. The editable available count is the unreserved quantity of that exact offer, not a total that silently overwrites reservations. Show the current value and changed value for a stock adjustment, save with history, and reconcile stale/concurrent edits instead of overwriting a newer sale or adjustment.

Example: Blue/M has 5 available and 2 reserved. The stock screen shows both. Reporting 3 available changes only unreserved stock; the 2 reserved units remain attached to their existing orders. A shortage affecting those reserved units is reported through the order exception flow. Operational quantity adjustments require actual facts; blank/negative/fractional stock input cannot become authoritative inventory. D22 can retain invalid/incomplete draft input for help.

For a physical-stock offer, zero available is valid and prevents new orders; it is not a reason to demand a different price or a new product application. Supported made-to-order offers retain their actual capacity/preparation checks; do not interpret a blank count or a Made to order label as unlimited capacity or introduce a new capacity engine by implication.

### 5.4 Confirming initial stock and moving existing stock

Draft stock is a proposed count, not inventory created by autosave. Introduce a clear seller **Confirm available stock** action with the exact offers, quantities, source and effect previewed. It may be combined with Send for review through a clearly labelled **Confirm stock & send for review** action after that preview; it must never be a hidden side effect of an ordinary draft/help submission. Keep ordinary Send for review available for incomplete/unconfirmed stock; do not add a compulsory confirmation checkbox to every product form. This is an operational action inside the same product workspace, not a mandatory extra field or a prerequisite to assistance/browse-only publication.

The confirmed action creates/updates current operational stock for stable private/new offer identities, once and with history. Those offers remain non-orderable until their reviewed publication and all order gates pass. Later permitted stock adjustments operate on that same record. Publication reads current readiness; it neither copies the submission's old quantities nor creates a second allocation. Invalid or unconfirmed stock remains visibly Draft stock / Stock confirmation needed and cannot fund an order.

For genuinely new independent physical stock, the seller confirms its own available allocation. When units come from an existing simple offer, another pack allocation or a retired offer, use an explicit **Move available stock** action linking the source and destination offers. Limit this to the same actual physical goods in the reviewed product family, with an explicit valid unit/pack mapping; do not add a general unrelated-product/brand transfer feature. Preview the immediate reduction of source availability; transfer only currently unreserved units, exactly once, with unit/pack conversions shown and checked. A pack conversion is a recorded manual allocation, not automatic shared inventory on every sale.

Example: moving 4 of a live standard offer's 10 available units into two new colour offers leaves 6 available on the source immediately. The 4 private destination units cannot be sold until those offers are eligible. Reserved source units cannot be moved. The seller may defer this action until after review/publication to avoid withholding those units during review; in that case the new offers remain unavailable to order until actual stock is confirmed/moved.

Rejection, withdrawal or expiry of the content candidate does not automatically move confirmed stock back, discard it or add it to another offer. Show the retained allocation with an authorized transfer-back/reallocation action and recheck current stock/reservations. Retiring a destination keeps its ledger/history; no stock vanishes. A stale allocation preview fails specifically and preserves the draft; it cannot overdraft a source that has since sold units. Existing orders retain their original reserved offer.

## 6. Stock and order lifecycle

- Each variant owns its sellable stock, reservations and adjustments. The parent total is derived for reporting, never a second stock pool available for purchase. Availability is server authoritative and cannot become negative through concurrent orders or adjustments.
- A sellable pack is counted in packs; its disclosed contents do not multiply the cart quantity or inventory counter again. Separate single-unit and pack variants must have genuinely allocated independent stock. Example: 20 physical pens may be allocated as 10 single-pen offers plus 2 five-pen packs, not as 20 singles plus 4 packs backed by the same pens. No automatic shared stock/bundle-component conversion is included; the UI explains the allocation requirement and does not duplicate quantities during combination generation.
- Existing authorized stock and own-pause actions remain immediate under D2. The approved **Available stock** editor sets the unreserved sellable count for that offer; reserved quantities are displayed separately and cannot be overwritten by that field. An explicit Add stock action records a delta instead. Reconcile these semantics with actual storage before migration; every consumer must share them. A real shortage affecting reserved units becomes an order exception, not silent cancellation or deletion of the reservation.
- Product/variant content and price review snapshots do not freeze operational stock. Publishing a revision must not replay old quantities, clear newer pauses or accidentally resurrect a retired offer. A deliberate reintroduction follows section 8.4. Newly added private variants cannot accept orders before the reviewed version is published.
- Cart lines distinguish product plus variant; two sizes of the same shirt remain separate. Recheck option existence, published version, own/seller/category holds, terms, price and stock at the actual order boundary. A client-supplied parent price or another variant ID cannot bypass this check.
- Reserve the selected variant exactly once under the supported order/payment lifecycle. Manual-payment expiry, allowed cancellation and failed-order release restore the same reservation once. No double restoration, transfer of stock to another variant or substitution with an in-stock colour is permitted.
- Save immutable item snapshots of variant ID/reference, option names/values, product/brand/model, unit/pack contents, selected price, original approved comparison claim where relevant, quantity, fees/discount allocations, condition, preparation and warranty/return policy. Historical invoices/orders do not read mutable current variant labels or prices as their facts.
- Fulfillment, pickup/handoff, customer care, returns, refunds, seller earnings and Finance identify the purchased variant and quantity. Preserve the approved whole-seller-portion self-service cancellation scope; variants do not silently add finer cancellation rights/actions. Existing item/quantity return cases target the actual purchased unit. A wrong size/colour sent is a mismatch case; an exchange or substitute is never automatic and must follow an actually supported, agreed remedy.
- Returned items are inspected before any restock under the new-only condition policy. Refunding money does not restore physical stock by itself. Retired variants stay addressable to authorized order/case staff and cannot be hard-deleted out of history.

## 7. Pricing and customer selection

Apply approved D19 fee/profit guidance to the **selected sellable unit**: one garment, one device or one clearly described pack. Cost and target entries are optional and owner-private per variant, with an explicit common-value copy action if wanted. Use the actual commercial route and current/future fee policy; selecting Electronics does not silently change commission or force a percentage onto fixed-supplier terms. No fee calculation uses a crossed-out price.

Guidance and review without a universal price cap are approved. Private below-cost/below-target warnings and normal contextual admin review apply to retail and handmade offers. D20 detailed discount-control/reference-price rules are approved, with no automatic 30-day removal or compulsory price change. For any comparison claim, match the same variant, contents and condition; never combine the lowest selling price of one size with the highest original price of another.

Customer behavior:

1. Show the actual option choices and which combinations are unavailable. Require a complete valid selection before Add to cart when multiple offers exist. Do not silently choose a size/capacity for the customer. A single standard offer needs no redundant choice.
2. Selection updates the exact image where mapped, price, valid saving, stock/preparation and relevant specifications/warranty. A lost/unavailable option keeps the customer's choice visible with a clear correction path; no automatic replacement.
3. Cards may show **From NPR [amount]** when prices differ. If any offer is currently orderable, derive that amount from currently orderable public offers; do not advertise an unavailable cheap option to imply it can be bought. If none is orderable but the listing is legitimately public, show the valid public price/range with the actual unavailable/browse-only state. Omit the price when no valid public offer remains.
4. A parent-level discount badge appears only when the represented offers share the same valid selling/original-price pair; otherwise show the selected offer's saving in detail. Search, filters, sorting, preview, metadata and cart must use the same eligible display set and price basis.
5. Show Sold by and genuine Brand/Made by information appropriately. General search/category navigation must accommodate clothing, stationery, electronics and handmade items. This narrowly corrects product identity/discovery for the approved expansion; it does not reopen translation, public-contact or verification-badge policy.

## 8. Admin review and category rules

Use the existing product queue and exact candidate/public comparison with category, seller route, condition, variants and relevant evidence visible in one record. Add category/brand/review-stage filters. Show which questions remain, who must act and the existing first-complete-review target of one service business day. Missing reviewer specialty/coverage is an owned staff task, not a generic seller form failure.

| Review stage | Required review and authority |
|---|---|
| Seller/category eligibility | Existing authorized seller-review staff assess the actual business/route and requested category access. Super Admin owns enabling category policies and required capabilities. Category assignment grants neither product publication nor financial access. |
| Product identity and condition | Check title/category, brand/model/maker claims, unit/pack contents, New condition, photos and relevant sourcing evidence. Never label ordinary retail goods handmade or imply authorised-dealer status merely from upload. |
| Category information | Clothing: fit/size/material consistency. Stationery: exact pack/specification. Electronics: exact model/accessories/compatibility, stated warranty and any relevant power/safety/sourcing checks. Ask for specific missing evidence; no blanket invoice or licence field for unrelated goods. |
| Options and price | Inspect every offered combination and its price/media mapping, duplicate/misleading options, comparison-price claims and significant changes from the last approved offer. Private costs and profit targets are not visible or required. |
| Fulfillment and aftercare | Check public delivery/warranty claims for truthfulness. Separately record whether actual item/pack quote inputs, capacity/preparation and supported delivery/custody paths are ready for ordering. A valid browse-only publication can remain unavailable to order. A delivery restriction needs an actual supported destination/service before that checkout option is enabled; a checkbox does not supply one. |
| Decision | Request changes, reject candidate, Approve only, or Approve & publish under the existing exact-version and both-permission checks. Publication does not activate unready orders or payouts. |

Review and publish the coherent candidate as a whole, preserving D2's single pending revision. Do not approve only some rows while publishing unreviewed parent text or options. If one new option needs correction, return the candidate with precise feedback; the last approved valid version remains live. The seller may deliberately remove the affected draft option and resubmit. An immediate operational pause can contain an already-live problematic offer; a broader identity/safety problem applies its actual broader restriction rather than keeping related invalid offers live.

New variant identity, customer-facing option labels/meaning, model/specification/media, price/comparison price and warranty/return changes require review. Authorized stock changes and own pauses retain their separate immediate handling. Category-specific protections can strengthen review but must not revive a blanket four-photo/required-gift-occasion rule. Reviewers have the applicable department/product capabilities; one eligible person may review and publish when permitted, with existing conflict checks.

### 8.1 One review workspace

Open the exact submitted candidate from Products & storefront, Seller Management or its notification. The overview shows the seller/category, candidate/current public versions, **Received — details needed** versus **Ready for review**, actual limits/count and separate publication/ordering/payout readiness. Keep the same product reference while support resolves missing details.

The reviewer can compare current and proposed descriptions, media, prices and option definitions, then expand the offered rows. Mark Added / Changed / Removed rows and identify the exact field or combination in feedback. Show live stock/reservations and pauses as operational context, with their update time; they are not values copied back out of an old content snapshot. Provide the same private customer preview the seller uses without exposing the seller's private cost/profit helper.

Show category eligibility/document tasks in context with their actual owners and permissions. Product staff cannot grant themselves bank/document authority through this screen. Unknown category, unavailable optional customization or missing content gives a precise assistance/recovery path, not a generic lost-form error.

### 8.2 Which actions need review

| Change | Planned treatment |
|---|---|
| New product, new option type/value/combination, meaningful label/pack/model change | Submit a frozen candidate for review. A materially different sold unit gets a new offer identity; a different product family needs a separate product. |
| Price/original-price change, public media, description, category, warranty or customer-facing specification | Reviewed candidate under D2, including a short price-only route for an otherwise valid product. No seven-day product cooldown. |
| Increase/decrease available stock for an existing eligible offer | Immediate authorized operational adjustment with history and concurrency checks; never overwrite reservations or implicitly approve a private variant. |
| Pause an existing offer/product | Immediate authorized stop to new orders; existing obligations remain accessible. This is not cancellation, refund or withdrawal of all historical/public information. |
| Resume an offer/product | Immediate only when its previously approved offer, seller/category readiness, applicable terms, stock/capacity and all other holds permit it. Resume is not an activation bypass. |
| Remove an offer from the published selection | Submit the coherent removal revision; the currently public offer stays governed by its own state until publication, unless separately paused/withdrawn. Retain references and existing orders. |
| Private cost/target/helper edits or ordinary draft autosave | Owner-private only; no admin approval, public update, stock mutation or operational notification for every keystroke. |

### 8.3 Decisions, corrections and notifications

- **Request changes:** return precise category/offer/field feedback and a direct correction link. Other saved answers remain. If a particular new variant prevents approval, the seller can correct it or explicitly remove it from the next candidate; staff do not silently publish the other rows with unreviewed shared content.
- **Reject candidate:** record a reason and permitted next action. A rejected revision does not automatically reject the seller, remove a valid earlier public version or alter existing orders.
- **Approve only:** record approval of the exact candidate, keep it unpublished and assign the next publication action. Changing a relevant reviewed value requires a fresh decision; approval does not freeze or replay live stock.
- **Approve & publish:** require both product review and publication permission, the current candidate/base and actual publication requirements. Publish the coherent candidate together. Then show **Public — available to order** only for eligible offers, or the correct unavailable/browse-only state. Actual money/payout/commercial readiness remains separate.
- **Uncertain/failed save:** check the same recorded attempt and preserve notes. Do not create another product or decision because the response was lost; no success or publication notice until its underlying result exists.

Keep the approved first assistance triage and first-complete-product-review targets of one service business day, separately measured under the current continuous calendar. Show the original assistance submission age and the first complete-review readiness time; resubmissions, reassignment or reads cannot hide overdue work. Incomplete intake is not labelled a completed review merely because support opened it. Delayed staff work receives the existing owner/backup/escalation handling.

All genuine submission/resubmission, assistance, feedback, decision, publication and other operational notification events reach **Super Admin email plus dashboard/bell**, including the acting Super Admin, alongside the appropriate seller/team recipients. Use one event/recipient/channel identity, automatic delivery/retry, safe summaries and exact authorized links. Shared read status does not complete the task; resolved issues suppress obsolete reminders. Stock editing does not create a new review case or duplicate messages; any existing genuine stock/availability event follows the same approved notification rules.

### 8.4 Retiring and deliberately reintroducing an identical offer

A retired offer is excluded from new purchases but retains its stable identity, current operational stock ledger, reservations, order/case links and financial history. A later valid cancellation/payment expiry releases its reservation back to that same ledger exactly once; retirement does not discard the release or make the offer orderable.

Approved rule: a physically identical offer may return under its original identity only through an explicitly submitted and freshly reviewed reintroduction candidate. Verify the same product/size/colour/capacity/pack meaning, source/retirement reason, current category/offer eligibility and stock position. This is distinct from a stale snapshot accidentally reactivating an offer or a normal Resume on a merely paused current offer.

Show the current retained/released stock and reserved quantities. Before enabling new orders, reconfirm the actual available stock or perform an explicit checked transfer of unreserved units; never restore a pre-retirement snapshot or clone the stock into a second identity. This stock confirmation gates ordering, not browse-only publication: a freshly reviewed offer may return publicly with Stock confirmation needed and no ordering, provided its identity, retirement reason, publication eligibility and relevant holds permit it. Positive retained stock alone must not silently re-enable purchases. A no-change confirmation records that the shown stock is still correct without rewriting it; concurrent releases/adjustments require current-state reconciliation. If units were previously reallocated elsewhere, they are not available twice.

A materially different physical meaning receives a new offer identity, even if the seller reuses an old label. Historical orders always keep their recorded facts. Reintroduction does not cancel obligations, remove an unrelated hold, make used/returned goods New, or silently restore an old price. Publication needs the new current decision and fresh gates; ordinary cart price/readiness revalidation still applies.

## 9. Returns, warranty and shipping by category

Keep the approved platform and saved-order return/cancellation rules, clocks and money responsibilities. A seller/category form cannot silently override them. No new electronics, clothing, handmade or sale-item blanket no-return exception is created.

- Clothing review records the supplied size chart and purchased option so wrong item/size and the customer's own fit concern can be assessed against the actual saved offer and policy.
- Stationery review records sealed/pack contents and quantity where relevant; a pack cannot be misrepresented as a single piece in a refund or return. Any proposed exception uses the existing approved review process and applicable basis.
- Electronics separates warranty/service requests from return/refund eligibility. Record the named warranty provider and actual response/next action; warranty referral alone does not close a platform defect complaint or promise a repair already completed. Relevant serial references, if used, belong to the protected fulfillment/case evidence with role access, not the general public listing.
- Handmade/customized goods retain the approved distinction between made-to-order stock and genuine personalization, including existing custom-cancellation protections and no automatic deposit forfeiture.
- Delivery rules use real carrier/service capabilities for fragile, powered/battery or otherwise flagged items and actual packing/weight requirements. Do not presume universal delivery availability, impose an invented surcharge or introduce a new carrier integration silently. An unsupported route blocks that shipment/checkout option with an owned operational explanation while permitted draft/review work remains available.

This is workflow planning, not a legal or technical certification of any category. Map actual applicable category obligations and provider capabilities before enabling affected live commerce; preserve customer protections and historical order terms throughout.

## 10. Stable forms, migration and events

Category templates are versioned feature-owned contracts with known field types, visibility, validation, supported option axes and public/private mappings. Form Management edits approved wording/help and supported extras; it cannot arbitrarily change variant identity, money, stock or protected evidence. Preview every relevant category/account stage and validate server compatibility before publication. Missing optional editorial customization uses only the explicit approved baseline; missing required category policy cannot silently fall back to a permissive general template.

Changing category on a private draft shows the affected fields and retains values until the seller reviews the mapping. Archive inapplicable answers privately when appropriate; never expose private data under a newly public field or block on hidden irrelevant requirements. On a published product, category change is a reviewed candidate. Compatible template changes preserve drafts; a meaningful requirement change identifies only the affected fields. Revocation/security/eligibility rules still apply at submission and publication.

Later migration must preserve stable product URLs, platform/seller references, old carts, price/stock/reservation records, order/invoice/payout snapshots and reviews. Map legacy simple products to a standard offer without guessing that descriptive variations imply stock combinations. Sellers must explicitly define and review real new variants. Converting a live simple offer to multiple offers needs an audited allocation of its actual available stock; do not clone stock to every row or reinterpret existing reservations. Existing carts/orders either keep a supported legacy offer identity or receive a focused cart-refresh explanation before a new purchase; existing orders remain immutable.

Existing valid listings retain their recorded category/offer version while supported. A new field label or optional category attribute does not force all sellers to refill old products or block a permitted price-only revision. Apply genuinely necessary new requirements through an explicit compatibility/review transition with specific corrections; a real safety/eligibility revocation remains enforceable. Do not assume every legacy product is invalid or manufacture missing size/model/evidence values during migration.

Map D1/publication, eligibility SQL, customer filters, inventory, cart uniqueness, shipping quotes, order placement, manual-payment holds/expiry, cancellations, returns, invoices, refunds, settlement/payout, reporting and notification consumers. Choose actual data/API interfaces only after inspecting their current contracts. No canonical local database reset, seeding or migration is authorized for planning or startup recovery.

Reuse the existing deduplicated notification and review-task system with D22 mandatory Super Admin email plus shared dashboard/bell oversight for all operational events, in addition to responsible staff. Category eligibility, support, product submission/correction and publication notices link to their exact authorized source. Changed variant labels/stock do not trigger duplicate notices or re-open resolved reviews. Do not add a new automatic customer marketing/restock email program by implication.

## 11. Acceptance cases and remaining review

Later verification must include:

- New retail/resale and handmade sellers in the same workspace; actual route and category access enforced without blocking permitted review intake; multiple categories without duplicate applications.
- New-only condition across UI/API/import/staff corrections, with used/refurbished/open-box/demo rejected from publication and inspected returns not blindly restocked.
- Clothing one-size/multiple sizes, stationery packs, electronics model/warranty/compatibility and ordinary handmade goods; irrelevant hidden fields never block, one cover/no occasion remains valid, and incomplete/zero-cover intake reaches assistance while actual publication/order prerequisites remain explicit.
- Duplicate normalized options, invalid combinations, zero to three option types, fourth-type/101st-row handling, exactly 100 included rows, paused/zero-stock counting, independent current/candidate counts, archived history and large theoretical combinations with a smaller selected set. Incomplete/over-limit intent reaches assistance without a fake valid runtime offer, truncation or lost drafts.
- Zero stock, incomplete price/stock input, accurate common versus variant photos, owner-only costs, explicit bulk price/cost actions, available-versus-reserved concurrency, pack allocation and no stock duplication.
- Explicit initial-stock confirmation versus draft autosave, combined submission with a clear stock preview, deferred allocation, live-source transfer/concurrent last-unit sale, source reservations protected, and rejected/withdrawn candidates retaining their allocation with explicit transfer-back.
- Category requirement classification: fit-dependent clothing versus accessories, relevant stationery specifications, active-device warranty declaration versus passive accessories, actual claims versus recommendations, and distinct ordering-only readiness.
- Intentional identical-offer reintroduction under the same identity/ledger, historical release while retired, stock already reallocated, stale no-change confirmation and changed physical meaning requiring a new identity. No stale publication resurrects a retired offer.
- Two sizes in one cart; different prices; cross-product variant tampering; selected offer going out of stock/being retired; concurrent last-unit purchases; authorized adjustments and no parent/variant double stock.
- Manual-payment expiry and late receipts, cancellation, shipment and returns acting on exact variants with one reservation/release and original money allocations. Pack quantities, refunds and inspected restock use the same sale-unit meaning.
- Price/option revisions concurrent with stock/pause; stale review/publication; immutable old orders; new offer identity for materially different options; generic legacy text not automatically converted to combinations.
- Correct selected variant in invoice/order/care/Finance; card From price and savings use the correct offers; all-out-of-stock/browse-only states; public identity is accurate and protected evidence/private costs never leak.
- Category/template changes and outages, draft/session/upload recovery, all-role permissions and notification suppression, mobile/keyboard option selection and complete exact-release journeys.

- [x] User approved inclusion of retail/resale alongside handmade products, category-specific forms and proper variants in this version.
- [x] User selected new products only; used/refurbished/open-box/demo listings remain outside this version.
- [x] User approved price guidance and review without a universal cap; private costs remain optional and excluded from normal admin review.
- [x] Apply the subsequent D22 optional-entry, support-assistance and mandatory Super Admin email/dashboard direction.
- [x] Expand the requested category/variant detail on 1 November 2026: category access, exact 3/100 counting, independent offer prices/stock, safe limit assistance and admin decisions.
- [x] Complete a fresh read-only builder review of this detail; clarify initial stock confirmation/allocation, category publication requirements versus recommendations, and intentional identical-offer reintroduction. Keep stock confirmation an ordering gate, including reintroduced offers; no implementation or runtime verification is claimed.
- [x] User approved these detailed category/variant rules, stock/order behavior, limits and expandable categories/subcategories on 1 November 2026. D22 optional form/support/notifications remain approved; implementation remains on hold.
- [ ] Map actual source/operational obligations and add this scope to the complete implementation/verification checklist after planning review. No scope is silently postponed because it needs backend work.

**Implementation and deployment remain on hold.**
