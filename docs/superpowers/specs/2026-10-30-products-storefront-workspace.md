# Products & storefront — submission, review and publication

Status: Products & storefront approved by the user on 30 October 2026, including explicit Approve & publish for authorized staff. Approval covers the workspace, submission/review/correction/publication journey, last-approved-version handling during ordinary revision review and separate public visibility/order acceptance. D2 edit/price classifications, quality rules, urgent correction/restoration and first published-product revision review within 1 business day were also approved on 31 October 2026. Team policy now also approves first review of complete new product submissions within one service business day. Actual named coverage remains to be mapped. Implementation remains on hold until planning is complete and the user explicitly resumes work. No product, category, media, storefront configuration or live seller state is changed by this document.

Approved D22 amendment, 31 October 2026: [optional-entry/support workflow](2026-10-31-optional-product-intake-support.md) allows incomplete seller intake and makes all supported details discoverable through preview/help. Missing facts are completed before publication/ordering; Super Admin receives email plus dashboard/bell for operational events alongside the responsible team. This supersedes older complete-field/photo assumptions at intake without bypassing publication authority.

Related: [master working plan](../plans/2026-10-30-seller-order-response.md), [planning review](../plans/2026-10-30-planning-readiness-review.md), [approved Overview/review workflow](2026-10-30-super-admin-overview-review.md), [approved Sellers section](2026-10-30-seller-management-workspace.md), [Seller Center](2026-10-30-seller-center-workspace.md), [field cleanup](2026-10-30-form-management-field-inventory.md), [Form Management reliability](2026-10-30-form-management-reliability.md) and [Email delivery](2026-10-30-email-delivery-automation.md).

The [approved Team & business policies design](2026-10-31-team-business-policies.md) adds first review of a complete brand-new product submission within one service business day and distinguishes review from publication access. Both new-intake and published-revision review targets are approved. The temporary continuous service day is 24 hours; exact fixed hours are deferred.

## 1. Purpose, approved boundaries and current evidence

Give sellers a resumable path to submit a product, staff one place to review and publish the exact version, and customers a truthful listing. Keep one canonical product and version history across Seller Center, Seller Management, global moderation and the storefront.

Already approved and carried forward:

- Eligible applicants can prepare and submit products before commercial activation; dashboard access and permitted product submission must not depend on payout readiness.
- D22 accepts incomplete or zero-cover intake for assistance. One clear accurate cover can suffice for publication; gift occasions and extra details remain optional. Request additional views only for a specific review concern.
- Product submission/review, public publication, permission to accept orders and payout eligibility are distinct. Eligible reviewed/published Managed Maker products may be public while ordering remains blocked.
- Core form reliability, saved draft/upload recovery, explicit submission, permission checks, automatic appropriate notifications, retry/recovery and suppression of obsolete/duplicate messages apply.
- Product language, translation fallbacks, public-contact policy and verification-badge meanings are not redesigned in this phase. Preserve existing supported content rules and product-specific language behavior; do not add a Nepali-only or duplicate-translation requirement.

Read-only local checks during this planning turn found:

- `components/admin/product-review-actions.tsx` has separate Start review, Request changes, Approve, Publish, Unpublish and Reject controls. Approval says the item remains private until publication. Publish copy already distinguishes listing requirements from commercial checks; an older design describing unconditional visibility wording is dated evidence, not the current local component.
- `lib/db/repositories/products.ts` and the review API distinguish `product.review` from `product.publish`. The current simple action flow does not provide the proposed combined action.
- `lib/products/eligibility.ts` already separates a public-visibility predicate from stricter commerce eligibility. Earlier descriptions of one shared predicate must not be treated as proof that this code still needs to be built from scratch. Its deployed state and full behavior were not verified here.
- Submission/classification/revision paths still contain the older occasion and photo requirements, including nonempty occasions and a four-photo revision check. The approved one-cover/zero-occasion policy must be reconciled across all consumers when implementation resumes, not only the visible form.

This is source-based planning, not a production/browser test or a completed implementation. Reconcile the paused code checkpoint before starting later work.

## 2. Admin Products & storefront workspace

Recommend these focused subsections under one main area:

| Subsection | Work managed here |
|---|---|
| Review queue | New submissions, corrections, pending revisions, assigned/unassigned tasks and products awaiting publication. |
| All products | Searchable product library with seller, category, review/publication state, stock and actual orderability. |
| Categories & occasions | Existing taxonomy management with safe category/occasion mapping and preserved historical references. |
| Homepage & featured products | Select/reorder eligible public products using the existing storefront controls; featuring never bypasses review or visibility. |
| Customer reviews | Existing customer-review/reply moderation linked to the product and permitted order context; retain existing eligibility and authority. |

The section header provides product/seller/reference search, the shared notification bell and last-updated state. Summary counts distinguish Awaiting review, Changes requested, Approved awaiting publication and Public products. A public product can also have a pending revision; counts must identify what is being counted rather than add overlapping numbers into a false total.

The review queue defaults to work needing staff attention, with Assigned to me, Unassigned, Waiting for seller and Awaiting publication filters. Each row shows cover thumbnail from authorized media, product/reference, seller, category, submitted revision/date, task owner, current status and Open review. Priority and deadlines follow the agreed shared queue policy; normal product-review deadlines and staffing remain to be set.

All products adds permitted filters for seller, category, review state, public visibility, availability and archived records. Product links opened from Overview or Sellers return to this same product/version and history. Preserve filter/scroll position and support readable task cards on mobile. Do not expose draft thumbnails or private evidence to unauthorized viewers.

## 3. Seller submission — three focused steps

Current planned sequence, reconciled with approved D19 and D21 scope: **Basics → Photos & details → Review**. Price/stock/option rows belong within the relevant sections, not a second competing wizard. Let sellers revisit steps without losing saved work. Keep one product reference and its draft/version chain instead of creating a new listing for every retry or correction.

| Step | Information and behavior |
|---|---|
| Basics | Product name, supported category, useful description and selling-unit/price/stock/preparation controls. Use saved seller context rather than registration or bank questions. D19 adds fee/profit guidance; D21 adds category-relevant real options. |
| Photos & details | One cover, optional additional media and gift occasions, relevant category attributes and accurate variant photo mapping. No hidden irrelevant field blocks submission. |
| Review | Preview customer card/detail and selectable offers, link corrections to exact fields/rows, and explicitly Submit for review. Autosave never submits or publishes. |

Incomplete drafts can be saved and sent for review/assistance under D22. Missing name/category/price/stock/photos/detail fields do not block that intake; supplied invalid values remain flagged draft input rather than authoritative offer data. Before publication/ordering, establish the actual applicable offer, photo, category and readiness facts. No bank/activation loop may prevent permitted assistance intake.

Keep draft save feedback accurate: Saving, Saved at [time], Unsaved changes and Save failed. Restore successfully saved fields and uploaded media after navigation/session recovery where authorized. A selected but not uploaded file is not saved. Show upload progress and allow retry of a failed file without forcing successful files to be uploaded again.

Gift occasions allow none; supplied selections remain valid and within existing limits. Do not invent tags. A moderator may request another image when needed to assess the item, with a specific reason, rather than silently restoring a universal four-photo intake requirement. One clear image may satisfy publication quality if the product can be assessed; category-specific quality/evidence rules still need an explicit mapping.

Use the existing permitted media formats, size checks and access controls. An incomplete submitted candidate may need photo assistance; keep at least one accurate usable cover before publication. Never remove the cover from the current published version through a private draft edit. Changing the cover does not accidentally publish private draft media. D21 now includes real selectable variants with separate stock/price and full order/aftercare support. Existing free-text variations alone cannot supply that behavior or be automatically converted into offered combinations.

Form Management supplies only the approved controlled customization. Draft progress, domain validation and submission cannot depend unnecessarily on editable extra questions. Configuration or compatibility failures preserve work, explain the next step and create the appropriate staff diagnostic signal without faking success.

The [approved price and public-information preview](2026-10-31-seller-price-public-preview.md) now extends the seller editor for this version: live applicable fee estimates, optional private cost/target-profit guidance and a faithful public-field/media preview before submission. D19 is approved for this version; it does not change price-publication authority, accepted fee policy, private evidence boundaries or one-cover/optional-occasion intake. D20 detailed pricing/discount rules are approved with advisory price checks only; a valid discount does not expire after 30 days. [D21 category/variant details](2026-10-31-retail-categories-product-variants.md) extend this workflow for new-only retail/resale alongside handmade products.

## 4. Status model: review, visibility and ordering

Always show the precise version under review and the currently public version, if any. Review status and storefront visibility are separate dimensions; a revision awaiting review does not mean the previously approved public version is automatically replaced.

| State | Seller/admin meaning and next action |
|---|---|
| Draft | Private editable work, not submitted. Continue draft. |
| Submitted / awaiting review | A recorded version is waiting for authorized staff. Show reference/date and owner when assigned. |
| In review | Staff are reviewing that exact version; do not silently change the evidence underneath them. |
| Changes requested | Seller sees specific correction feedback, edits a permitted revision and resubmits through the same product/version chain. |
| Approved awaiting publication | Review is complete for this version, but it is not yet public. Show the actual publication hold or next responsible action. |
| Published | The published version is recorded. Show whether public-visibility checks currently pass and independently whether customers can order it. |
| Rejected | That submitted version has a recorded rejection reason and the permitted next support/revision route. This alone does not silently erase an older published version; urgent withdrawal is a distinct action. |
| Unpublished / archived | Removed from the applicable public/new-sale surfaces under the actual policy. Preserve product, decision and existing-order history. |

Illustrative paired states: Public version 2 — revision 3 awaiting review; Public — ordering not enabled yet; Approved — waiting for publication. Avoid one generic Active flag or telling a seller to submit again when staff still need to act.

## 5. Admin review workspace

Use the approved full-width shared review layout. The persistent header shows product/reference, seller, submitted version, current public version if any, owner and task state. Staff can open seller context without losing the review note or queue position.

Place product information/media beside a private storefront preview. For revisions, compare the last approved version with the proposed values and highlight changed description, images, category, price and fulfillment details. Keep inventory changes that occurred independently visible rather than overwriting newer stock with an old review snapshot.

The review checklist covers:

- Product identity, category and description are coherent and describe the actual submitted item.
- Cover/media are usable and appropriate; additional evidence is requested only for a stated gap.
- Price, sale-price calculation, stock and preparation information are valid and not contradictory.
- Applicable materials, dimensions, care, safety, warranty and supported claims satisfy the existing relevant policy. No new unsupported claims are invented during editing.
- Seller ownership, restrictions and current listing eligibility are checked; any company-owned blocker is assigned to the appropriate staff task.
- The submitted version is current and no unresolved correction or competing decision makes the review stale.

This is a product review, not verification of the seller's bank or automatic commercial activation. Keep private seller documents behind the proper role-controlled links.

Review actions: Start review, Request changes, Reject and the applicable approval/publication actions below. Provide a meaningful review reason and separate seller-visible feedback from internal notes. Correction requests identify the field/image and required change, with secure direct links for the seller. Assignment does not grant review or publication authority; preserve existing independent/ownership and role checks.

## 6. Approval and publication — approved decision

The user approved explicit Approve & publish on 30 October 2026. The alternatives below preserve the decision context; the combined action with Approve only for deliberate holds is selected. Existing implementation remains at its separate-action checkpoint until work is resumed.

| Option | Tradeoff |
|---|---|
| Keep Approve and Publish as two required actions | Preserves current separation, but an approved product may be left waiting for a second staff action. The queue must identify that responsibility clearly. |
| Explicit Approve & publish, with Approve only available | Approved choice for staff with both existing permissions when all publication checks pass. One deliberate confirmation completes the intended review/publication workflow while preserving separate checks and audit facts. |

Under the approved option:

1. Show Approve & publish only to an authorized reviewer holding both review and publish authority for the exact product/version. A review-only staff member can approve and route the remaining publication task to an eligible publisher.
2. Recheck product version, ownership, restrictions, taxonomy/media, review and publication eligibility before saving. Do not make missing commercial purchase eligibility a hidden publication blocker where the approved browse-only policy permits visibility.
3. Show the real result before confirmation: this product will be public and orderable when all purchase checks pass, or public with ordering unavailable pending the separately listed checks. Keep private reasons inside the admin/seller workspace.
4. Record approval and publication coherently with one request identity, retaining both review and publication audit facts. Do not silently succeed only at approval while claiming publication. If a deliberate hold is needed or publication prerequisites fail, show that explicitly and offer the separate Approve only path where permitted.
5. Approve only records a clear reason/remaining step and routes a publication task to the right owner. Publish later must apply to the exact still-approved version and recheck current conditions.
6. After saving, show the authoritative review/publication/visibility result and a public link only when the listing is actually eligible to be viewed. Track known propagation/failure separately rather than promising instant visibility after an unconfirmed outcome.

A combined approval/publication outcome should produce one coherent seller notification, not two repetitive emails for the same combined action. Separate later transitions may each create their own relevant event. In either option, autosave, preview, homepage selection and document verification never publish a product.

The existing separate-action implementation remains unchanged during the hold. The approved combined action must preserve both permission checks; this approval grants no broader role permission or automatic product approval.

## 7. Publication versus permission to order

| Situation | Public storefront | Ordering behavior |
|---|---|---|
| First draft/submission/changes requested/rejected without a valid published version | Private; authorized seller/staff preview only. | No new orders. |
| Approved version awaiting publication | Private until the required publication decision succeeds. | No new orders for that unpublished version. |
| Eligible published Managed Maker, commercial checks pending | Visible under the agreed browse-only rules; show Not available to order yet. | Cart/checkout remain blocked for the item. |
| Eligible published product and purchase checks pass | Show current valid product/price/availability. | Allow ordering only within actual stock, fulfillment and other existing checks. |
| Temporarily out of stock | Use accurate stock availability where the listing remains public. | Do not permit an unsupported purchase or claim available stock. |
| Withdrawal, applicable seller restriction or deletion | Follow the actual public-visibility restriction; no draft/private media leak. | Reject new orders when the restriction applies; preserve existing-order records. |

Apply consistent visibility and availability to cards, search, product details, seller shops, recommendations/homepage selections, wishlists, public media and metadata. Publication or adding a product to a homepage list cannot bypass this boundary. Reconcile the already-recorded open visibility policy for later evidence/terms blockers before implementation; do not invent a broad public exposure exception.

Recheck purchase eligibility at cart refresh, checkout and the authoritative order boundary. A stale page, direct request or retained cart cannot buy an item merely because it was once public. Preserve the customer's remaining cart and show which item needs attention rather than silently dropping it or placing an unauthorized order. Product changes do not rewrite confirmed order prices, accepted fee terms or historical item snapshots.

## 8. Corrections and changes after publication — approved D2 rules

The approved direction keeps the last approved public version during ordinary content review and makes the proposed version private. Reviewers see both. Urgent withdrawal remains available to authorized staff when retaining an inaccurate/unsafe live listing would be inappropriate; existing orders and support consequences need explicit handling, not automatic deletion or refund. The user approved the [D2 published-product edit rules](2026-10-31-published-product-edit-rules.md) on 31 October 2026, including the field/price matrix, price-only requests, urgent handling, preserved public versions and first revision review within 1 business day.

| Change | Approved handling under D2 |
|---|---|
| Name, description, images, category, claims, materials or meaningful fulfillment changes | Submit a reviewable revision; public version stays intact unless an authorized withdrawal is necessary. |
| Selling/compare-at price | Treat as a controlled revision under the agreed price-review policy; the approved rule requires staff review before the revised public price takes effect. Revalidate old cart quotes and preserve confirmed-order amounts. |
| Ordinary permitted stock update | Use the native stock action and audit trail without another content review. Respect reservations, concurrent orders and current stock rules; do not overwrite newer stock when publishing a content revision. |
| Staff classification or storefront placement | Preserve current catalog/homepage permissions and audit changes. Do not use classification controls to silently rewrite material seller content or publish unreviewed claims. |
| Unpublish/archive | Explicit reason and current permissions; remove the applicable new-sale/public availability while retaining history and existing obligations. Restoring must recheck current review and listing eligibility. |

Correction resubmissions retain the same product reference and version chain. Freeze the exact review submission; further edits must be a clearly identified draft/revision, not silent changes under the reviewer. Deduplicate retries and check the recorded result before creating a new submission after a lost response. Do not force sellers to recreate a product because only one image or field needs correction.

Carry forward the [approved D2 rules and one-business-day first revision review target](2026-10-31-published-product-edit-rules.md). Named ownership/calendar is D5. The seven-day maker-profile cooldown does not extend to product drafts, stock or order work; profile field/cooldown scope and first routine review within 1 business day are approved in [approved public-profile and cooldown rules](2026-10-31-public-profile-changes-cooldown.md).

## 9. Storefront management

Categories and occasions keep their existing native identifiers and ownership. Prefer archive/reassignment with an impact preview over deleting a category that published products still use. Changing taxonomy must not strand listings, silently add occasions or erase historical classifications. Optional occasion intake must also be accepted by staff classification and publication paths.

Homepage/featured selection uses existing supported controls to choose and order products that currently meet public visibility. Show a thumbnail, seller, publication/availability state and a preview of the intended placement. Clearly distinguish browse-only products from currently orderable ones; do not label a browse-only selection Buy now. If a selected product becomes ineligible, suppress it according to current visibility rules and surface a staff task instead of retaining a misleading card. Featuring never changes ownership, review or ordering eligibility.

Customer-review moderation remains its existing workflow with a product context, permitted evidence and reasoned decisions. Do not redefine public badge meanings, translate product content automatically or add new public-contact policies as part of this work. Preserve access to existing review/reply records and legitimate customer content under the actual moderation policy.

Storefront previews must not expose private drafts to search/public media. Keep authenticated draft preview and real public links distinct. Validate publication/unpublication propagation across current read paths and caches so a withdrawn item is not still promoted or orderable through a stale surface.

## 10. Notifications, history and errors

| Committed event | Recipient and task effect |
|---|---|
| Product submitted/corrected | Eligible product-review staff get one canonical task; seller sees the reference and submitted state. |
| Changes requested | Seller receives precise feedback and a direct link to that product/version/field; task waits on the seller. |
| Approved but awaiting publication | Seller sees approval with the remaining publication step; eligible publisher receives its task. No claim that it is public. |
| Published / combined approve-and-publish succeeds | Seller gets one accurate outcome with public visibility/orderability and an appropriate link. Never imply orders are enabled solely from publication. |
| Revision rejected or listing withdrawn | Seller sees the scope, reason and permitted next action. Preserve historical outcomes and distinguish old/public from proposed versions. |

Use the approved automatic email delivery and shared bell/inbox policies. Notification read status does not complete a correction or publish a listing. Once the underlying issue is addressed, cancel obsolete reminders and prevent later queue scans from recreating them. Recheck current state and recipient rights before sending, and reuse the event identity on retry. Known accepted sends are not repeated; uncertain provider outcomes need reconciliation.

Keep decision/version history with actor, time and reason. Staff-only notes stay private. An email outage does not undo a saved product submission or approval; show delivery status separately and continue the approved automatic recovery. Network/form/version failures retain permitted draft fields, uploads and review notes; no full-form restart or false Saved/Published state.

## 11. Later acceptance walkthroughs

| Scenario | Required outcome |
|---|---|
| Incomplete applicant adds a product | Permitted draft/submission works without a bank-completion or activation loop; relevant product requirements remain clear. |
| One cover and no occasions | Otherwise valid new and correction submissions pass; zero-cover intake reaches assistance without losing work, while publication needs an accurate usable cover. Optional tags remain optional throughout classification/review/publication. |
| Interrupted upload or sign-in | Successfully saved fields/media restore safely; failed/unsaved work is identified and can be retried. |
| Review/correction/resubmission | Same product/version chain, precise feedback, no duplicate task, product or event after a repeated request. |
| Review-only versus publisher | Unauthorized combined/publish requests fail; an authorized action rechecks both permissions and exact version, including permission revocation. |
| Approval/publication outcome | Deliberate approval hold is visible; the chosen publication flow produces the actual public result, correct queue and one appropriate outcome notification. |
| Browse-only versus active product | Public listing can be viewed where allowed, but direct/cart/checkout requests remain blocked until all purchase conditions pass. |
| Concurrent edits/review/stock | A stale decision cannot approve changed content or overwrite newer stock/reservations; notes and historical data remain recoverable. |
| Pending revision of a public product | Only the last approved version remains public until the new version is reviewed/published; private proposed photos/text cannot leak. |
| Price/terms change and existing orders | New quotes are revalidated; confirmed order prices, fees and item snapshots retain their recorded values. |
| Withdrawal/restriction/archival | All applicable public surfaces and purchase boundaries enforce current state, while existing orders and audit records remain. |
| Homepage/category changes | No visibility bypass, orphaned active classification or fabricated required occasions; appropriate previews/history are preserved. |
| Resolved correction and email outage | Obsolete reminders stop; delivery retries and recovery work without manual batches and do not duplicate the committed outcome. |
| Mobile/keyboard and missing data | Primary actions and media review are usable; loading/empty/error states are distinct; existing supported content behavior remains intact. |

Use fictional products/media and isolated fixtures when work resumes. Verify real UI → API → saved record → staff review → public display/checkout boundaries, including registered-seller regressions. Preserve canonical local launch/data rules, captured test mail and simulated payments. Apply the latest authorized release preference later; this document does not resume staging or production operations. These checks are not claimed to have run.

## 12. Decisions to settle before affected implementation

1. Settled: explicit Approve & publish is approved, with both permission checks and Approve only for deliberate holds. Do not reopen this choice as an implementation blocker.
2. Carry forward approved D2 public-product edit/price, quality and urgent-handling rules and its one-business-day first revision review target; later reconcile all source paths without reopening policy.
3. Name review/publication owners under the [approved Team design](2026-10-31-team-business-policies.md). First new-product and published-revision review within one service business day are approved; the temporary continuous service day is 24 hours. Exact fixed hours are deferred. Super Admin oversight does not grant every administrator publication rights.
4. Carry the approved workspace/submission layout into later walkthroughs and map existing homepage/taxonomy functions without expanding into unrelated new marketing features. Orders & customer care, Finance & payments and Fees, programs & promotions are approved; [publication permissions and discount combinations](2026-10-31-fee-publication-schedules-combinations.md) are also approved. Product authority stays separate from platform campaign publication; price-review field mapping is settled under D2.

One-cover/optional-occasion intake, browsing before ordering, the approved Sellers/Overview workflows and automatic notification/recovery safeguards are settled. Language/public-content policy remains excluded. Implementation remains on hold until planning is complete and the user resumes work.

### Original-price and discount detail — approved with correction, 1 November 2026

The expanded [D20 design](2026-10-31-product-discount-price-guidance.md) covers a single primary Selling price, optional discount claims, genuine previous same-offer evidence, exact variant price pairs, admin comparison/history and unsupported existing claims in badges/text/media. Scoped correction must preserve truthful Selling prices and committed orders; a private draft or browse-only proposed price is not automatically proof of a previous selling offer. D20 refinements are approved with the latest no-expiry/no-compulsory-change correction; D19/D21/D22 remain settled. Implementation remains on hold.
