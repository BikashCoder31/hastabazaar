# Seller Center — dashboard and workflow plan

Status: planning only. On 30 October 2026 the user requested a detailed seller dashboard for profile, documents, products, orders and bank details in one place, following the agreed two-workspace approach. Implementation stays paused until planning is complete and the user resumes it. This document describes the proposed interface; it does not claim that the features are built or enabled.

Subsequent [D22 optional-entry/support direction](2026-10-31-optional-product-intake-support.md) applies to Products: all supported details remain discoverable, incomplete drafts can reach review/assistance, preview explains missing publication information, and linked support can help without private cost access. Super Admin receives email plus dashboard/bell for operational notices. Earlier complete-intake assumptions yield to this amendment; no incomplete listing is automatically published.

Related documents: [Working plan](../plans/2026-10-30-seller-order-response.md) and [Super Admin Seller Management](2026-10-30-seller-management-workspace.md). Both workspaces use the same seller, review, order and financial records. Seller-facing views exclude internal staff notes and other parties' private evidence.

The [final paired seller/customer walkthrough](2026-10-31-seller-customer-screen-walkthrough.md) now presents this dashboard and customer screens together for layout/copy review. It carries forward approved rules, including D9 optional payout notes, while leaving implementation on hold. The walkthrough is a proposal, not a live-site audit or additional business-policy approval.

## 1. Purpose, scope and decisions carried forward

Make the seller's next action easy to find, let them finish one task without navigating unrelated forms, and preserve their progress when they leave and return. Use one Seller Center from a submitted application through active selling, with route- and state-appropriate actions. Workspace access is separate from permission to accept orders or receive payouts.

The user has agreed the two-workspace structure and the areas to consolidate. Layout, labels and workflow defaults below are proposals, not a completed design approval. A unified home with focused sections is the selected direction. A single long form would obscure daily orders and product work; separate disconnected portals would repeat the current navigation and status problems.

Preserve these earlier requirements:

- Simple registration can be submitted with missing details and completed later. Bank details, public maker profile and product listing belong in the dashboard. Do not restore the best-time-to-contact field or put “optional” beside every registration label. Later action requirements must be explained at the action they affect, not retroactively block initial registration.
- Phone country defaults to Nepal, with the accepted ten-digit phone-entry rule and no SMS verification requirement for registration. Country-specific validation outside the agreed rule needs an explicit later decision; do not describe a recorded number as verified.
- Use Citizenship number instead of Government ID details. Support copying pickup/return addresses and editing them from the dashboard.
- Preserve the seven-day public maker profile cooldown. Scope it clearly and do not extend it to stock updates, orders, drafts, registration corrections or bank-change requests.
- Verified documents remain locked until a reasoned change request is reviewed. A new document must be verified independently after replacement permission is granted.
- Sellers can prepare and submit eligible products for admin review before commercial activation. Approved/published Managed Maker products can be visible while ordering remains blocked until the required checks pass. Review, publication and order eligibility are separate states.
- The company currently has only a bank account. Plan manual payment verification; QR and payment gateway integration are deferred. Sellers cannot confirm company customer receipts or operate the company bank account.

## 2. Shared layout and navigation

The header shows shop name, seller reference, current account, language choice, notifications, help and a contextual View public shop or Preview shop link. Keep account security and switching to the customer account in the account menu. A public link should not lead to a missing page when a shop is not public yet.

The [header notification bell](../plans/2026-10-30-seller-order-response.md#header-notification-bell--approved-quick-access-view), approved on 30 October 2026, adds a separate recent-alert panel with an unread badge and direct links to the exact record, section or correction field. It shares notification records/read state with the full inbox, provides View all, preserves unsaved form input and remains accessible to applicants for their permitted tasks. Opening the menu does not clear unread items; reading an alert does not finish the task. The behavior is approved for the plan; implementation remains on hold until planning is complete and the user asks to begin.

Desktop uses a stable sidebar and a focused content area. Proposed mobile navigation uses Home, Products, Orders and More; More opens every remaining section with visible pending counts. The Home action list links directly to urgent documents and payout tasks so these are not hidden behind navigation. Preserve filters, scroll position and draft state when returning from a detail view.

| Section | Main contents and primary actions |
|---|---|
| Home | Next actions, readiness, recent orders, product-review updates and earnings summary |
| Shop & profile | Public maker profile, customer-facing contact details, locations, preview and customer reviews |
| Registration & documents | Private registration, citizenship/PAN evidence, agreements, verification and correction requests |
| Products & stock | Drafts, product editor, review status, published listings, inventory and product performance |
| Orders & delivery | Seller's order portions, preparation, shipping, tracking, returns and complaints |
| Earnings & bank | Earnings breakdown, own receiving account, bank review, payout requests and payment history |
| Requests & help | Change requests, admin messages, notification inbox, contextual guides and seller-visible history |

Each section has a short summary and related subsections, rather than one page containing every form. Avoid duplicate edit controls for the same field. Support old bookmarked URLs and notification links by routing them to the corresponding record and section.

## 3. Home: what needs attention now

Put a compact Action needed list first. Proposed priority: orders the seller can act on and urgent cases, requested corrections, products needing changes, then incomplete setup. Show a small number of top tasks with View all; do not confuse an empty queue with a failed load.

Each task shows a plain-language description, the affected item, who must act next, the latest update, any real deadline and one relevant button. Examples: “PAN document needs a clearer image — Replace document”; “Product changes requested — Review feedback”; “Order ready to prepare — Start packing”. Waiting on an admin is displayed as a review status, not as a seller task repeatedly demanding submission.

Show compact, independent summaries:

| Summary | Meaning |
|---|---|
| Registration | Missing details, under review, corrections requested or the actual approved stage |
| Documents | Which evidence is missing, awaiting review or verified, with direct links |
| Products | Draft, under-review, needs-changes and public counts |
| Accepting orders | Enabled or blocked, with the specific remaining checks and responsible party |
| Payouts | Available or blocked, with the reason; separate available earnings from pending earnings |

Do not use a single Active/Verified badge or a completion percentage that implies all permissions are granted. A readiness row owned by the company must say “Waiting for Hastabazaar” rather than asking the seller to repair company settings. Distinguish account restrictions from missing documents and commercial activation.

Quick actions include Add product, Continue saved draft, View orders and Complete requested details as applicable. Show a brief recent-activity list; keep full audit history in Requests & help. Operational totals should have a visible period and currency where relevant, and an unavailable state instead of a false zero.

## 4. Shop & profile

Split this section into Public profile, Contact & locations and Customer reviews. Mark the visibility of information with a short section-level explanation: public shop information versus private operational information.

The public profile editor includes the supported shop/maker name, story, craft details, images and social links, with a preview of the customer-facing result. Keep private legal identity separate from the public trading name. Show the effective current version, any unsent draft and any version pending review distinctly.

Display the exact next normal submission date/time in Nepal time. The user approved D3 [approved public-profile and cooldown rules](2026-10-31-public-profile-changes-cooldown.md) on 31 October 2026: presentation review, 168 hours from actual normal public-version publication, drafts/no-ops/approval-only not starting the clock, immediate support updates, separate operational/document actions and scoped Super Admin corrections preserving the normal deadline. Super Admin final publication and first routine profile review within 1 business day are also approved. Approve only requires a later explicit Publish action. Named coverage and implementation remain outstanding; current direct-save behavior is unchanged during the hold.

Contact & locations contains public support details and separate private operating, pickup and return addresses. “Use operating address for pickup” and “Use pickup address for returns” copy a visible address after an explicit choice; allow independent editing afterwards. Do not silently overwrite an independently edited address. Later address changes affect new operations; an existing order's pickup/return record changes only through its explicit operational correction process.

Customer reviews retain the existing review/reply workflow, associated product and any applicable reply moderation rules. Keep this accessible without adding another top-level workspace. Profile and location changes requiring review use the shared request queue and show the current approved values until accepted.

## 5. Registration & documents

Use compact cards for Registration details, Identity & PAN, Evidence documents and Agreements. For incomplete registration, show which information is still needed for review or later operations and let the seller save progress without completing unrelated sections. Blank optional fields must not cause hidden submission failures; supplied invalid values get a clear field-specific explanation.

An unreviewed field can be completed when permitted. A verified field shows its recorded value and Request a change rather than an unusable edit form or a blanket “Contact support” message. Lock only the affected verified fields/evidence, leaving unrelated allowed edits available.

Each document card shows type, filename/preview, submitted date, current status, seller-visible reviewer feedback and the next permitted action. Proposed labels: Not added, Draft upload, Awaiting review, Changes requested, Verified and Replacement awaiting review. Show that only a successfully uploaded file is saved; do not imply that a selected local file survived a page reload.

Verified-document change flow:

1. Select the exact document/related fields, enter a meaningful reason and submit Request permission to replace.
2. Show Request awaiting review and the reference. Keep the verified version unchanged.
3. On permission approval, unlock only the approved replacement scope and offer Upload replacement. Approval of permission does not verify the replacement.
4. Submit the replacement for fresh verification. Show old verified evidence and the pending replacement clearly; preserve history and display the order/payout restrictions under the approved D4/D13 policy, including holds from the original protected-change request.
5. On verification, update the current version and mark the request completed. On rejection or correction, show the reason and next step without deleting previous decisions.

Bank change requests follow the corresponding restricted workflow in Earnings & bank. Avoid duplicate requests for the same open change and link to the existing request. The seller never sees private staff notes or another person's verification evidence.

Agreements use a concise title and expandable full text with explicit acceptance. Show the accepted version/date and a new-acceptance request only when needed. Draft restore, autosave and a document upload must not silently accept terms or carry a prior checkbox into a new agreement version.

## 6. Products & stock

The [approved D19 price/public-preview design](2026-10-31-seller-price-public-preview.md) adds fee/remaining-amount guidance beside Selling price, an optional private cost/target-profit helper, clear public/private detail groups and a customer card/detail preview in the existing Review step. These details are approved and belong to this version under the complete-scope instruction. D20 detailed pricing/discount rules are approved, with the latest correction: no automatic 30-day removal and no compulsory price update. The [D21 category/variant design](2026-10-31-retail-categories-product-variants.md) now includes new-only retail/resale and real selectable offers within this same Seller Center; its detailed category/variant rules and expandable categories/subcategories are now approved. Private costs are not required for product submission or exposed in ordinary product review/public pages.

Detailed submission, review, publication and revision planning is recorded in the approved [Products & storefront](2026-10-30-products-storefront-workspace.md). On 30 October 2026 the user approved that workspace and explicit Approve & publish with both permissions, building on Overview and Sellers. One clear cover photo and optional gift occasions remain approved. D2 detailed edit/price classifications, urgent handling and first published-product revision review within 1 business day are now approved too; Team policy now also approves first complete new-product review within one service business day; actual named coverage remains to be mapped. Implementation remains on hold.

The list provides search and filters for Draft, Under review, Changes requested, Approved awaiting publication, Public and Archived, mapped to the real stored states. Each item shows an image, name, price/currency, stock, review/publication status, orderability and the next action. Stock and sales summaries link back to their products rather than becoming a separate dashboard to maintain.

Use a short, resumable editor with proposed steps: Product basics → Photos & details → Price, stock & fulfillment → Preview & submit. Support the existing categories, materials, options and relevant fulfillment fields; do not introduce unsupported product types merely to fill a step. Offer clear examples and image guidance. Sellers can revisit any step, and the final check links directly to missing or invalid information.

Save draft progress automatically with a visible status. Initial registration being incomplete must not force re-entry of the product; explain the actual action-specific requirements. Required product-review information is different from optional initial registration fields. Upload progress, failures, image reordering and retry must preserve completed work.

Approved review-intake policy, 30 October 2026: accept one clear cover photo and make gift occasions optional when submitting products for admin review. Additional photos may be added; moderators can request more views when needed. Keep at least one usable cover image after changes to the review submission, and allow no occasion selection without inventing tags. Apply the policy consistently to new submissions and corrections/resubmissions when implementation resumes. This is a planned change; current runtime requirements remain unchanged during the implementation hold.

Submitting shows a product reference, Submitted for review status and what happens next. Show admin feedback beside the affected field or image where available. Correct and resubmit the same product/version chain instead of creating duplicate listings. Uncertain network outcomes must be recoverable by checking the saved submission before starting a new attempt.

Admin approval and publication produce a working public listing when browse requirements are met. The user approved one deliberate Approve & publish action for staff holding both permissions, with Approve only for deliberate holds or review-only authority. If publication is pending, say so explicitly and show the next responsible action. Never announce “Live” solely because an approval succeeded.

A public Managed Maker listing may show “Visible to customers; ordering is not enabled yet” with a readiness link. Seller-side Add product/Submit controls must not depend on payout readiness when the applicable pre-activation submission policy permits them. Audit all routes so the account access, submission, public browsing and purchase checks do not contradict one another.

Approved direction for edits to a public product: material content changes become a reviewable revision while the last approved public version remains intact; ordinary permitted inventory updates use the existing stock rules. D2 field/price classification and urgent correction/restoration rules are approved; D5 names the actual authorized owners and coverage. Stock must account for reservations and concurrent updates. Archive stops new availability according to policy while preserving active orders and history.

The [approved cancellation/return rules and review timings](2026-10-31-cancellation-return-rules.md) settle scope/cutoffs, custom/prepaid orders, Stop work/dispatch instructions, case evidence, return carriage and timings. When implementation resumes, the Seller Center must use the same shared case, actual hold and due times as Orders and Finance; sellers provide facts but do not decide their own refunds. Named coverage and implementation remain outstanding; implementation remains on hold.

## 7. Orders & delivery

The approved [Orders & customer care plan](2026-10-30-orders-customer-care-workspace.md) brings seller response, delays, cancellation review, returns/replacements, refund handoffs and complaints into one order/case history. The 6-hour reminder and 12-hour escalation, 2-hour staff follow-up, 24-hour Super Admin checkpoint, 24-hour first case review and 48-hour clarification target with a 24-hour reminder are approved. Cancellation/return cutoffs and policy are approved in D6/D11/D12; actual source/carrier mapping and named coverage remain. Implementation remains on hold.

Show only the seller's order portions with order reference, items, quantities, payment/readiness summary, preparation state, promised timing and the available next action. Filters cover action needed, preparing, ready for pickup, dispatched, completed, cancelled and cases, using the actual fulfillment model. Payment, fulfillment and refund status remain separate.

An order detail view brings together items/options, relevant delivery information, timestamps, packing guidance, shipment/tracking and staff/customer messages the seller is authorized to see. Do not expose other sellers' items or company bank evidence. Show only the customer information needed for the seller's assigned fulfillment responsibilities.

Actions follow the actual sequence: Start packing, Mark ready for pickup, request/inspect shipping and respond to a case when allowed. Do not let a seller declare delivery, payment verification or a refund complete unless the underlying role and workflow authorize it. Previously completed actions and restricted orders have an explanation, not a generic dead button.

The agreed new-order email and 6-hour reminder accompany in-app tasks. After 12 hours without the required response, alert admin; notify the customer using the approved factual delay/preparation-update direction. Both deadlines run in elapsed hours from the same actionable time, not sequential waiting periods, with Nepal time display. Timers retain unanswered eligible item scope within each seller portion. Manual bank-payment review or an applicable COD hold must not create premature reminders; scoped later holds preserve elapsed history. Staff coverage and supported next-update commitments still need mapping. Temporary email failures retry automatically; sellers must not need to trigger mail processing.

Provide the approved Report a delay / Cannot fulfill direction: seller records affected items, reason and proposed timing, creating a staff task. It does not silently cancel an order, issue a refund or rewrite the customer promise. Returns & complaints link to the original order, with requested evidence, approved target durations and the next responsible party. Use the approved elapsed return/clarification clocks and Team continuous service calendar; map actual named coverage. Handle mixed item states explicitly rather than hiding every action when a portion is not uniform.

## 8. Earnings & bank

The [Finance & payments design](2026-10-30-finance-payments-workspace.md) and its claim/payout/refund review and reconciliation targets were approved on 31 October 2026. It connects company receipts, original-route earnings, refunds, payout review, bank changes and reconciliation. D4 bank/identity and D13 payout rules are approved under the [approved single-Super-Admin finance amendment](2026-10-31-single-super-admin-finance-approval.md); D15 recovery/funding and its follow-up targets are also approved. The [D7 manual-payment rules and targets](2026-10-31-manual-payment-rules.md) are now approved; D9 standard payout purpose with an optional note is now approved. The approved [Fees, programs & promotions workspace](2026-10-31-fees-programs-promotions-workspace.md) keeps fees/benefits distinct; its [detailed publication and combination rules](2026-10-31-fee-publication-schedules-combinations.md) are also approved. Implementation remains on hold.

Show the seller's own financial position with clearly defined totals: pending earnings, amounts on hold, available for payout, requested/processing and paid. Explain the recorded deductions, adjustments and per-order amounts in expandable detail. Use actual historical fees/terms; later settings must not rewrite past transactions. Do not present total sales or a customer receipt as immediately available cash.

The Bank details card contains beneficiary name, bank, branch, masked account number, private evidence and review status. The authenticated seller can inspect their own submitted information securely; eligible Super Admins compare it with reviewed registration evidence. A name match alone does not verify ownership, and the company's Nabil account must never be inserted as this seller's beneficiary.

Allow initial bank submission after registration. After verification, show the reviewed details with Request a bank change. Require a reason, preserve the current verified version and use the shared reviewed-change workflow for replacement details/evidence. No new account is eligible for payouts until verified. The approved [bank/identity and payout rules](2026-10-31-bank-identity-changes-payout-approval.md) require immediate unpaid-payout holds, continued orders only with valid current readiness, material-identity new-order holds and separate sent/uncertain reconciliation. It retains the seller's request and existing-order duties, with payout preparation/approval permitted by the same eligible Super Admin under the finance amendment. These rules and first change triage within 1 business day are approved; implementation and named calendar/coverage mapping remain outstanding.

The approved Request available payout action shows the server-calculated eligible amount, verified masked beneficiary and any blocking reason. Record the standard purpose automatically and offer a separate Note field that can be left blank; no mandatory written explanation for an ordinary request. Submission creates a request; staff preparation and Super Admin approval are separate from actual transfer completion. The history shows the recorded status, date, amount, safe transfer reference and seller-visible reason. Initial transfers are performed outside the website and reconciled manually; show Paid only after the appropriate bank confirmation is recorded.

For customer manual bank payments, the seller sees an order's Awaiting payment / Payment under review / Confirmed result as relevant. They cannot mark a company receipt paid, inspect its private bank statement or change the company receiving account. QR and payment gateway work stays outside this phase.

### Selling-fee card and scheduled changes

The approved [Fees, programs & promotions workspace](2026-10-31-fees-programs-promotions-workspace.md) carries forward this transition and separates seller fees from customer marketplace-fee relief, merchandise promos and shopping credit. The [approved replacement/consent rules](2026-10-31-fee-publication-schedules-combinations.md#3-replacing-an-announced-commission-change) distinguishes current and upcoming obligations and preserves historical acceptance. Planning changes no actual rate, start date or acceptance.

Follow the [agreed commission transition and wording policy](../plans/2026-10-30-seller-order-response.md#commission-transition-and-wording--agreed-policy). Place one Your selling fees card here and link to it from Home. With no upcoming published change, show only the latest effective fee. During the 15-day notice period, show the current fee and scheduled new 12% with the exact shared effective date/time, any acceptance action and the calculation basis. Sellers joining or accepting during the notice period accept the forthcoming rate for that common date; acceptance neither starts it early nor delays it by another 15 days. This discussion has not verified the live schedule or changed any application behavior.

Replace competing company/seller percentage pairs with a clearly labelled fee and an expandable rupee example: on an eligible NPR 1,000 amount at 12%, the fee is NPR 120 and the remainder before other adjustments is NPR 880. From the effective date, all sellers covered by the policy, including earlier 9% sellers, use the new rate for new orders. Existing orders show Fee applied to this order with their original rate even if settled later. Preserve previous agreements in history; an older acceptance must not indefinitely retain 9% on new orders. The user has agreed that sellers missing acceptance at the effective time pause receiving new orders until they accept. Distinguish sale-linked Managed Maker terms, independent seller commission, fixed supplier prices and customer service fees.

### Updated terms: notification, order hold and recovery

Keep dashboard access and existing-order fulfillment available during this specific hold, along with other permitted shop/profile/document/product-draft/support actions. It does not independently freeze historical payouts, cancel existing orders or suspend the whole seller account. Display “New orders are paused — review and accept the updated selling terms” prominently on Home and in Your selling fees, with a direct Review and accept action, the applicable rate and exact effective date. Reading or dismissing a notification cannot hide the remaining required action.

Notify the seller by email and in the dashboard during the notice period, when missing acceptance causes the hold, and when acceptance resolves it. Early acceptance shows the shared future start date without activating the fee early. Email links require the seller to open and explicitly accept the terms; visiting the link is not acceptance. The [approved reminder schedule](../plans/2026-10-30-seller-order-response.md#approved-reminder-schedule-and-follow-up-deadlines), approved by the user on 30 October 2026, specifies the initial notice at publication, reminders 7/3/1 days before the start, a hold-start notice, and help reminders 3/7 days afterwards. Stop routine seller reminder emails after day 7 while keeping the dashboard action and staff assistance available. Acceptance stops reminders immediately; late joiners do not receive a backlog or a fresh rate-change grace period. The schedule is approved for the work plan only; implementation remains on hold until planning is complete and the user resumes work.

Show a request/help path for difficulty reading or accepting the terms; the same seller appears in Super Admin's follow-up queue. A successful acceptance records the exact policy/version and resolves only the terms-related hold. Show “Updated terms accepted” and whether new orders have resumed; if another activation or account blocker remains, identify it separately. Preserve input and safely retry a failed/lost response. No additional admin approval is needed to clear this hold once valid seller acceptance is recorded. Staff guidance alone must not substitute for seller consent.

## 9. Requests, help and notifications

Use the requested [automatic email delivery workflow](2026-10-30-email-delivery-automation.md) for timely seller updates and reminders without staff batch clicks. It complements the approved bell and inbox, which remain usable during email problems. Reading an in-app notification does not prove email receipt or finish its task. The relevant recipient, event, deadline and recovery behavior must be verified when implementation resumes; no mail automation is enabled during planning.

Provide one seller inbox for registration/document changes, bank changes, product corrections, order cases and support. It references the same canonical tasks shown to staff. Each request shows type, affected record, submitted date, status, seller-visible response, next responsible party and a link to continue the exact action.

Distinguish review decisions from notification read status. Reading a message does not complete a correction; dismissing a banner does not remove the underlying task. Deduplicate repeated events and retain useful history. Do not promise a review deadline until the operating policy supports it.

Offer contextual Nepali/English help and concise instructions next to difficult steps. Include the planned Nepali registration guide and product guidance when actually available; do not display an empty/broken video player or mark the video complete. A seller can raise a support request with the affected record and readable error reference, without sharing passwords or exposing private evidence in email.

Email notifications link to the relevant protected record. The in-app inbox remains usable when mail delivery fails. Seller-visible history includes their submissions, agreement acceptance, review outcomes, profile changes and payout events, without internal disciplinary notes or staff-only evidence. Account security remains accessible from the common account menu.

## 10. Saving, errors and accessibility

Use the approved [Form Management reliability foundation](2026-10-30-form-management-reliability.md): core tasks retain feature-owned validation and should not depend unnecessarily on editable extra-question metadata. Draft/publication compatibility and precise recovery must be planned together; merely hiding the generic unavailable message does not fix the underlying failure. The approach was approved on 30 October 2026; implementation remains on hold until planning is complete and the user asks to begin.

The approved [field inventory](2026-10-30-form-management-field-inventory.md) records what to retain, consolidate, show conditionally or move out of ordinary editing across registration, shop, products, orders and bank details. One clear cover photo and optional gift occasions at product review submission are explicitly approved. D9 now approves a standard payout purpose with an optional note; the old mandatory-note requirement must not survive in a hidden validator. This approval updates the plan only; current runtime behavior remains unchanged and implementation stays on hold.

- Save allowed drafts to the authenticated account with Saving, Saved at [time], Unsaved changes and Save failed states. Restore across navigation and sign-in when successfully saved. Keep a manual Save progress action for reassurance, but ordinary progress does not depend on pressing it.
- Autosave is a draft operation, never an agreement acceptance, product submission/publication, review decision, payout request or financial/order-state change. Sensitive drafts/uploads need protected storage and retention, not unbounded browser storage. Existing stored progress must survive the redesign.
- Preserve answers and successfully uploaded file references on validation errors, refresh, interruption and recoverable conflicts. On failure, do not claim the data is saved; show Retry and protect unsaved work when leaving. Session expiry requires reauthentication without disclosing drafts to another account.
- For changed form definitions or concurrent edits, keep the seller's input, show the affected fields/current version and resolve the conflict before submission. Do not repeatedly force a complete refresh or restart. Do not silently overwrite a newer approved value.
- If a required form configuration is unavailable, retain saved work, show a useful temporary-unavailability message and retry/help path, and create an operational signal for staff. Do not replace the form with unsafe defaults or report a successful submit. Other independently available sections remain usable.
- Use field-level validation with an error summary linking to the fields; keep successful sections intact. Show clear upload limits supported by the implementation, actionable retry, empty states and distinct loading/unavailable states. No blanket required-field changes should undo simple registration.
- Design for small screens, keyboard navigation, readable labels, visible focus, large touch targets and status text beyond color. Preserve uploaded image orientation/preview clarity. Display relevant dates consistently in Nepal time. Language changes must not reset forms or change recorded agreement versions.

## 11. Access, existing routes and implementation mapping

The submitted applicant, Managed Maker and Registered Seller use the same navigation. Render their actual permissions and route-specific tasks; no blanket approved-seller gate should prevent an applicant reaching the fields needed to become approved. Rejected/restricted accounts retain only the permitted correction, support, history and existing-obligation access. The exact restriction behavior must honor existing policy, not grant unrestricted editing.

Before implementation, reconcile all capability checks in layout/auth, participation helpers, submissions, publication, public catalog, ordering and payouts. The local participation helper still contains a commercial-activation-based publication flag; it must be checked against the separately agreed browse-before-ordering policy, not treated as the final source for every new label.

| Existing local surface | Planned home |
|---|---|
| `/seller`, action overview and managed-program panels | Home with registration/readiness summaries; detailed agreements in Registration & documents |
| `/seller/profile`, public-profile forms and registration-intake/profile updates | Shop & profile for public/operating information; Registration & documents for private reviewed details |
| `/seller/products`, new/edit pages and inventory editor | Products & stock with shared resumable editor and review feedback |
| `/seller/orders`, `/seller/shipping`, `/seller/cases` | Orders & delivery with shipment, return and complaint subsections |
| `/seller/finance`, bank and payout forms | Earnings & bank |
| `/seller/reviews`, `/seller/analytics` | Customer reviews under Shop & profile; relevant sales/stock summaries under Home, Products and Earnings |
| `/seller/notifications`, `/seller/form-history` | Requests & help with record-specific history links |
| `/security` and customer dashboard links | Shared account menu, retaining the current account/session boundaries |

This mapping is based on local source inspection, not a claim that the redesigned flows exist in production. Preserve identifiers, historical records, saved drafts, existing URLs and permission checks. Do not duplicate a seller or application during navigation changes. No migration or data repair is authorized by this plan.

## 12. Acceptance walkthroughs for later verification

| Scenario | Required outcome |
|---|---|
| Incomplete new application | Seller can enter the workspace, identify remaining details, save progress and prepare eligible products without completing bank details first |
| Return after leaving halfway | Saved fields and completed uploads restore; unsaved/failed work is described honestly; no duplicate application |
| Verified identity needs correction | Specific reasoned request, scoped permission, new upload and independent verification; prior evidence/history retained |
| Seven-day profile cooldown | Next edit time visible; draft autosave does not restart it; unrelated bank/order/stock actions remain available |
| Pickup and return address copying | Copied values are visible and editable; independent edits and historical order destinations are preserved |
| Product submission and corrections | One resumable draft/submission, field-specific feedback, safe resubmission and no duplicate listing on retry |
| Product approved, commercial checks pending | Public visibility after the required publication step; ordering unavailable with accurate explanation |
| Seller commercially ready | Eligible published in-stock products can be ordered only after all authoritative checks pass |
| Manual payment unresolved | Seller sees payment readiness; cannot confirm bank payment or prematurely progress a held order |
| Commission starts without acceptance | New orders blocked, clear email/dashboard prompts, existing-order work and dashboard retained; Super Admin has an actionable follow-up |
| Seller accepts after the commission start | Exact acceptance recorded once, only the terms hold cleared, stale reminders stopped and follow-up resolved; other blockers remain visible |
| Multi-seller order or mixed item states | Seller sees and acts on only their own permitted items; timers and next steps remain accurate |
| No response / delay / cancellation | Planned 6/12-hour handling respects current state; customer update and escalation do not duplicate or falsely persist |
| Verified bank change / payout request | Proposed beneficiary never used before verification; payout holds follow the agreed policy; request/approval does not display Paid |
| Form outage, version conflict or session expiry | Recoverable explanation, retained permitted draft data, safe retry and no bypass of server validation |
| Restricted seller, unrelated seller or buyer | Appropriate support/history access; no cross-account records, private bank evidence or unauthorized operations |
| Mobile, keyboard and Nepali/English use | All primary tasks reachable; meaningful focus/errors/status labels; language switching preserves progress |

Use fictional records and simulated money movement for later verification. Plan completion and implementation verification are separate milestones; no tests or real financial actions are performed by writing this document.

## 13. Decisions still to finish before implementation

1. Review navigation labels, Home priorities and the [paired seller/customer walkthrough](2026-10-31-seller-customer-screen-walkthrough.md); keep existing tasks reachable.
2. Carry forward the [approved public-profile and cooldown rules](2026-10-31-public-profile-changes-cooldown.md) and one-business-day first routine review target. Field coverage, timing, authority, drafts, urgent corrections and approval-only handling are settled. D5 names actual staff/coverage; implementation remains on hold.
3. Carry forward D1 Approve & publish and the [approved D2 published-product edit rules](2026-10-31-published-product-edit-rules.md), including first revision review within 1 business day. Named coverage and implementation remain outstanding.
4. Name review owners/backups and staff coverage. Preserve approved reminder durations, elapsed order clocks and delivery rules; apply the approved temporary continuous service calendar while mapping actual provider availability and preserving elapsed return/clarification clocks without adding language/public-content policy.
5. Carry forward approved D4/D13 bank/identity/payout rules and first change triage within 1 business day, plus the approved [D15 refund/recovery workflow](2026-10-31-refunds-after-payout-recovery.md) and follow-up targets. Include its itemized seller statement, earnings applications, repayments and disputes in the later walkthrough and verification. Named staffing/calendar mapping remains; no bank settlement promise or implementation is implied.
6. Carry forward [approved D7 manual-payment rules and targets](2026-10-31-manual-payment-rules.md), including actual fulfillment release and earned-versus-funded balances, under the single-Super-Admin finance amendment. Customer payment and seller payout remain distinct; implementation stays on hold.

The user has requested continued planning, not implementation. Explicitly settled choices remain approved; D15, D7 and their targets are settled under the latest single-Super-Admin finance amendment. D3 profile/cooldown rules and one-business-day routine review are also approved. D9 standard payout purpose with an optional note is now approved too. All active work is required in this version and D19 is approved. The paired screen walkthrough is now approved on 1 November 2026; D20 pricing rules are approved with the latest no-expiry correction; actual operational mapping remains preparation work. Settled rules are not reopened.
