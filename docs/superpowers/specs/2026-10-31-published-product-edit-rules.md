# Published product edits, price changes and review

Status: approved for the work plan, 31 October 2026. The user explicitly approved the D2 product-edit rules and first review of a complete published-product revision within 1 business day. Approval covers the field matrix, staff-reviewed price/content changes, immediate authorized stock/pause/resume, frozen candidates with retained public versions, quality checks and urgent correction/restoration. D1 Approve & publish, one clear cover/optional occasions and publication/orderability separation remain settled. Implementation remains on hold until planning is complete and the user explicitly resumes work. No product, price, permission, stock, customer order, financial record or deployment is changed here.

Latest [D22](2026-10-31-optional-product-intake-support.md) permits incomplete seller product intake for assistance and does not force every detail before sending. Frozen revision/current-public separation and actual approval/publication checks below remain intact. Support-prepared changes need actual facts and the appropriate seller confirmation; no help resolution publishes a price or product automatically.

Related: [master work plan](../plans/2026-10-30-seller-order-response.md), [decision register](../plans/2026-10-30-planning-readiness-review.md), [Products & storefront](2026-10-30-products-storefront-workspace.md), [Seller Center](2026-10-30-seller-center-workspace.md), [field cleanup](2026-10-30-form-management-field-inventory.md), [Form Management](2026-10-30-form-management-reliability.md), [fees/discount rules](2026-10-31-fee-publication-schedules-combinations.md), [approved manual payments](2026-10-31-manual-payment-rules.md), and [finance approval amendment](2026-10-31-single-super-admin-finance-approval.md).

## 1. Approved approach

Keep ordinary stock and seller-controlled availability updates immediate, with audit and current access checks. Review changes to the published price and customer-facing product information before those changes become public. Keep the existing approved version live during ordinary review; let the seller immediately pause new orders if that version should no longer be sold.

Two realistic price approaches were considered: instant seller repricing for unchanged products, or explicit review of all selling/compare-at price changes. Instant repricing reduces review work but makes the published price and discount claim change without staff seeing the new combination. The user approved reviewed prices for this release, consistent with the existing published-version plan, using a short Price change request with a focused comparison. Do not introduce arbitrary percentage thresholds that let repeated small edits bypass review. The user selected this detailed D2 policy on 31 October 2026; implementation and verification remain outstanding.

No seven-day profile cooldown applies to product drafts, price requests, stock, pause actions or order handling. No automatic approval after a deadline. Financial single-Super-Admin approval does not grant product permissions or remove product ownership/conflict checks.

## 2. Local source evidence

Read-only inspection found:

| Source | Relevance |
| --- | --- |
| `lib/products/submission.ts`, `components/seller/product-submission-form.tsx` | Existing fields include selling/compare-at price, stock, title/descriptions, media, category/occasions, materials/origin, dimensions/size/colour, free-text variations/specifications, safety/care/return/warranty, preparation and dates/licence evidence. Classify actual fields rather than an unspecified generic Details group. |
| `lib/db/repositories/products.ts`, seller product revision API | The inspected revision path writes fields into the product and sets its state to submitted. A separate frozen pending revision that safely leaves the approved public version intact needs implementation reconciliation; do not assume the current mutation already does this. |
| `setProductInventory`, seller inventory API | Stock has a separate permission/state-checked, version-sensitive adjustment path and audit history. Preserve this distinction; publishing a content revision must not replay its older stock quantity. |
| `app/products/[slug]/page.tsx`, billing components and stock-code helpers | Seller SKU appears publicly and on billing documents. It is not a purely private field that can be silently omitted from review/version history. |
| Admin product review actions/repository/API and product eligibility | Review/publication permissions and visibility/commerce checks are distinct. Preserve approved Approve & publish under both permissions and actual orderability checks. |

These are planning observations, not deployment evidence or application tests. Reconcile actual source/media/stock consumers and the paused implementation before later work.

## 3. Field-by-field handling

| Field or action | Approved handling |
| --- | --- |
| Available stock/restock | Immediate through the authorized inventory action. Recheck reservations, quantities and current values; log an adjustment. It cannot rewrite already-committed order quantities or restore reserved stock twice. |
| Pause new orders for this product | Immediate seller action with a clear reason/history. Keep a safe published listing visible but not orderable, or use the supported stop-listing/archive action if the seller wants it removed. Existing orders remain actionable. |
| Resume the seller's own pause | Immediate only for the same approved public version while all current product/seller/terms/stock/commerce checks pass. Cannot clear a staff withdrawal, safety restriction or another hold. |
| Selling price, whether increasing or decreasing | Price revision requiring admin review/publication. Old public price stays until the approved new version is published. Offer pause immediately if the old price is incorrect. |
| Compare-at/reference price, adding/removing/changing sale presentation | Review the whole selling/reference-price combination. Require a valid supported reference basis and truthful calculated discount. No manually entered conflicting percentage or invented price history. |
| Product name and customer-facing descriptions, including typo corrections | Reviewable content revision. No text field is classified as harmless merely because an edit is called a typo. Existing supported languages stay unchanged; no translation policy is added. |
| Cover/gallery photos, video, removal/replacement/reordering and public captions/alt text | Reviewable revision. D22 allows an incomplete submitted assistance candidate; preserve immutable media references and require an accurate usable cover before publication. Existing live media is retained until a new version is published or an authorized withdrawal occurs. |
| Category, gift occasions and product discovery attributes submitted by the seller | Reviewable classification revision. Occasions may remain empty. Use valid existing taxonomy; do not invent required tags or change another product's category through this action. |
| Materials, maker/producer claims, origin/country/story and related evidence | Reviewable revision. Changed evidence does not inherit Verified status. Preserve privacy of supporting documents; category or story edits cannot create a verification badge. |
| Dimensions, size, colour, specifications and variations text | Reviewable revision with actual-item consistency checks. Free-text variations alone do not create selectable offers. The subsequent [D21 design](2026-10-31-retail-categories-product-variants.md) now includes real variants; option identity/labels/media/price are reviewed while authorized stock/own pauses remain operational. |
| Made-to-order flag and preparation time | Reviewable because they change the customer's promise. If the current promise cannot be met, pause new orders and handle existing commitments through Orders & customer care. |
| Care/safety information, warranty, return eligibility/conditions, manufacture/expiry dates and licence reference | Reviewable; preserve applicable platform/category rules. Seller text cannot override platform return rights or establish regulatory clearance merely by being saved. Existing order terms remain intact. |
| Seller SKU | Reviewable public identification change; keep stable product/platform identity and previous order/invoice snapshots. It cannot be used to replace the listing with a different item. |
| Product ID, platform SKU, ownership, commercial route, historic order values and URL identity | Protected from ordinary seller edits. An exceptional correction uses the relevant authorized workflow. No ownership transfer or price/commission/supply-contract change is inferred. |
| Staff category/occasion curation or featured placement | Existing scoped taxonomy/homepage actions with audit and eligibility checks. Material seller content/price changes still need product review; a placement action cannot publish an unreviewed draft. |

Private draft saves are always distinct from live changes. This approved design does not itself add sale scheduling or platform promotions. Subsequent D19 approves owner-private pricing fields and D21 explicitly includes variant infrastructure; their design boundaries apply alongside this version-review policy. If a later source inventory finds another customer-facing field, default it to review-required until explicitly classified; do not let custom form questions write directly to the public version.

Correcting information about the same identifiable item can be a revision. Replacing it with a different item/model or materially different construction requires a new product submission. D21 permits genuinely related pack-size offers as new reviewed variant identities, never overwriting an existing purchased pack identity or combining unrelated products; do not carry old reviews/order identity to a different product. Reviewers explain that decision rather than silently rewriting identity. Existing orders cannot be substituted with the new item without the applicable customer-care process.

## 4. Seller workflow and version rules

Seller Center shows Current public version, its price, current stock/availability, and any draft or pending revision separately. Actions include Update stock, Pause orders, Request price change and Edit product details. Each changed field explains whether it applies immediately or after review.

The price request needs the proposed selling price, compare-at change only when relevant, and an optional explanation; missing unrelated product fields must not block a valid price-only request for an otherwise valid approved product. Show the current/proposed amounts, comparison-price combination and private storefront preview before explicit Submit for review. A required native eligibility/evidence problem is explained with a linked correction task, not a generic form-configuration failure.

Drafts autosave under the approved draft/media rules. Submission freezes a specific proposed revision and its base public version; retries reuse the same request/outcome. Autosave does not publish or silently replace the revision a reviewer has open. Keep at most one submitted candidate revision per product; the seller can maintain a next draft privately.

To change a pending candidate, explicitly withdraw/supersede it and submit the replacement through one version-checked operation. An old approval cannot win after supersession. If publication won first, show the newly public version and rebase the seller's draft; do not pretend it was withdrawn. No hidden last-write-wins change to reviewed content.

Use one coherent revision for its combined content and price changes. Do not offer selective approval of just its price while publishing unreviewed accompanying details. A seller may submit a separate price-only request by retaining the other work as a private draft and intentionally choosing which one pending candidate to submit. Unchanged fields are read from the accepted base rather than resubmitted stale form values.

Stock and seller pause state are operational facts outside the moderated content snapshot. A live stock update or pause during review must survive publication. If the public base, pricing dependency or another relevant reviewed value changed, show a focused comparison/rebase conflict and preserve draft answers; do not silently merge incompatible content. A stock-only change should not force a full content rewrite or reset the review clock.

## 5. Admin review and publication

Open the exact product revision from the shared queue, seller record or notification. Show current public content and proposed changes side by side, including price, reference-price basis, media changes, relevant evidence, new-order availability and any existing-order impact. Price-only requests get a concise view; reviewers can open the complete product when needed.

An eligible admin with product-review authority can request changes or reject the proposed version with field-specific seller feedback. Staff need both product.review and product.publish authority for the already-approved Approve & publish action. One eligible staff member may perform that combined action; there is no requirement for another Super Admin. Product-owner/conflict checks remain and mere Super Admin finance authority does not substitute for product authority.

Review exactly the submitted version. Request changes/rejection does not overwrite the current public version. Approve only records approval without publishing the proposed version. Approve & publish commits the approved public revision and its relevant media/price together after fresh permission, version, classification and visibility checks. If checks changed or publication failed, show the actual saved approval/publication outcome and the next action; never claim the price changed when only approval succeeded.

Publication refreshes product detail, shop/list/search cards, price filters/sorting, featured entries and relevant metadata/caches consistently. A stale cached page or cart cannot bypass the authoritative current price/readiness check. Preserve stable URLs and historical order evidence; draft text, draft media and proposed price must not leak publicly before publication.

Revalidate affected carts and saved checkout quotes. Before order commit, show the new total and require the normal refreshed customer confirmation when price/content/availability changes. Do not silently charge more, discard unrelated cart items or use an old quote against a newly approved price.

Already-committed orders retain their recorded item, price, commission, benefits, terms and invoice values. This includes an existing manual-bank order still inside its payment window: a new catalogue price does not change that order's amount due or restart its deadline. Refunds use the original order allocations. A later price decrease does not automatically refund older orders. Fixed supplier obligations and platform fee/commission policies are not changed by product repricing.

## 6. Quality and urgent corrections

Publication requires a coherent identifiable item: accurate name/description/category, a clear representative cover image, consistent actual price/reference-price claim, applicable required product/safety information and truthful availability. Actual stock/capacity, preparation and fulfillment readiness gate ordering separately under D22; a legitimate browse-only listing must not be blocked solely for those unresolved ordering requirements. One clear cover photo can be sufficient; no universal four-photo or gift-occasion requirement returns. Additional evidence/views may be requested for an identifiable concern, with a specific explanation.

Use existing approved category/safety/licence/expiry requirements where applicable. Do not invent a new legal category rule, translation requirement, certification guarantee or promotional claim. Optional irrelevant fields remain optional. A genuinely required item-specific fact is explained rather than silently turned into a hidden global validation requirement.

If the current public price is wrong, seller can immediately pause new orders and submit a corrected price for priority review. If information is unsafe or materially misleading, seller can stop the listing under their authorized action and flag it; authorized staff with unpublish/availability authority can withdraw it promptly with a recorded reason and affected scope. Do not leave unsafe live claims merely because an ordinary revision is pending.

Urgent withdrawal/pausing is distinct from revision approval, account suspension, cancellation and refund. Preserve evidence and existing orders; route any affected commitments to Orders & customer care with their own decisions. Customer-facing availability stays factual and omits private moderation reasons.

Publishing a corrected revision does not automatically lift an unrelated staff/seller hold. A staff withdrawal needs an explicit authorized restoration after its reason and current checks are resolved. A seller's own pause can be resumed only under section 3. No need to create a duplicate listing or repeat seller registration just to correct a field.

## 7. Ownership, target and notifications

Approved target: first review of a complete published-product revision, including a price-only request, within **1 business day**. This is a first-action target, not guaranteed approval or publication. Start from explicit submission of the complete candidate; notes, assignment and stock updates do not reset its age. Replacements preserve the original case's age/history while showing the new version submission time. Normal new-product review staffing/targets remain separately tracked where not already agreed.

Price-error requests affecting an existing live listing and safety/misleading-content reports enter the priority queue immediately. Seller pause does not wait for staff. Assign an owner/backup and visible next-update time; overdue ordinary review creates one Super Admin task. Do not automatically approve/publish because a deadline passed. Named hours/holidays, departmental coverage and urgent queue ownership are D5 mapping before implementation.

Notify the seller on saved submission, requested correction, approval-only, actual publication, rejection, withdrawal/restoration and unresolved failure requiring action. Notify authorized review staff once on the actionable revision. Links point to the exact permitted revision and the shared bell/inbox state. A read notification is not approval.

Suppress duplicate and obsolete reminders when the candidate is superseded, withdrawn, resolved or already published. Approval-only cannot send Your changes are live. Do not send general customer email for every product edit or imply a new version changes old order promises. Any affected-order communication belongs to its authorized customer-care event. No notification or job is enabled during planning.

## 8. Later implementation and acceptance boundaries

Before later rollout, inventory current public products, unpublished edits, media references, review requests and live stock/pauses without mutation. Preserve actual published history and distinguish it from proposed values. Do not manufacture an approved version from an uncertain mixed live/draft record; assign a scoped reconciliation task. Existing source which edits the live row needs a safe version/publication path before this design can be called implemented.

Verify with fictional products: one cover/zero occasions; every field classification including public Seller SKU; price increase/decrease/reference-price removal; no arbitrary threshold bypass; price-only submission with irrelevant fields absent; wrong price plus immediate pause; multiple edits/withdrawal/publication races; stock changes during review; media privacy and referenced-file retention; a changed underlying product identity; stale carts; committed COD/manual-bank order prices and old-rate refunds; fixed-supply contract isolation; rejected/pending revisions retaining safe public content; unsafe current listing withdrawal; exact product permissions and owner conflicts; failed publication versus approval-only messages; held seller/terms/bank scenarios; and deduplicated notifications.

No application code, production data, actual product changes or tests are run to record this approval. Use controlled local fixtures, captured email and simulated financial flows when work resumes; retain canonical launcher/data safeguards and the deployment hold.

## 9. Decision status

- **Approved D2:** the field matrix; admin-reviewed selling/reference prices; immediate authorized stock/pause/resume actions; frozen candidate and retained public version; explicit urgent withdrawal/restoration; publication-quality mapping; and first published-product revision review within 1 business day.
- **Settled:** D1 Approve & publish with both permissions; one clear cover and optional gift occasions; approved last-public-version direction; publication/orderability separation; D7 manual payments/targets with the latest finance amendment; D4/D13/D15 financial rules as amended; historical fees/benefits/order values. No seven-day product cooldown is introduced.
- **Also approved:** D3 [approved public-profile and cooldown rules](2026-10-31-public-profile-changes-cooldown.md) and first routine profile review within 1 business day. The [approved Team design](2026-10-31-team-business-policies.md) also settles D5/D14 operating rules and first complete new-product review within one service business day. **Separate:** actual account/provider/calendar mapping, remaining order/customer-care capability mapping and implementation/verification of the now-approved D10 screens and all-version scope. D2/D3 policy approval does not complete those mappings or implementation.
- **Hold:** all implementation, product/financial actions, scheduling/sending, data changes and deployment remain on hold until planning is complete and the user explicitly resumes implementation.
