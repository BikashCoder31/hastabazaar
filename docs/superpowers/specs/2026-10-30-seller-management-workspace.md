# Seller Management workspace — screen and workflow plan

Status: Sellers section approved by the user on 30 October 2026; planning only. Approval covers the directory and seller workspace, document verification, reasoned scoped change requests, activation checklist and shared review/notification workflow described here. Subsequent D4/D13 bank/identity effects and one-business-day first change triage are approved, as are D3 profile rules and its target. Team & business policies and its operating rules are now approved; actual named coverage and separately identified System/release mapping remain open. Implementation remains on hold until planning is complete and the user explicitly resumes work. Existing partial document-review implementation remains at its checkpoint. No real seller record is verified, changed or activated by this approval.

Latest [D22 oversight requirement](2026-10-31-optional-product-intake-support.md) sends Super Admin an email and shared dashboard/bell notice for every submitted seller application and all other operational notifications, including product/support work, alongside assigned staff. Use the existing canonical event and safe authorized links; no duplicate role copies or private evidence in mail.

Related working plan: [Seller operations and notifications](../plans/2026-10-30-seller-order-response.md). Related seller-side proposal: [Seller Center dashboard](2026-10-30-seller-center-workspace.md). Related unfinished implementation: [Live maker activation](../plans/2026-10-30-live-maker-activation.md). These screens must expose the actual readiness rules; a redesign must not bypass those rules.

Subsequent D21 scope now includes new retail/resale alongside handmade products in this version. The [category/variant design](2026-10-31-retail-categories-product-variants.md) keeps seller commercial route distinct from category, allows linked category-eligibility work without duplicate applications, and preserves separate product publication/order/payout checks. New-only condition, detailed category/variant rules and expandable categories/subcategories are approved on 1 November 2026.

The user approved the [full Super Admin Overview and shared review workflow](2026-10-30-super-admin-overview-review.md) on 30 October 2026. Seller review uses that shared queue, evidence/decision layout and canonical task history; this seller-specific workspace is its focused record view. The language/public-content policy decision is excluded from this planning phase, with existing product-specific content behavior preserved. Implementation remains on hold.

## Purpose and organizing principle

Give Super Admin a single entry point to find sellers, see outstanding work, review evidence, manage requests and inspect operations. Departmental staff use the relevant parts of this workspace under their existing permissions. Keep one shared seller record and canonical work items; the same product or payout may also appear in a global queue without creating a second review or separate decision history.

Recommend a work queue and seller directory leading into a full-width seller workspace. A full seller record is easier to read than squeezing identity evidence, finances and orders into a narrow drawer. Preserve list filters, selected task and scroll position when returning. Deep links from email and notifications open the precise seller and task, after authorization.

The [approved Team & business policies design](2026-10-31-team-business-policies.md) settles department permissions, eligible primary/backup ownership and temporary continuous full-time service clocks. Fixed hours are deferred and named coverage still needs mapping. Assignment never grants PAN/identity, bank, profile-publication or activation authority.

## 1. Seller Management landing screen

**Header:** title, search, notifications and last-updated indicator. Search by shop name, seller/application reference, owner name, email or phone. Keep private document and bank numbers out of broad search results.

The [header notification bell](../plans/2026-10-30-seller-order-response.md#header-notification-bell--approved-quick-access-view), approved on 30 October 2026, shows recent authorized work alerts and an unread badge, separately from the full notification page but using the same records/read state. Selecting an alert opens the precise seller/order/product and review tab or field; only eligible Super Admins can open private bank evidence. Counts, previews and actions obey current permissions/assignment, and reading does not approve or resolve work. Implementation remains on hold until planning is complete and the user asks to begin.

**Compact summary strip:** sellers awaiting review; document/change requests; products awaiting review; orders needing attention; bank/payout reviews. Each count opens its matching queue. Counts are permission-filtered, distinguish tasks from sellers, and show an unavailable state if data cannot load. One seller may have several tasks; do not present the sum as a unique seller count.

**Two primary views:** Needs attention (recommended default) and All sellers. Needs attention includes task type, seller, exact pending action, who must act, assigned reviewer, age/due state and status. All sellers includes shop/owner, route, registration stage, verification summary, order eligibility, pending-task count and last update. Offer filters for category, route, state, assignee/unassigned and date. Avoid an unreadably wide table; less frequent facts open inside the seller record.

**Priority proposal:** urgent restrictions, security/beneficiary concerns and overdue order response first, then overdue review work and oldest unassigned tasks. Only show Overdue when an agreed deadline actually exists. The revised approved order rules are a seller reminder after 6 hours and admin escalation after 12 hours, both from the same actionable time; review deadlines and repeated escalation policies are undecided. Queue ordering does not approve or cancel anything automatically.

**Actions:** open review, assign/reassign eligible staff, or open seller. Bulk actions may assist filtering and task assignment; identity verification, bank verification, selling activation and payouts remain explicit record-specific decisions. Send/request-information actions must show recipient and message before dispatch.

### 1.1 Directory and review queues

Recommend Needs attention as the default, with All sellers, Assigned to me and Waiting views. Filters cover application stage, document state, ordering readiness, route, owner and date. Preserve the distinction between one seller and several tasks belonging to that seller.

In All sellers, show shop name/reference and owner, application stage, a compact document summary, whether orders are enabled, pending task count, assigned staff and Open seller. Place phone/email and less-used facts in the opened record rather than an excessively wide table. In Needs attention, show one row per specific review task with its seller/reference, required action, owner, age/deadline and Open review. The same task must appear consistently in Overview and inside the seller record.

Search results and counts obey existing access rights. Broad results do not contain bank account numbers, citizenship/PAN values or document thumbnails. Display a meaningful unavailable state if data cannot load; do not show zero pending reviews after a failed request. A task due date comes from an agreed review policy, never from an invented default.

### 1.2 Identity and continuity

Keep the submitted application, seller profile and owning signed-in account linked by their authoritative identifiers. Show the account email and its actual verification state to authorized staff so mismatches can be investigated. Do not infer ownership or relink an account solely because a contact email/name resembles another record. Account corrections use the existing authorized recovery process.

Opening an applicant must lead to the same continuing record used after approval. Do not create another seller merely to grant dashboard access or repair navigation. Existing seller/application references and bookmarked links continue to resolve to the permitted current view.

## 2. Selected seller: persistent summary

Show shop name, seller reference, account owner, route (Managed Maker or Registered Seller), registration date, assigned reviewer and last update. Keep a Back to results control and, when entered from a queue, Next pending task. Distinguish private registration identity from public shop identity.

Display separate readiness summaries:

| Area | Display and next action |
|---|---|
| Application | Submitted, under review, corrections requested, approved for activation, or the applicable recorded stage |
| Documents | Required evidence reviewed/total, with the exact pending or rejected items |
| Products | Draft, review and public counts; open the relevant product list |
| Accepting orders | Enabled, pending activation, or blocked; give the specific reason and responsible party |
| Payouts | Eligible or blocked under current financial checks; explain verification, balance, holds or other conditions |
| Access restrictions | No restriction, suspended or disabled; separate this from commercial activation |

Use text and icons as well as color. A verified document is not a verified account, and an activated seller does not make every product orderable. Display timestamps/last checked state and refresh the authoritative status before decisions.

### 2.1 Persistent action checklist

Below the seller header, show a short checklist with the exact outstanding item, current result, responsible party and an action/link. Examples: Identity image needs correction → seller; Bank beneficiary review pending → eligible Super Admin; Commercial setup unavailable → platform operations; Updated terms need acceptance → seller. Group already-completed checks in an expandable area with their actual reviewer/time.

Recommend separate headings for Application, Evidence, Product visibility, Accepting orders and Payouts. Avoid a single completion percentage or Approve everything button. A recorded account restriction is shown separately with its scope. A no-restriction Active value must never be mistaken for completed commercial activation.

Applicant access, product submission, product publication, new-order eligibility and payout eligibility must be individually explained. Missing bank details must not stop permitted product preparation/review submission. Optional initial registration can remain incomplete until the relevant later action requires particular information; list that action-specific requirement rather than retrospectively rejecting the initial submission.

## 3. Sections within the seller workspace

| Section | Information and actions |
|---|---|
| Overview | Readiness, action-needed checklist, operational totals, pending requests and recent decisions |
| Registration & documents | Registration/tax/contact details, identity/PAN evidence, accepted agreements and document review |
| Shop & locations | Public profile preview, support details, pickup/return locations, relevant pending changes and profile cooldown. D3 field/review/timing detail and one-business-day first routine review are approved in the [public-profile supplement](2026-10-31-public-profile-changes-cooldown.md); no live behavior changes yet. |
| Products | Seller-scoped drafts, review queue, correction reasons, stock and publication controls |
| Orders & delivery | Seller's order portions, response timers, preparation/dispatch, delays, returns and complaints |
| Bank & payouts | Restricted bank evidence and beneficiary comparison, financial readiness, balances, payout requests and records |
| Requests & messages | Change requests, correction tasks, responsible staff, seller replies and notification delivery state |
| History | Filterable decisions and prior versions with actor/time/reason; separate seller-visible reasons from internal notes |

Group restriction controls and deletion preflight under a clearly labelled Account controls menu. Summarize restrictions on Overview. Explain effects on new orders and existing fulfillment, and retain the buyer-account distinction. A deletion preflight remains a check, not deletion.

The selected task opens its exact tab, evidence and correction fields. Keep a compact seller summary visible while staff switch sections. Products, orders, bank reviews and payout records are filtered links to their canonical workflows; they must not become independent copies inside Sellers. Staff see only sections/actions their role permits, including direct URLs and counts. Language requirements, public contact policy and public badge definitions are not redesigned here.

## 4. Document review workspace

Selecting Review opens the exact task within the seller workspace. On desktop, place submitted fields and relevant verified identity beside a private document viewer, with a decision area below or alongside. Show filename, document kind, submission date, version/current state, and reviewer/time for completed decisions. On small screens stack the same sections with a clear route back to the task.

Use Verify document, Request correction, and Reject document where the relevant workflow supports those meanings. Explain that rejecting a document does not itself reject the whole seller application. Keep technical status names out of seller copy. Require a meaningful reason; separate an internal note from a message the seller can see. Opening a document never verifies it.

Show a clear result after saving and retain decision history. If another person changes the evidence or makes a decision first, show the current outcome and retain the unsent note for review; do not silently apply it to a different version. Avoid generic stale-form errors that force the reviewer to repeat work.

### 4.1 Evidence cards and exact statuses

Each card shows document kind, filename/preview, submitted date, current version and status. A verified card includes reviewer/time and a link to the recorded decision. A pending replacement must appear separately from the previous verified version; a document must not inherit verification merely because it has the same filename or kind.

| Display state | Meaning and next step |
|---|---|
| Not submitted | No current evidence; show who needs to supply it if required for this route/action. |
| Awaiting review | Current submitted evidence is ready for an authorized reviewer. |
| Changes requested | Specific feedback identifies the missing/unclear detail and a permitted correction action. |
| Verified | A review decision exists for this exact evidence version and remains current. |
| Replacement awaiting review | A permitted replacement exists; display old/new versions and their separate states. |
| Needs recheck | A relevant underlying fact/evidence changed or a recorded verification was invalidated; show the responsible reviewer and affected readiness. |
| Rejected / superseded | Retained historical outcome and reason; never silently treat it as current verified evidence. |

Only show Not required when the existing route-specific policy actually establishes that result. Do not let an arbitrary checkbox waive PAN, identity, registration or other evidence requirements. Map the current requirements by route before implementation; this plan makes no new legal/tax determination.

### 4.2 Verification sequence

1. Open the exact seller and evidence task; confirm document identity/version and reviewer authority.
2. Compare the uploaded document with the applicable private registration fields. For PAN, compare the relevant name/number/type; for identity, compare the recorded holder and applicable identity details. Show available data rather than automatically asserting authenticity from a text match.
3. Record the actual review reference/evidence where applicable and a meaningful decision reason. Opening or downloading a document is not verification.
4. An independent authorized Super Admin selects Verify, Request correction or Reject for the current PAN/identity evidence. Bank verification stays in its separate restricted comparison workflow. Preserve existing access rules for other document types; assigning a task grants no new privilege.
5. Recheck current evidence, ownership, role and competing decisions on save. Prevent self-review and duplicate decisions; preserve notes when a conflict needs review.
6. Show the saved result, update the corresponding task/checklist and notify the seller automatically through the permitted channels. Do not mark unrelated documents or activation checks complete.

If a document cannot be loaded or the verification basis is insufficient, retain a truthful pending/correction outcome instead of recording Verified. Legacy records that only appear verified must be reconciled against actual evidence individually; no bulk conversion of existing sellers is implied.

## 5. Locked evidence and change requests

Verified evidence is read-only. A seller selects Request a change and supplies a specific reason. The task identifies the current document and any related fields; unrelated documents stay locked.

Proposed sequence, consistent with the agreed requirement: seller request -> independent Super Admin approves/rejects the requested scope -> seller submits the permitted replacement -> fresh evidence verification -> current record updated, prior version retained. Approving permission to replace a document must not mark the future replacement verified. Show separate statuses for Request awaiting review, Permission granted, Replacement awaiting verification, Completed and Rejected.

For a proposed change to registration values, show current verified values and proposed values with the differences emphasized. Preserve the verified record while the proposal is reviewed. Never rewrite past accepted agreements, invoices or payouts.

Bank change review additionally compares the proposed receiving account and account holder with the seller's reviewed identity and applicable business/representative authority. Only eligible Super Admins may inspect bank details and approve them. Matching text alone does not establish ownership; record the independent verification reference and outcome. Mismatches need correction or explanation before approval. Do not reveal bank or citizenship details in notifications.

The user approved [bank/identity changes and payout approval](2026-10-31-bank-identity-changes-payout-approval.md) on 31 October 2026. D4 holds unpaid payouts immediately on a submitted bank change, retains otherwise-valid order access and holds new orders for material identity changes. It separates unsent/sent/uncertain/paid packets, old-record disposition and fresh eligible Super Admin approval, which may be by the preparer. Proposed replacement details are never used before verification. D13 now follows the [approved single-Super-Admin finance amendment](2026-10-31-single-super-admin-finance-approval.md): one eligible Super Admin may prepare, approve, manually execute and record; first change triage within 1 business day is approved. These are settled rules with implementation still on hold.

### 5.1 Reasoned change-request lifecycle

The seller selects the specific verified document/field group, provides a meaningful reason and submits one request. The dashboard shows the reference, affected scope, current status, next responsible party and any seller-visible feedback. An existing open request for the same scope is reopened for viewing/continuation instead of duplicated; unrelated permitted requests can proceed separately.

| Stage | Seller experience | Super Admin/reviewer action |
|---|---|---|
| Request awaiting review | Current verified record stays read-only; seller sees submitted reason and scope. | Compare the request with current evidence; approve the specific replacement scope, request clarification or reject with reason. |
| Permission granted | Only the approved fields/evidence can be replaced through the request. | Keep the authorization linked to the current record/version and reviewer decision; do not unlock the entire application. |
| Replacement submitted | New evidence is pending; the previous verified version and history remain visible where permitted. | Independently review the replacement and associated field differences. Earlier permission is not evidence verification. |
| Changes requested | Clear feedback and a scoped correction action within the same request/version chain. | Review the corrected submission; retain prior decisions and reasons. |
| Completed | Show the newly effective reviewed values/evidence and completion time. | Save the reviewed version atomically, preserve prior history and reevaluate only the affected readiness conditions. |
| Rejected / withdrawn / no longer needed | Show the actual outcome and reason; no silent loss of historical records. | Remove unused replacement permission as appropriate; retain the current valid record unless a separate evidence decision invalidates it. |

The permission must be checked again when uploading/submitting a replacement, including scope, version, current reviewer authority and whether it was used, withdrawn or superseded. It must not authorize future unrelated replacements indefinitely. A replacement cannot overwrite a newly verified concurrent version.

For a registration value that does not require document replacement, the request may include the proposed value and reason for one reviewable change. Show current/proposed values together. If it affects identity, PAN, accepted terms or bank ownership evidence, use the required evidence/revalidation workflow rather than simply changing the field and retaining a stale verification. Do not force a separate identical permission request after an authorized scoped correction has already been granted.

Normal proposed changes do not rewrite current verified values, past invoices, agreements or payouts. Preserving history is not permission to continue relying on evidence known to be invalid. Any explicit invalidation must show which applicable readiness checks no longer pass. Approved D4 supplies a scoped ordering/payout hold matrix, classification, rejection/withdrawal and restoration rules, including existing cases at later rollout; no blanket account suspension is inferred.

### 5.2 Bank and beneficiary comparison

The restricted review brings the proposed account holder/bank details, existing beneficiary version, seller's reviewed legal/representative identity and supporting evidence together. Record the independent verification basis and outcome; matching names alone is not enough. If ownership/authority is uncertain, request clarification and block use of the proposed account. Do not substitute the company's receiving account for a seller beneficiary or allow a third-party beneficiary without a separately established authorized policy and verified evidence.

Only eligible Super Admins can inspect full bank details and approve bank changes under the current agreed role policy. General task summaries and email/bell notices contain the request reference and permitted status, not full bank details or private evidence. Any payout prepared for an older account version must be handled explicitly under the pending-change policy before money is recorded as sent.

## 6. Selling readiness and activation

Overview offers Review selling readiness. Show application, applicable documents, current accepted agreement, company/legal seller and invoice identity, reviewed commercial clearance, bank verification, program settings and eligible products as individual checks. Each row has status, evidence/review reference, responsible party and a route to resolve it. Keep full sensitive evidence inside its restricted section.

An explicit Enable order acceptance action is available only when all authoritative checks pass. Show which seller and model it affects and what will become available. Product review and publication stay distinct. Payout eligibility is still independently evaluated. If an external business clearance or implementation dependency remains, show it truthfully and keep activation unavailable.

### 6.1 Activation checklist and responsibility

Review selling readiness opens a focused checklist inside the seller record. Each row shows its result, exact missing condition, responsible party, reviewed version/reference and Resolve/View evidence link. Do not present unsupported checks as completed merely because fields are nonempty.

| Check | Required basis / responsible action |
|---|---|
| Owning account and access | Correct authoritative owner link, active eligible account, applicable account checks and no blocking seller restriction/deletion hold. Staff investigate mismatches through authorized account processes. |
| Application | Actual eligible reviewed application stage for the route; missing later-action details have a clear seller correction path. Approval for activation is not order acceptance. |
| Applicable documents | Current independently verified evidence for the chosen route/action; identify missing, replaced or invalidated evidence precisely. |
| Terms and fee policy | Seller's own recorded acceptance of the applicable agreement/version and required effective fee terms. Apply the approved common-date fee policy; no early activation of a scheduled rate, invented consent or grandfathering of new orders under obsolete terms. |
| Company and commercial arrangement | Actual reviewed company/legal-seller and invoice identity, operating model and current evidence-bound clearance required by the live activation design. Show company-owned work as Waiting for Hastabazaar. |
| Beneficiary readiness | Current independent bank/beneficiary verification where required by the selected activation model; payout controls remain separate. This does not block permitted pre-activation product submissions. |
| Program and live system readiness | Current effective settings and a genuinely implemented/tested live order, invoice, cancellation/refund and settlement path. A simulation-only model or unfinished dependency cannot be enabled by a UI choice. |
| Products | Required eligible reviewed product(s) for activation, with publication and per-product purchase availability shown separately. Do not publish every draft or make all stock available by activating the seller. |

The existing live-activation design scopes initial live readiness to the sale-linked model; fixed supplier-price live support is not silently added by this screen. Requirements must be mapped for Managed Makers and Registered Sellers separately so a company-only condition is not incorrectly imposed on another route. Missing external clearance stays an explicit prerequisite; the software cannot manufacture it.

Suggested readiness labels: Action needed from seller, Waiting for review, Waiting for Hastabazaar, Ready for activation and Orders enabled. These describe the applicable checklist, not a new public badge or a blanket Verified account claim. Show last checked time and refresh authoritative readiness before the activation decision.

### 6.2 Explicit activation and result

1. Super Admin opens Review selling readiness and resolves or inspects each listed check.
2. When all applicable conditions actually pass, show Ready for activation with an explicit Enable order acceptance action. When blocked, list the missing condition and route to resolve it; a disabled button alone is insufficient.
3. Confirmation identifies the seller, route/model, actual accepted terms/effective policy and consequence: eligible published products may receive new orders. It does not verify documents, publish drafts, transfer money or remove unrelated restrictions.
4. On submission, independently recheck staff authority, evidence/terms/settings versions, restrictions and the actual live capability. Reject a stale readiness result while preserving the review context. Retrying the same request returns its recorded outcome without duplicate activation history or notification.
5. After success, show Orders enabled with actor/time/reference and any separate product/payout limitations. Notify the seller automatically. If the operation did not save or the outcome is uncertain, show the actual status/check result rather than inviting repeated new activation attempts.

An application approval never substitutes for this activation decision. Conversely, staff should not have to repeat application approval merely to reach the missing readiness step. Eligible applicants retain dashboard access to complete requested details and prepare/submit permitted products while ordering remains blocked.

### 6.3 Later changes and ongoing checks

Order eligibility is evaluated at the real cart/checkout/order boundaries against current applicable evidence, terms, restrictions, stock and program settings; an old activation result is not permanent authorization to bypass a later blocker. Display the specific internal reason and responsible task while preserving the appropriate public operational message and permitted seller access.

Follow the approved terms policy: missing updated acceptance blocks new orders from the effective time, retains dashboard/existing-order access and does not independently freeze otherwise-eligible historical payouts. Valid acceptance clears only that hold without another admin approval when all other checks pass. Bank/material-identity handling is approved in D4; its explicit restoration/readiness rule must not change the already-approved automatic resolution of valid terms acceptance. Preserve existing obligations and historical financial terms throughout.

Live activation cannot be declared ready until its underlying implementation and evidence are actually verified. A deployment does not automatically approve or activate any real seller, including the sellers who originally reported the problem.

## 7. Tasks, messages and history

The user approved the **Email delivery** name and requested automatic background sending as the normal workflow. Use the [email delivery plan](2026-10-30-email-delivery-automation.md) for event/department routing, clear queued/retry/accepted statuses, scheduler health, failure ownership and restricted recovery actions. A reviewer should not need to process six-message batches to inform people. Show relevant task-level delivery information here and link eligible Super Admins to the global delivery console; keep inbox read status separate from email delivery evidence. Implementation remains on hold.

Approved on 30 October 2026: automatic recovery with retries after 5, 10, 20, 40 and then 60 minutes, followed by hourly retries while the message remains relevant, subject to provider limits and expiry. Notify Super Admin through the bell/dashboard both when sending stops and when recovery is confirmed. Super Admin sees one continuing incident, its owner, whether automatic retry is active and the next retry/health-check time. Link a distinct, deduplicated recovery notification to that incident even if the outage alert was already read. Current eligible messages resume automatically after recovery; acknowledging either notification is not required. Permanent recipient/configuration problems need a specific correction, after which validated eligible work resumes without another manual batch click. Record recovery and any genuinely remaining failures without declaring all messages delivered. Implementation remains on hold.

Assign tasks to authorized staff, keep ownership visible and record reassignment. Review tasks, notification read state and email delivery state are separate: reading a notification does not complete a review; queuing email does not prove delivery. Group repeated alerts and link each to its task. Use secure links rather than private evidence in email. Super Admin can see oversight queues; departmental visibility follows permission, including in counts and search results.

Record document decisions, changes, account restrictions, product publication, activation and financial decisions with their actual actor/time and affected version. Ordinary staff actions never erase history. The seller-facing dashboard will display the appropriate decision reason and next step without exposing internal notes.

### 7.1 Seller events and resolution

| Saved event | Task/notification effect |
|---|---|
| Evidence or scoped change request submitted | One canonical review task for eligible staff, visible in Overview and the seller workspace; seller sees the reference and waiting state. |
| Clarification/correction requested | Seller receives precise feedback and a direct authorized link to that field/document/request; task shows Waiting for seller. |
| Document verified or change completed | Show the exact outcome, refresh affected readiness and notify the seller once. Cancel reminders that no longer apply; other missing checks remain open. |
| Application approved for activation | Show the saved application result and remaining activation steps; never announce order acceptance merely from this event. |
| Order acceptance enabled | Notify the seller once after successful activation with links to permitted product/order actions and separate payout readiness. |
| Terms hold resolved | Stop obsolete acceptance reminders and resolve that follow-up only; retain unrelated blockers and history. |

Use the approved automatic delivery, retry/recovery and duplicate-suppression rules. Reading an alert or adding a note does not resolve the underlying task. Recheck the actual saved state just before dispatch, reuse the event/recipient identity on retries and do not resend an already accepted notice. A decision successfully saved remains saved if notification delivery fails; the delivery incident is handled separately.

## 8. Clarity, saving and accessibility

Link failing seller/admin tasks to the [Form Management health and recovery view](2026-10-30-form-management-reliability.md) under the approach approved on 30 October 2026. Keep ordinary business forms stable while catalogue changes remain drafts, verify publication compatibility, and distinguish a working form with draft edits from an actual unavailable form. Preserve safe previews, restore/history and domain permissions while simplifying the editor; no form reset or blanket republish is part of this plan. Implementation remains on hold until planning is complete and the user asks to begin.

Use the approved [field cleanup and catalogue placement inventory](2026-10-30-form-management-field-inventory.md) to keep verification, approvals, restrictions, payments and order actions in their owning native tasks. It classifies all 65 exposed catalogue entries and preserves review reasons, evidence references and history while removing unnecessary generic editing. Product review intake is approved to accept one clear cover photo and no gift occasions; reviewers may request additional views or add relevant discovery tags as appropriate. Intake acceptance does not replace product review, publication or ordering checks. Actual production extensions must be inventoried before any migration; implementation remains on hold.

Use compact summaries and readable tables, with important exceptions expanded and long agreements/history collapsed. Provide Nepali/English labels and contextual explanations where helpful. Display dates in Nepal time consistently and distinguish local display time from stored event time.

Autosave allowed drafts with Saving/Saved/Failed feedback. Unsaved confidential notes must use an appropriate protected draft design rather than unbounded browser storage. Verification, activation and financial decisions always require an explicit submission; autosave must not execute them. Preserve inputs on network/validation errors, show field-specific corrections, and explain unavailable actions. Keep keyboard focus, accessible viewer fallback and mobile usability in the design.

## 9. Company bank accounts and manual payment verification

The [Finance & payments design](2026-10-30-finance-payments-workspace.md) and its service targets were approved on 31 October 2026, consolidating receipts, refunds, payouts and reconciliation. D4 bank/identity and D13 payout rules are approved under the [approved single-Super-Admin finance amendment](2026-10-31-single-super-admin-finance-approval.md); permissions, evidence/holds and actual-outcome mapping remain later implementation work. The [refunds after payout and recovery workflow](2026-10-31-refunds-after-payout-recovery.md) and all its follow-up targets are approved under D15; named staffing/calendar mapping and implementation remain outstanding. The [D7 manual-payment rules and targets](2026-10-31-manual-payment-rules.md) are approved, including receipt/deadline/exception/refund/COD behavior under the same single-Super-Admin amendment. This section remains the original company-bank scope, not proof of implemented payment support.

### Agreed scope — 30 October 2026

The user confirmed the company currently has only its bank account and asked to include company bank account management and manual payment verification in the work plan. Merchant QR and payment gateway integration are deferred to a later phase. This is an agreed planning scope, not authorization to implement, enable a checkout method, verify real payments, or move funds now. The workflow details below remain design proposals for the completed plan.

The user supplied a company account name of HASTA BAZAAR PRIVATE LIMITED at Nabil Bank, Birgunj Branch, account ending 3252. These are user-supplied details, not independently verified banking evidence. The full account number is deliberately not copied into this repository document. No account has been connected or configured in the application.

Recommend a company-level Company bank accounts area under restricted Business/Finance settings. Seller Management links to its readiness where relevant; it must not duplicate the company bank record into each seller's payout details. The current Company selling account setting holds shop identity/contact/return information and is not a bank integration.

Initial planned uses, subject to company/bank confirmation and the applicable payment arrangement: receive customer bank transfers through an explicitly enabled manual payment flow, reconcile COD remittances, and record authorized refunds and seller payouts performed outside the website. Keep seller earnings/liabilities distinct from company revenue. Individual sellers retain independently verified beneficiary accounts. Merchant-provider settlement integration belongs to the deferred QR/gateway phase.

Store exact account details and ownership evidence privately with review status, permitted purpose, reviewer/date and change history. Mask the number in ordinary admin summaries. Reveal approved receiving instructions to a customer only in the relevant enabled payment flow. Changes to the company's receiving account need explicit Super Admin review and must not silently rewrite prior payment instructions.

Adding bank details alone does not enable live payments, automatic payout transfers or seller activation. No bank API, automatic bank-feed matching, QR checkout, card acceptance or gateway connection is included in this initial phase. Later merchant onboarding and integration require their own plan. Nabil's official EPG information describes a signed agreement and subsequent API integration with its team; Nabil QR requires merchant onboarding and supports transaction tracking through its merchant tools.

For manually reconciled receipts, a customer upload or claimed transaction reference is not confirmation of cleared funds. Finance must match the receipt, amount and order to authoritative bank/provider records, prevent duplicate allocation, and record reversals/refunds. Automatic confirmation requires a separately implemented and tested provider integration.

Sources consulted on 30 October 2026: https://www.nabilbank.com/service/nabil-electronic-payment-gateway-epg and https://cdn.nabilbank.com/service/nabil-qr-code. No provider fees, approval timelines, account eligibility or legal/tax treatment are assumed from the supplied account details.

### Proposed Super Admin and finance interface

- Company bank account record: account holder, bank, branch, account number, currency, permitted purpose, private ownership evidence, review status and history. Start with the supplied account; do not pre-label it Verified. Suggested states are Draft, Awaiting verification, Verified and Inactive. Verification and enabling it for new payment instructions are distinct explicit decisions.
- Super Admin manages account changes. Authorized finance staff see only the information needed for their assigned payment reviews; exact delegated approval permissions remain to be agreed. Full details/evidence remain access-controlled, with masked summaries and no sensitive attachments or account numbers in notification emails.
- A Manual payment verification queue sits with company finance operations. It shows order reference, amount expected, amount claimed, payment date, claimed transaction reference, assigned reviewer, age and status. Opening a task shows the order totals, the account instructions issued for that order, customer evidence and the staff-recorded bank receipt together.
- Seller Management links to the same order/payment record. For a multi-seller order, the company receipt is recorded once and allocated to the relevant order portions; sellers see only their own payment/readiness summary. The shared interface must not expose the buyer's bank evidence or another seller's finances.

### Proposed manual customer-payment flow

1. When the payment method is explicitly enabled and the order is otherwise eligible, give the customer the reviewed company receiving details, exact amount/currency, unique order/payment reference, payment instructions and expected review timing. Keep the issued account version and instructions on the order so a later account change does not silently redirect existing payments.
2. The customer submits a transaction reference/date and, where useful, a receipt upload. Show Awaiting payment before a claim and Payment under review afterwards. Submission or upload does not mark the order paid or start fulfillment automatically.
3. The reviewer checks the actual company bank statement/transaction record, records the receiving account, bank transaction identity, amount/currency, date, order allocation and verification evidence/reference, and compares these with the order and claim. Customer-supplied information alone cannot satisfy this check.
4. An explicit Confirm payment action records the reviewer, timestamp and reason and updates payment status once. Recheck the current order, receipt allocation and permissions at submission. A receipt cannot be used twice, including concurrent reviews, retries or reuse against another order; a documented split allocation must not exceed the actual receipt amount.
5. Need more information and Unable to match actions preserve evidence and give the customer a clear next step without treating an unmatched claim as paid. Partial, excess, duplicate, wrong-currency and late payments go to an exception queue; the detailed resolution rules remain to be agreed. A receipt against a cancelled order does not reopen the order automatically.
6. Confirming payment triggers only the existing, otherwise-valid next order step. It cannot bypass seller activation, stock, commercial checks, restrictions or payout eligibility. The planned seller-response reminder starts when the seller can actually act, not while a bank-payment claim is unresolved.
7. Corrections, bank reversals and refunds append a linked record with reason and audit history; they do not erase the original decision. Recheck affected fulfillment and payout eligibility and alert authorized staff. Show the customer the appropriate payment result through the order page; configured notifications link to it without private banking evidence.

### Manual outgoing payments and reconciliation

Use existing payout/refund approval rules. A payout request or approved payout is not proof of a transfer. Staff carry out the authorized transfer through the bank outside the application, then record the transaction reference, date, amount, beneficiary account version and supporting evidence. Confirm completion against the bank record before displaying Paid/Refunded, and prevent duplicate disbursement records. No website-triggered transfer is included in this phase.

Finance should be able to compare recorded receipts, COD remittances, refunds and payouts with the bank statement and list unallocated or mismatched transactions. Received customer funds must not immediately become withdrawable seller earnings; the existing fulfillment, refund, hold and settlement conditions still apply. A cancelled claim does not erase a real bank receipt. The seller-bank-change payout policy is approved under D4/D13; implementation remains held.

### Verification scenarios for later implementation

- Correct payment, missing/altered proof, unmatched reference, partial/overpayment, wrong currency, duplicate claim and duplicate receipt allocation across orders.
- Two reviewers or repeated submissions confirm the same payment concurrently; only one financial effect is recorded and both see the authoritative result.
- Account details change or become inactive after instructions are issued; historical instructions and receipt matching remain traceable, with explicit staff handling where needed.
- Payment received after order cancellation/expiry, failed or reversed receipt, payout/refund corrections and bank statement mismatches.
- Authorized versus unauthorized staff; seller/customer access isolation; private uploads, notification redaction, multi-seller allocation and complete decision history.
- Unpaid orders do not enter an actionable fulfillment state prematurely; paid orders still obey activation/stock rules and seller funds remain subject to settlement checks.
- Use fictional bank evidence and simulated payments in local verification. No real transfers or payment verification during planning or testing.

### Payment policies still to settle

Use the approved 4-staffed-hour complete-claim review target. Decide who may confirm receipts, actual coverage, transfer instructions/payment expiry and inventory reservation, treatment of partial/excess/late payments, and the reconciliation owner. These remaining choices do not reopen target durations or authorize automatic cancellation, refunds, delegated bank access or payout changes.

## 10. Fee policy and seller-specific terms

Follow the [agreed commission transition and wording policy](../plans/2026-10-30-seller-order-response.md#commission-transition-and-wording--agreed-policy). Ordinary seller/admin summaries show only the latest effective commission when no future change is published. During the 15-day notice period, show the current rate, upcoming rate and common start date, plus acceptance status. Link to the shared commission policy for authorized changes instead of adding a second rate editor. Separate Current, Scheduled, Acceptance required and Historical labels; retain history and scheduling controls in the detailed admin policy view.

The user agreed that the scheduled 12% governs all covered sellers' new orders from its effective timestamp, including previously 9% sellers and sellers joining/accepting during the notice period. Early acceptance records the future policy but never starts the rate early or creates a later personal start date. Existing orders/agreements retain their original evidence and recorded rates. Verify the live schedule and affected route settings and plan the transition of older supplements; they must not indefinitely retain the old new-order rate. Missing acceptance at the start date now has an agreed treatment: pause new orders until explicit seller acceptance, retain dashboard/existing-order access, and notify the seller and Super Admin. Use a labelled fee and actual amounts rather than company/seller percentage pairs. No live policy or implementation changes are made during planning.

### Terms acceptance follow-up queue

Show Terms acceptance required in Needs attention and the individual seller record. Record the policy/version, start date, acceptance state, new-order hold start, seller contact, email/dashboard notification state, delivery failures, assigned staff, last contact and next follow-up. Provide permission-filtered summaries for awaiting acceptance, currently held, accepted and assistance needed. Alert Super Admin in-app and by email with a secure link to the affected seller(s); group related events without losing individual follow-up visibility.

Authorized staff can inspect the required next step, contact/guide the specific seller, resend an appropriate reminder and record the outcome or a technical issue. They cannot accept the terms for the seller or clear the hold by checking a follow-up box. A staff note and a recorded email delivery are not evidence of acceptance. Follow the [approved reminder and staff deadlines](../plans/2026-10-30-seller-order-response.md#approved-reminder-schedule-and-follow-up-deadlines), approved by the user on 30 October 2026: begin outreach 3 days before the common start, assign within 24 hours and make the first attempt by 1 day before; review/contact newly held sellers within 24 hours, make a second attempt by 48 hours if needed, and escalate unresolved cases by 72 hours. Review long-open cases at 7 days and weekly afterwards. Failed email or technical acceptance issues receive an owner within 24 hours of discovery; technical recovery has a 48-hour target with overdue visibility. Use elapsed calendar time displayed in Nepal time and confirm named owners/backup coverage before implementation. These approved staff targets are separate from order-response reminders and do not guarantee seller acceptance by a deadline. Implementation remains on hold until planning is complete and the user resumes work.

Approved D22 supersedes digest-only oversight: each genuine hold-start or other operational event creates one Super Admin email plus dashboard/bell notice. A daily outstanding/overdue summary is supplementary, omits resolved attention items, and never replaces event notices; repeated scans do not create events. Record assignment, last contact/outcome, next due date and failed delivery. Routine seller reminders stop after day 7; unaccepted sellers remain visible for staff review, including those marked unreachable or declined, without falsely resolving the terms task or lifting the hold. Deduplicate manual resends with the reminder schedule and suppress follow-up once the exact required acceptance is recorded.

Once the exact required seller acceptance is saved, automatically resolve its follow-up task, stop stale reminders and remove only that acceptance hold. Resume new orders when all other eligibility checks pass; otherwise display the remaining blocker with its own task. Keep contact and acceptance history, preserve historical order rates and do not impose an unrelated payout freeze. Failed emails remain visible for assistance; the dashboard prompt and order enforcement do not depend on successful mail delivery.

## 11. Sellers walkthroughs and acceptance scenarios

| Scenario | Required outcome for later verification |
|---|---|
| Incomplete new seller | Same dashboard/record remains reachable; relevant missing details are explained without forcing bank completion before permitted product preparation. |
| Application approved but orders unavailable | The application result stays clear; exact activation blocker and owner are visible with a working next action. No repeated application approval loop. |
| PAN/identity verified | Exact evidence version shows reviewer/time/reason; unrelated documents, products, activation and payouts retain their actual states. |
| Verified document change | Reasoned scoped permission → replacement → independent review → new current version with old evidence/history retained. Replacement does not inherit verification. |
| Duplicate or concurrent change/review | Existing same-scope request/outcome is reused; stale versions cannot overwrite current evidence or duplicate decisions/notifications. |
| Wrong or uncertain bank beneficiary | Proposed account remains unavailable for payouts; only eligible Super Admin views evidence and records ownership comparison; clarification stays actionable. |
| Activation ready/stale/unsupported | Current valid readiness enables the explicit action; a concurrent change or unavailable live model blocks it with the correct explanation. No simulation bypass. |
| Individual product/payout still blocked | Orders enabled does not imply all products are public/in stock or that payouts are available; each state is independently accurate. |
| Terms accepted after a hold | Only that acceptance hold clears, obsolete messages stop, and other readiness checks still apply. |
| Form or email interruption | Saved progress/decision is described truthfully, permitted notes survive recovery, and automatic delivery recovery does not require repeated staff processing. |
| Restricted/unauthorized viewer | Access, counts, searches, evidence and direct links respect role and ownership; no private data appears publicly. |
| Mobile and returning to queue | Document comparison and decision controls are usable, keyboard focus is meaningful, and filters/drafts are preserved on return. |

These are future verification requirements, not completed tests. Use fictional evidence, isolated fixtures and simulated money movement under the local safeguards. No production record is modified to make a demonstration pass.

## Next planning decisions

1. Carry approved D4/D13 bank/identity and pending-payout rules into the later walkthrough and verification. First change triage within 1 business day is approved; named staffing/calendar coverage remains to be completed.
2. Map department owners and approved deadlines. Apply mandatory D22 Super Admin email/dashboard oversight; it is not an opt-out or digest-only preference.
3. Carry forward approved D4 material identity and bank handling; carry forward the [approved public-profile and cooldown rules](2026-10-31-public-profile-changes-cooldown.md) separately for presentation changes. Do not infer that a public display-name change changes legal identity or automatically freezes payouts.
4. Review the [Seller Center dashboard mapping](2026-10-30-seller-center-workspace.md) against the admin workflow, including drafts, requests, corrections and help. The seller-side proposal is now recorded; field-level review rules and the listed policies still need final decisions.
5. The expanded Sellers layout/workflow is approved. Carry its incomplete, pending, verified, restricted and active examples into later implementation verification. Products & storefront, Orders & customer care, Finance & payments and Fees, programs & promotions are approved; the [fee publication, scheduled replacement and combination rules](2026-10-31-fee-publication-schedules-combinations.md) are also approved. Current versus future consent and unrelated activation holds remain distinct. Implementation remains on hold.
6. Map required evidence and activation conditions to the existing seller routes and live capability. Confirm current implementation/deployment evidence before execution; do not infer readiness from historical screenshots or planning approval.

No implementation resumes merely because the Sellers section is approved. The user requested completion of planning first.
