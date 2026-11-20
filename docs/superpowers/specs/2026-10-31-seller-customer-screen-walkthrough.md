# Seller dashboard and customer screens — paired walkthrough

Status: **final seller dashboard and customer walkthrough approved for this version on 1 November 2026**. Approval covers the seven Seller Center sections, desktop/mobile navigation, Home priorities, paired states, product example and customer-facing wording described here. Approved D9 and D19–D22 policies remain controlling, including the latest D20 no-expiry/no-compulsory-price-change correction. This is design approval, not evidence of a working live site. **Implementation remains on hold** until the user explicitly resumes work. The new backup program remains deferred. All active work-plan items remain required under the [version scope checklist](../plans/2026-10-31-complete-version-scope.md).

Approved [D22](2026-10-31-optional-product-intake-support.md) adds optional product entry, a complete discoverable detail library and linked support. Incomplete review/assistance intake is allowed; final publication/order checks remain factual. Mandatory Super Admin email plus dashboard/bell oversight applies to operational events. These additions are included in the now-approved final walkthrough.

## 1. Approach and scope

Use the agreed two-workspace approach: one Seller Center, one Super Admin workspace, and customer screens reading the same permitted records and actual outcomes. Walk through a fictional seller and product from first registration to aftercare. This example creates no account, application, order, payment or notification.

A single long page of every seller form would obscure the next action. Separately designing seller and customer pages without a shared state map risks contradictory statuses. The selected approach keeps focused seller sections and pairs each meaningful event with the customer view, staff responsibility and authoritative result. Detailed financial or document review remains in the approved admin workspace, not a duplicate seller/customer editor.

This walkthrough consolidates [Seller Center](2026-10-30-seller-center-workspace.md), [Products & storefront](2026-10-30-products-storefront-workspace.md), [Orders & customer care](2026-10-30-orders-customer-care-workspace.md), [Finance & payments](2026-10-30-finance-payments-workspace.md), the [bank/identity rules](2026-10-31-bank-identity-changes-payout-approval.md), [manual-payment rules](2026-10-31-manual-payment-rules.md), [cancellation/return rules](2026-10-31-cancellation-return-rules.md), [public-profile rules](2026-10-31-public-profile-changes-cooldown.md), [product-edit rules](2026-10-31-published-product-edit-rules.md) and approved Team/System policies. Their detailed constraints take precedence over abbreviated examples here.

Read-only local mapping confirms existing seller/application routes, [applicant product drafts](../../../app/sell/application/products/new/page.tsx), [product pages](../../../app/products/[slug]/page.tsx), [maker pages](../../../app/makers/[id]/page.tsx), [cart](../../../app/cart/page.tsx), [checkout](../../../app/checkout/page.tsx), [customer orders](../../../app/account/orders/page.tsx) and [order details](../../../app/orders/[orderNumber]/page.tsx). Existing routes are starting points, not proof of the proposed redesign. The current [payout form](../../../components/seller/payout-request-form.tsx) and [API](../../../app/api/seller/payout-requests/route.ts) still carry a note contract; later implementation must reconcile D9 through client, API, repository and form validation rather than merely hiding a required field. No browser journey or production test was performed for this document.

## 2. Approved Seller Center layout

Header: shop identity, account menu, shared notification bell and View public shop when a valid public destination exists. Show customer and seller work as distinct destinations under the same account; switching roles must not change the account or create another application. A non-public shop offers Private preview where supported, never a misleading live link.

| Section | First things the seller sees | Main actions |
|---|---|---|
| **Home** | Urgent actionable orders/cases, corrections, product reviews and setup tasks; separate registration, document, product, ordering and payout summaries. | Open the exact task, Add product, Continue draft, View orders. |
| **Shop & profile** | Current public version, pending revision and next normal edit time; public support information and separate private locations. | Preview, request/review a profile change, update permitted support/location fields. |
| **Registration & documents** | Private application details, each document's actual status, accepted terms and specific missing requirements. | Continue details, upload permitted evidence, request a scoped change, review and accept terms. |
| **Products & stock** | Product image/title, price, stock, review/publication status and current ordering availability. | Add/resume a draft, submit/correct a review version, update allowed stock, pause or request a price/content change. |
| **Orders & delivery** | Own seller portions grouped by required action and actual fulfillment/payment state. | Start packing, mark ready, follow supported shipment steps, report a delay/cannot fulfill, respond to a case. |
| **Earnings & bank** | Pending, held, available, requested/processing and paid amounts; own masked beneficiary; current selling fee and upcoming change only when one exists. | Review the breakdown, add/request a bank change, Request available payout, inspect payment history. |
| **Requests & help** | One inbox and request list with reference, source, status, next responsible party and due/update time. | Continue the precise correction/request, read a decision or get contextual help. |

Approved Home priority: imminent/overdue actionable order and customer-care work first, required corrections/terms next, product feedback next, then remaining setup. Sort within each group by actual due time and severity, without hiding an urgent activation or financial task behind routine work. Show a compact top list plus View all. A task waiting on staff is labelled **Waiting for Hastabazaar**, not a repeated demand to resubmit.

No universal Verified/Active badge or percentage implies all capabilities are granted. Display separate rows such as **Registration: Under review**, **PAN: Verified**, **Product: Public**, **Orders: Not enabled**, **Payouts: Bank review pending**. Show who must act and one relevant button for each actual blocker; fixing one blocker does not silently clear others. Mobile uses the same sections and facts, readable stacked cards, status text beyond color and accessible controls. No new language, translation or verification-badge policy is introduced.

### 2.1 Final screen arrangement — approved, 1 November

Keep the seven sections in one persistent Seller Center. On desktop use a stable side navigation and one main content area; a product, order or request opens within that workspace with a clear Back destination. On mobile use Home, Products, Orders and More as shortcuts; More exposes the remaining sections, not a different feature set. Keep the account menu and bell available without covering the current form's controls.

Home opens with the seller's shop name and the actionable summary. Put real urgent orders/cases first, then time-sensitive corrections/terms, product feedback and setup; preserve the severity/due-time exception above. A compact readiness panel separates:

- Registration/application review.
- Document checks, with each actual document status.
- Products awaiting review versus actually public.
- New-order availability and its specific private blocker.
- Payout readiness and eligible funds.

Every actionable row has one relevant next step and the party currently responsible. A company/staff dependency says **Waiting for Hastabazaar**. It does not demand that a seller upload the same documents again. The eligible applicant uses this same workspace to finish their details and prepare/submit products; an activation gate cannot lock them out of their correction route.

Keep optional setup and advisory price checks in a separate **Suggestions** area below required work. An ignored 30-day price suggestion is not Overdue, Needs verification, Discount expired or a reason to disable ordering. No global checklist percentage or green Verified label replaces the separate facts.

Each form distinguishes **Shown to customers** from **Private account details** using the approved visibility rules. Field labels remain simple names, without repeated optional suffixes or compulsory markers. Relevant help explains where public information appears; optional fields remain optional. Save status and the next action remain visible on mobile without making every section a separate submission.

### 2.2 What a seller does in each section

| Open | Walkthrough and visible outcome |
|---|---|
| Home | Select an urgent order, a correction or Continue draft. Clicking the task opens its exact record/field. Review a waiting-on-staff task without creating a duplicate request. |
| Shop & profile | Compare the public profile and proposed revision; preview before requesting a change. Show the actual next normal edit date for the approved seven-day cooldown. Permitted private pickup/return updates use explicit copy-address controls and preserve destinations already recorded on orders/cases. |
| Registration & documents | Complete missing details, open each evidence status and request a reasoned change to a verified document. Show upload permission, evidence verification and seller activation as separate steps. Review current/upcoming terms with their actual dates. |
| Products & stock | Find Draft, Details needed, In review, Changes requested and Public products. Each row separates review/publication status from orderability. Resume the same draft, open precise feedback, adjust permitted live stock or pause orders without rewriting a pending content version. |
| Orders & delivery | See own actionable portions and due times; open items, selected variants, required preparation and the supported next step. Awaiting payment is separate from an order ready for seller response. Report delay/cannot fulfill from that order. |
| Earnings & bank | See pending, held, available, requested/processing and paid amounts separately. Add or request a change to the seller's own receiving account; request eligible payout with the standard purpose and optional note. No screen implies a request itself transferred money. |
| Requests & help | See product assistance, document/bank/profile changes, order cases and notifications with reference, next party and latest substantive update. Get help from a product keeps that product/draft reference. Super Admin receives the approved email/dashboard notification alongside the responsible team. |

This is the approved final presentation around settled business rules; it does not authorize a new role, privilege, payment method or public data disclosure.

## 3. Registration, documents and the first product

| Moment | Seller dashboard | Customer screens / staff result |
|---|---|---|
| First registration | Submit the permitted incomplete application, then enter the same Seller Center to complete it later. Phone country defaults to Nepal; retain approved no-OTP registration behavior. Bank, public-profile and product work have their own sections. | No new public product is created. Staff see the submitted application and missing action-specific details. An approval-only gate must not prevent access to the very fields needed for review. |
| Leave halfway and return | Restore successfully saved answers and completed uploads. Show Saving, Saved at [time], Unsaved changes or Could not save with Retry. A selected local file is not shown as uploaded. | Nothing becomes public from autosave. Registration stays one canonical application; browser refresh or retry does not create duplicates. |
| Complete missing evidence | Each card names the document, status and permitted next action. A specific correction opens the relevant field/file, retaining unrelated details. | Super Admin verifies the exact PAN/identity version. Customers do not see identity numbers, evidence, bank data or internal review notes. |
| Approval or company checks pending | Show the actual application result separately from document and activation readiness. Company-owned requirements say Waiting for Hastabazaar. | Neither application approval nor document verification alone enables orders, publishes products or transfers money. |
| Prepare a product | Use **Basics → Photos & details → Review** within one resumable draft. Start with whichever actual details the seller has; incomplete/zero-cover intake can reach assistance. Category-relevant details are suggested and all supported groups remain discoverable. Gift occasions stay optional; factual offer and cover checks apply before publication, with stock/capacity/preparation/fulfillment readiness before ordering. | Drafts and private previews remain restricted. D21 now includes real selectable variants; existing free-text descriptions are not a substitute for the proposed stock/price/order implementation. |
| Submit for review | Show the exact version, missing publication information and a final **Submit for review** action. Incomplete submissions can enter assistance under D22; Save Draft and Submit remain separate. Eligible pre-activation product intake must not require bank/payout readiness. Where an actual application/route requirement is unmet, explain that specific condition and link to it. | Staff receive one linked review/assistance task and Super Admin receives email plus dashboard/bell. Customers cannot discover the unapproved version through shop/search/media/metadata. First complete new-product review target is one service business day under the approved Team policy. |
| Changes requested | **Changes requested — Review feedback** opens specific field/image comments in the existing product version chain. Resubmit once after correction; prior decisions stay visible. | A never-published product remains private. An existing valid public version is not replaced by a pending correction. |
| Approve & publish | Show the authoritative outcome: **Public — orders not enabled yet** or **Public — available to order**. Offer View product only when actual public visibility succeeds. | Admin must hold both review and publication authority. Approve only shows **Approved — awaiting publication** and an owned next step, not a live listing. |

Product and document uploads show progress, supported formats/limits and per-file retry. One failed upload should not make the seller re-enter successful sections. Destructive replacement/removal is explicit; it never quietly removes required review evidence or alters a verified version.

### One product from draft to customer view — final walkthrough example

Use a fictional new crochet bag to make the journey concrete; no live record is created. Handmade describes this actual bag within its appropriate enabled category/subcategory. The catalogue can expand; the four example groups do not limit the seller's choices to four.

1. **Basics:** add the available name/category, Selling price and actual offer details. If there are real size/colour options, select only the combinations offered. Each combination keeps its own price and stock; unrelated detail groups stay collapsed but searchable/discoverable.
2. **Photos & details:** choose one accurate cover and add other useful information. All supported entry fields can be left unfinished for assistance; public factual requirements still appear precisely before publication. Gift occasions are optional. If a necessary field/category is missing, Get help carries the existing draft to staff.
3. **Pricing:** for a supported example Original NPR 1,500 / Selling NPR 1,200, the customer preview shows Save NPR 300 (20% off). Private costs/profit targets stay outside the customer and normal admin-review view. At an illustrative applicable 12% fee, the fee is NPR 144 and amount after that fee NPR 1,056 before other adjustments; this is not an actual current-rate claim or available payout.
4. **Stock:** distinguish proposed draft quantities, confirmed available quantities and reserved orders. For new/changed offers, the explicit stock-confirmation/allocation preview shows the effect. The seller can choose Confirm stock & send for review after that preview or use ordinary Send for review for incomplete assistance. Autosave and publication cannot silently allocate or overwrite live stock.
5. **Review:** switch between a private product-card and product-detail preview, selecting each actual offer. Identify genuinely missing publication facts and the fields customers will see. Save draft, Send for review and Get help remain distinct. An incomplete submission says **Received — details needed** with the next responsible party.
6. **Staff outcome:** precise feedback returns to the same version chain. Approve only shows awaiting publication; Approve & publish uses the exact reviewed version and actual permissions. A product can be public for browsing while ordering checks remain incomplete.
7. **Later edits:** the seller may propose prices/content at any time under the approved rules. Existing public content stays until the new valid candidate is published; allowed stock/pause actions remain separate. Old orders retain their original offer and money records.

The 30-day price check adds no eighth compulsory step. It is a suggestion only. The same approved NPR 1,500 / NPR 1,200 comparison still displays after day 30 unless the seller chooses a reviewed change or a real evidence-based moderation issue is found.

### Price and public-information guidance — approved D19 addition

The user approved a live fee deduction view while entering Selling price and a private way to work toward a desired profit for this version. The [approved price/public-preview design](2026-10-31-seller-price-public-preview.md) adds current-route fee and amount-after-fee calculations, optional private costs/target profit and an explicit Use this price action. Costs/targets are excluded from public and normal staff-review payloads. Existing published-price review remains required. Public/private section labels and the actual customer card/detail preview appear in the existing Review step, preserving one cover photo, optional occasions and simple labels. D19 details and inclusion are approved. D20 detailed price/discount rules are approved, with the latest correction: the 30-day check is advisory and never automatically removes the discount or forces a price change. [D21](2026-10-31-retail-categories-product-variants.md) now includes new-only retail/resale and real variants. D21 detailed category/variant behavior and expandable categories/subcategories are approved; the final paired-screen presentation is now approved.

## 4. Discovery, product details and current availability

Public shop/search/cards, product details, wishlist, cart and checkout must use the same current published version and availability facts. A product-detail page cannot offer purchase merely because an older card once did. Preserve factual Made by and Sold/invoiced by information for the actual commercial route; do not imply that the maker is the legal seller where the approved model says otherwise.

| Actual state | Seller sees | Customer sees and can do |
|---|---|---|
| No valid published version | Draft, Under review, Changes requested or Approved awaiting publication, with the relevant next action. | No discoverable listing/private-media access; an obsolete/direct link gives a neutral unavailable result. |
| Valid published Managed Maker, initial commercial checks pending | **Public — orders not enabled yet**, with private readiness details. | **Not available to order yet**, a working Browse other products route, no guessed activation date and no order button that can bypass the hold. |
| Purchase checks pass and stock is available | **Available to order** for that exact valid version. | Current price, supported options, accurate stock/preparation information and enabled Add to cart. |
| Out of stock | **Out of stock — Update stock** where permitted. | **Out of stock**; a valid listing may remain visible, with no false availability or unsupported purchase. |
| Seller's own product pause | **New orders paused** and permitted Resume action. | Otherwise-valid listing shows **Currently unavailable to order**; preserve existing-order access. |
| Only updated terms are unaccepted at their effective time | Dashboard access and existing-order work remain; **Review and accept updated selling terms**. | Otherwise-valid public product remains browseable and unavailable to order. Private fee/acceptance reasons are not displayed. This carries forward the terms-hold presentation. |
| Ordinary content/profile/price revision under review | Current public version and pending version appear separately. | Continue showing the last valid public version/price until a new version is explicitly published. |
| Identity/evidence review or a separate restriction | Show scoped order/payout holds and their responsible reviewer, never a generic permanent account failure. | No new order where readiness is invalid. Retain public content only while its existing publication/visibility requirements remain valid; do not create a browse exception for withdrawn, unsafe or disputed public identity/content. |
| Explicit withdrawal, removal or applicable visibility restriction | Recorded scope/reason and permitted correction/support/obligation work. | Apply the actual visibility restriction consistently, including search/media/metadata. Existing customers retain authorized historical order information and care access. |

Resolve overlapping causes using the applicable visibility restriction first, then orderability and stock. Do not conceal a blocked purchase behind an optimistic In stock badge. A bank-change payout hold alone does not withdraw a valid listing; continued ordering still depends on all current route checks. A material identity request pauses new orders/payouts under D4, with no automatic blanket republication or restoration when the request closes.

The exact existing visibility predicates and private-media boundaries need technical mapping before implementation. When a real invalidity/safety finding requires withdrawal, neutral customer wording cannot be used as a reason to keep invalid content public. This walkthrough adds no broader public-exposure exception or new verification guarantee.

### Retail and variant extension — detailed rules approved

D21 adds new-only retail/resale to the same paired journey. The seller selects a category and offers real option combinations with independent price/stock. The customer sees accurate brand/seller/maker labels, selects the actual size/colour/capacity and keeps that option through cart, order, invoice and aftercare. Parent From prices and savings cannot mix incompatible/unavailable offers. See the [approved category/variant rules](2026-10-31-retail-categories-product-variants.md). This is not approval of used/refurbished/open-box goods or a new fee rate.

### Final public screen arrangement

| Customer screen | What is visible and actionable |
|---|---|
| Categories, search and shop | Expandable category/subcategory navigation and truthful published cards: cover, product name, relevant maker/brand/seller identity, current valid price/From price and actual availability. Avoid empty specification rows, internal verification tasks and misleading discount combinations. |
| Product details | Accurate gallery, selected variant's Selling/Original prices and derived saving where supported, relevant description/specifications, unit/pack information and actual preparation/delivery/return information. Empty optional attributes are omitted; missing facts required for publication cannot simply be hidden to bypass review. |
| Variant selection | Select an actual supported size/colour/capacity combination. Update its price, image where applicable and availability together. Never substitute a different offer, merge independent stock or let an old selection bypass a new hold. |
| Buy actions | Add to cart is available only for the selected eligible offer. Otherwise show the accurate neutral availability message and a useful Browse other products/help destination; do not expose private seller bank, identity or disciplinary reasons. |
| Public shop | Display only the permitted approved public profile and published products. Private costs, private identity/registration records, evidence, pickup/return addresses and bank details stay outside the public profile; specific delivery/return instructions use their authorized order/case flow. Preserve existing required public company/legal-seller disclosures rather than inventing a new exposure policy. |

An optional pricing suggestion or its dismissal is entirely private and changes no customer label, badge, price, purchase permission or order history. Do not show a customer Discount expired because 30 days passed.

## 5. Cart, checkout and manual customer payment

**Example only:** a fictional crochet bag displays NPR 1,000. Checkout shows its applicable item total, delivery, customer marketplace fee where applicable, chosen eligible benefits and final amount. It does not show the seller's 9%/91% or 12%/88% split. Use the approved promotion/referral/credit/customer-fee-waiver combination rules and actual server quote; the example does not change any live price or fee.

| Moment | Customer screen | Seller/admin counterpart |
|---|---|---|
| Cart has several sellers | Group clearly by seller/fulfillment portion. If an item becomes unavailable or its published price changes, identify it, preserve the cart and ask the customer to review the current supported quote. Do not silently remove or substitute items. | Seller still sees only their own records. Recheck publication, terms, inventory, fulfillment and current prices at the actual order boundary. An old cart is not purchase authorization. |
| Checkout | Show delivery information, supported method, full NPR total, actual maker/legal-seller information and final review before Place order. Preserve valid address/input on recoverable errors. | No stock reservation, order or benefit use is claimed until the authoritative operation succeeds. Repeated clicks/lost responses reconcile the same operation instead of creating a second order. |
| Manual bank order placed | **Order placed — awaiting payment**. Show the company receiving-account version, holder, bank/branch/account, exact payable amount, unique order reference and precise payment deadline from that order. | Seller sees **Awaiting customer payment — preparation not started**. The seller's payout beneficiary is never shown as the customer payment destination. Bank/QR/gateway methods appear only when their actual supported paths are ready; QR/gateways remain deferred. |
| Customer submits a payment claim | Enter claimed amount and payment date; reference/image are optional where available. Show **Payment under review** and View submitted details, with the approved four-staffed-hour review target from a complete claim. Preserve the same claim on retry/clarification. | Finance independently matches a completed company bank credit and allocation. A screenshot or customer statement is not confirmed receipt. Seller cannot confirm this payment or see private company bank evidence. |
| Claim incomplete, partial, excess, late or unmatched | Show the specific amount/status, requested information and source deadline; maintain a help route. Do not display Payment complete or a new full payment window. | Apply D7 allocations, the approved one four-staffed-hour buffer where eligible, and Super Admin exception handling. Preserve the actual receipt even if the order cannot continue; no automatic refund or order revival from a claim. |
| Verified payment covers the payable amount | **Payment confirmed**, then the actual preparation/hold status. Payment status and order progress are separate. | Recheck stock/readiness/holds before fulfillment release. Only actual release starts the seller-response clock. |
| COD where supported | **Payment due on delivery** and the actual order/fulfillment status. Display collected/paid only from authoritative evidence, not merely Delivered. | Apply existing COD eligibility/holds. Customer collection and later carrier/company remittance remain distinct; the customer is not asked to repay because remittance is pending. |

Keep the existing D7 24-hour payment window, eligible review buffer and reminder rules; show recorded due times instead of asking users to calculate them. Account changes must not rewrite instructions already issued. Customer payment evidence is only available through authorized order access; general public shop/profile pages do not expose company payment instructions or private bank records.

## 6. Order preparation, delivery and delay

Customer order details show the order reference, each seller portion's items, payment state, current fulfillment step, supported delivery estimate/tracking, last substantive update and Help/case actions. A mixed order may have one portion preparing and another delayed; never mark the entire order completed from one portion.

| Event | Seller dashboard | Customer screen / staff workflow |
|---|---|---|
| Order becomes actionable | **New order — Start packing**, scoped to the seller's eligible unanswered items. Email and bell link to the same order. | **Preparing your order** or the actual next step; payment/other holds remain explicit. |
| Six elapsed hours without the required response | One current **Order needs your response** reminder through the approved channels. Reading it does not satisfy the task. | Do not invent a delay or promise a dispatch date solely because an internal reminder ran. |
| Twelve elapsed hours without the required response | Show escalation and required next action; notify the eligible admin, measured from the original actionable time. | Send the approved factual preparation/delay update. Show a confirmed estimate if one exists, otherwise the next update/support route. Staff follow up within two hours of escalation; Super Admin checks unresolved work at 24 hours from actionability. |
| Seller cannot meet the promise | **Report a delay / Cannot fulfill**, affected items, reason and proposed timing; preserve the case. | Customer receives an accurate update and available support/cancellation choices. The report does not automatically cancel, refund or rewrite the delivery promise. |
| Packing/ready/handoff | Only supported actions appear for the actual item/portion state. Ready for pickup is distinct from handed to the carrier. | Tracking shows recorded preparation/handoff/transit/delivery events. Do not allow a seller to declare payment, delivery or refund completion without the relevant authority/evidence. |
| Issue resolved or order action completed | Task changes to its actual result; pending obsolete reminders are suppressed. | Customer gets the relevant substantive result once, not every internal review note or a burst of outdated outage/reminder mail. |

An explicit supported hold retains original elapsed history and supervision obligations. Unanswered eligible scope is not hidden by another item's progress. Approved case/customer-update times remain authoritative; an incident or email delay does not reset them. Staff-only escalation details and disciplinary reasons do not appear to customers.

## 7. Changes while selling: profile, identity, bank and fees

| Seller action | Seller sees and does | Customer sees |
|---|---|---|
| Normal public-profile revision | Preview draft, submit for Super Admin review, see current/pending versions and the exact next normal edit time. The 168-hour cooldown starts only on actual normal publication; draft save/no-op/Approve only does not start it. | Last approved valid profile until explicit publication. New public media remains private during review. No new public-contact or badge policy is introduced. |
| Pickup/return location update | Use visible copy-address controls followed by independent editing. Preserve existing order/case destinations unless changed through their permitted correction process. | Delivery/return instructions reflect that specific order/case. A profile edit must not silently redirect a parcel already in progress. |
| Product price/content change | **Request an update** for the exact pending version; keep current public price visible. Pause new orders immediately where allowed if the old price/promise cannot be honored. | New approved price/content appears only after publication. Checkout revalidates current quotes; confirmed orders keep their original snapshots. Ordinary allowed stock updates remain separate. |
| Verified PAN/identity change | **Request a change**, meaningful reason, explicit scope/consequences, permission to replace, then new evidence for verification. Unknown material identity changes hold new orders/payouts from request submission; approved evidence-only classification follows D4. | Neutral current availability, no identity number or review reason. Fulfillment/support for existing orders follows its actual permitted state. |
| Verified bank change | Warn before submission that affected unpaid payouts pause. Keep masked current and proposed versions separate. Bank verification and subsequent payout preparation are distinct steps; old/sent/uncertain transfers stay traceable. | No bank-change disclosure. Orders may continue only while actual current route readiness remains valid. |
| Commission notice/start | Show one current fee, and an upcoming 12% with its actual published effective time only while scheduled. Accept the exact terms explicitly; store the version. Older orders keep their original rate. | Customer item/checkout prices remain transparent; seller commission pairs and private terms acceptance do not become customer charges or disclosures. |
| Terms accepted after a hold | Confirm acceptance, stop obsolete reminders and clear only the terms-related new-order hold. Show any other blocker separately. | Ordering resumes only when all other checks pass. Existing orders and their recorded rates are unchanged. |

All protected-change requests keep prior evidence and auditable decisions. Permission to upload is not verification; verification is not live activation; request withdrawal is not automatic restoration. The approved one-business-day first review targets apply to relevant product/profile/bank/identity work under the temporary continuous Team calendar, preserving existing contractual/provider clocks.

## 8. Cancellation, return and refund: both views of one case

| Moment | Customer screen | Seller dashboard / staff counterpart |
|---|---|---|
| Cancellation request | Show the actual permitted seller-portion scope and cutoff. A request result says **Cancellation requested**, never Refund complete. Custom/prepaid orders show their applicable saved conditions without invented automatic penalties. | Seller receives the approved stop-work/dispatch instruction or actual hold for unhanded goods. Staff review within the approved two-hour/24-hour targets. Narrower unsupported actions go to the existing staff case route, not an invented cancel-item button. |
| Goods already handed over | Explain the supported next step, such as staff review/interception or the appropriate return route. Preserve the request and timeline. | Resolve carrier custody and mixed item states; do not cancel a recorded handoff or declare goods returned through a simple status edit. |
| Return/complaint request | Open the order's eligible case, choose supported scope/reason, provide relevant evidence and see the requested next action. Apply the approved seven/fifteen-day baseline and continuing protections from the actual saved policy. | Seller provides facts/evidence for their own scope. Staff owns the decision, with 24-hour first review and the approved 24/48-hour clarification sequence. |
| Return accepted | **Return approved — follow these instructions**, with authorized location, carrier/method, tracking and company-funded carriage under the approved rules. Do not expose a general private address before authorized instructions. | Coordinate collection/handoff and record actual receipt/inspection. Use approved two-business-day instructions and three-business-day inspection targets; no automatic forfeiture for a carrier failure or mere five-day coordination delay. |
| Refund entitled/approved | **Refund approved** with the attributable amount, original route, next step and valid expectation. | Finance prepares; eligible Super Admin may prepare, approve, execute manually and record the actual outcome without a compulsory second person. Seller cannot mark the customer refunded. |
| Transfer sent, uncertain or completed | Use **Refund processing** or an accurate waiting-for-confirmation message until completion evidence exists; then **Refund completed** with safe receipt/reference and date. | Preserve reservations while uncertain and reconcile before another transfer. Do not equate an approval/email/send attempt with completed money movement. |
| Seller was already paid | Customer sees their authorized refund progress without being told to collect money from the seller or wait for seller recovery. | Seller sees the separate itemized recovery adjustment/obligation, original order/case, eligible earnings applications, verified repayments and dispute route under D15. Existing recovery deadlines remain unchanged. |

Use the same case reference across messages and both dashboards. A request for specific missing information replaces generic repeated prompts for that waiting period. An unresolved staff-dependent case gets the already-approved update cadence, with any earlier promised update honored. Preserve customer rights and original financial allocations; no duplicate refund, charge or credit follows a retry.

## 9. Seller earnings and the approved simple payout request

On Earnings & bank, distinguish **Pending earnings**, **On hold**, **Available for payout**, **Requested / processing** and **Paid**. A customer receipt, order value or unremitted COD collection is not immediately available seller cash. Explain historical fees and adjustments per order in rupees using the applicable route, recorded rate and funding/readiness rules.

The approved D9 request flow:

1. Open **Request available payout** from the actual eligible balance. Display server-calculated amount and the verified masked receiving account; show any blocking reason and exact corrective path.
2. Automatically record the standard purpose. Approved display wording: **Purpose: Seller earnings payout**. Show a **Note** field with short help, Add context if needed. Blank/whitespace is accepted; a short note is permitted up to the existing 500-character bound. There is no mandatory written explanation for an ordinary request.
3. Explicitly submit. Draft autosave never requests a payout. Repeated clicks or a lost response reconcile the same request; one active relevant request links to its status instead of allowing duplicate requests.
4. Show **Request received**, then the actual review/prepared/approved/processing/paid state with amount, safe destination/reference and next party. If eligible funds change, show the true prepared amount and reason. Approval does not assert bank completion.
5. Bank/identity holds, verified beneficiary checks and actual external transfer evidence still apply. Required reasons for bank changes, disputes and staff exceptions remain required; the optional seller note does not remove them.

Customers see none of the seller's bank, payout or recovery history. Their refunds and order care remain available through the customer case workflow. This planning approval performs no payout and enables no automatic transfer.

## 10. Notifications, forms and failure states across both roles

The bell and inbox read the same authorized notification and share read status; each deep link opens the exact relevant product, order, case, field or request. Opening a message does not submit a form, accept terms, complete a task or confirm money. Recheck ownership/permission when opened and before sending; unread status never justifies another copy of the same email.

Preserve the approved automatic sending, temporary retry schedule, outage/recovery alerts and current-state deduplication. Once the actual task is addressed, suppress pending reminders/retries for it. A later new event may create a new notification. During an email outage the dashboard keeps the real task visible; provider acceptance is not labelled inbox receipt. Uncertain acceptance is reconciled rather than blindly resent.

Both seller and customer forms use field-level errors, a useful summary and truthful saved-state feedback. A temporary form failure retains authorized draft input and supplies Retry/help with a non-sensitive support reference. A validated compatible fallback cannot bypass revoked terms, current permissions or financial requirements. A lost mutation response leads to checking its recorded result before creating a fresh attempt. Session expiry requires reauthentication while preserving protected saved work; switching accounts must never reveal another person's draft.

Loading, empty, error, waiting on another party and permission-blocked states are distinct. Do not show zero sales because the request failed, a success banner from an unsaved form, or a disabled button without an explanation. Preserve focus/keyboard navigation and readable mobile actions. The planned Nepali guide appears only when actually produced and checked against the final flow; no broken player or invented language requirement is added.

For the price-check suggestion, opening/reading its notification is not a price change or new review approval. Optional Dismiss suggestion stops its remaining reminders; taking no action causes no expiry or restriction. The approved D20 cycle/recipient/deduplication rules apply. No mandatory monthly seller or Super Admin response is created.

## 11. Later acceptance walkthrough and approval record

The implementation team later verifies each paired transition through authorized UI → server → saved record → other role/public result. Until then these are acceptance cases, not passing tests:

- Incomplete registration reaches its own correction/dashboard routes; saved progress restores without duplicates or mandatory unrelated bank/profile fields.
- Incomplete/zero-cover drafts can reach assistance, one usable cover/no occasions can reach complete review, and publication waits for actual offer facts and an accurate cover; private drafts/media stay private; Approve & publish produces the correct public and orderability result under both permissions.
- A valid browse-only product stays unavailable at card, detail, cart and final order boundary; withdrawn/unsafe/private content cannot leak through public media, metadata or an old link.
- Price/profile revisions preserve current versions, review and cooldown; stock/holds concurrent with publication cannot be overwritten.
- Mixed-seller cart changes preserve customer input and require review; lost checkout responses do not produce duplicate orders or money/benefit effects.
- Manual payment claim/partial/late/COD cases remain truthful; only verified fulfillment release starts 6/12-hour seller timing; actual source/provider mappings must support every shown action.
- Bank/material-identity changes retain scoped holds and current versions; clearing one case does not clear unrelated holds or execute a payout.
- Cancellation, returns and refunds preserve actual scope/custody, original terms, company-funded approved carriage, completed-money evidence and separate seller recovery.
- D9 accepts an empty or short note through all layers, preserves historical notes and blocks ineligible/duplicate payouts. One eligible Super Admin can complete approved finance stages while personal-conflict checks remain enforced.
- Bell/inbox links, permissions, duplicate suppression, expiry, automatic retry and outage recovery remain consistent across role views; unsaved errors never masquerade as success.
- Optional price suggestions and genuine required tasks remain distinct: day 30 causes no badge removal, repricing, order hold or overdue escalation; dismissal/new published pricing stops obsolete notices, and genuine unsupported comparisons still use recorded moderation.
- Desktop and mobile expose the same seven seller sections, exact linked records, all supported optional product details and per-offer preview without exposing private account/cost information.

- [x] Record D9 standard payout purpose with optional note as approved; earlier business-policy approvals remain settled.
- [x] Draft this paired walkthrough for the work plan only. This checkbox records document preparation, not design approval, runtime verification or deployment.
- [x] User approved navigation, Home priorities, screen wording and paired customer/seller states on 1 November 2026.
- [x] Record D10 version inclusion: all active work-plan items belong in this version; explicit deferrals remain excluded. Actual supported country-specific phone validation must be mapped without altering the Nepal default/no-OTP behavior or inventing international commercial routes.
- [x] Record D19 calculator, private profit helper and customer preview approval for this version.
- [x] Record D20 approval with the subsequent no-expiry/no-compulsory-price-change correction.
- [x] Expand the final section-by-section seller walkthrough, concrete product example and public-screen arrangement on 1 November 2026; preparation is not presentation approval.
- [x] Fresh read-only builder check of this walkthrough and corrected advisory price rules reported nothing important left. That check was design review only and preceded the explicit user approval now recorded; it is not application testing.
- [x] User approved the final paired-screen presentation; all referenced approved business rules remain settled.
- [ ] Map actual accounts/coverage, current visibility and route checks, payment/carrier capabilities, source form contracts and deployed checkpoint. Resolve concrete source contradictions before implementation; include the now-explicit D21 variant work across its lifecycle; do not imply current capability or invent separate unsupported shipping/payment/cancellation features.

The backup program, QR/gateway integration, fixed working hours and excluded language/public-content policy work remain deferred. Existing operation-specific controls remain in force. See the [remaining-decision register](../plans/2026-10-30-planning-readiness-review.md#51-remaining-decisions-and-mapping). **Implementation and deployment remain on hold.**

### Original prices and discount preview — approved rules, 1 November 2026

Use the expanded [D20 detail](2026-10-31-product-discount-price-guidance.md) in the final paired walkthrough: one Selling price, optional supported Original price, automatically derived savings and an explicit percentage Apply tool. Show the selected variant's actual price pair and keep private profit/fee estimates separate from customer savings. Normal-price publication needs no original-price claim; incomplete drafts remain eligible for help. D20 details are approved, including the subsequent no-expiry correction; this final paired presentation is now approved; D21 categories/variants and expandable categories/subcategories are now approved. Implementation remains on hold.
