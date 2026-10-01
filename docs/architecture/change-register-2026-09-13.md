# Hastabazaar change register — 13 September 2026

## Deployment hold

Owner instruction received 2026-09-13: do not deploy, upload releases to cPanel, run production migrations, enable cron, send messages/emails, or change live records. The hold persists until every question/request is completed or explicitly planned, the owner approves the final scope, and the owner separately authorizes deployment. Approval of an individual modification authorizes its agreed local work only.

Hosting remains Babal.Host cPanel, Node 22.23.2, MariaDB, application root `/home2/hastabaz/hastabazaar-app`, startup `app.cjs`. No alternate hosting, paid subscription or OpenAI/ChatGPT branding.

## Reviewed baseline

Read the project audit and proposed roadmap dated 2026-09-11, section-one security and retest reports dated 2026-09-12, and section-two operations and section-three customer-journey reports dated 2026-09-13.

- Sections 1–3 are reported implemented and verified locally, not deployed. Recorded latest results: 100 automated tests, TypeScript, scoped lint, Babal build, synthetic MariaDB and browser checks at 320/390/1440 px. These tests were not rerun during this handoff review.
- Latest cumulative local candidate: `outputs/hastabazaar-customer-section-three-2026-09-13.zip`. SHA-256 freshly checked during handoff and matches `d2b82a4bec5d899d9aace0647fdd9b3bc212745d5e8440804403579e99a1764d`. Adjacent manifest exists; its individual entries were not reverified during handoff.
- Last known deployed release, per handoff: `outputs/hastabazaar-delivery-maps-2026-09-11.zip`. No fresh production verification performed.
- Local Windows Node 22.23.1/MariaDB 11.4.9 do not establish exact Babal parity. Section-one retest separately records local Linux Node 22.23.2/native-image checks. Full-repository lint issues and production performance/acceptance limits remain documented.
- Existing extensive uncommitted changes are retained. No application code, releases, databases, media or Git configuration changed during handoff. Test services were reported stopped; none started for this review.

## Preserved decisions

Protect private account information, credentials, tokens, session URLs and Super Admin configuration. Preserve authentication, privileged access, existing data/media, historical return-policy snapshots and recorded rewards/discounts. Public support: support@hastabazaar.com.

COD and promotional credit/referrals remain supported; deposits/withdrawals remain disabled. Current offer remains Rs. 50 referrer reward and Rs. 50 friend discount under existing eligibility rules. Preserve separate seller parcels, explicit collection/remittance, one order delivery charge and existing totals. Courier booking/webhooks/GPS are not connected; rider location needs an active browser/device. Retry cron stays disabled. Historical seller-access complaint remains unresolved without account-specific evidence; never link another business as a workaround.

## Request register

| ID / date | Question or request | Decision / approval | Implementation | Local verification | Deferred work / status |
| --- | --- | --- | --- | --- | --- |
| R001 / 2026-09-13 | Review handoff, retain deployment hold, wait for questions/modifications, maintain dated register. | Explicitly requested by owner. No new feature phase authorized. | Six reports reviewed; this register created. | Candidate ZIP SHA-256 matches; manifest existence and workspace status checked. No runtime tests rerun. | Ready for owner's first question/modification. Deployment remains prohibited. |

Append each subsequent question/request with its decision, exact authorized scope, implementation references, actual verification evidence and deliberately deferred work. Explain meaningful business-rule changes before implementation. Once approved, complete authorized local work without repeated permission requests. Inspect relevant existing documentation and source to avoid duplicate functionality. Test only with isolated synthetic data; preserve previous ZIPs and reports.

## Deferred deployment work — no authorization

After requests are settled, prepare consolidated review and updated cumulative candidate for final scope approval. Deployment requires additional separate explicit authorization.

Pending thereafter: backups, Babal preflight/compatibility, section-one and section-two additive migrations, cumulative deployment, agreed authenticated production acceptance and designated email testing. Section 3 adds no migration. Never apply the base/reset schema over existing data. Cron activation and messages remain subject to explicit authorization. Keep all local results distinct from production evidence.

### R002 — 2026-09-13: Confirm password at signup

- Request: include a Confirm password field during email/password signup.
- Analysis: local app/register/page.tsx already has Password, but no Confirm password field. The registration handler reads only password. Source inspection only; no browser/runtime or live verification.
- Proposed scope for later review: require confirmation matching Password, provide a clear mismatch error, validate matching server-side, and never store the confirmation value. Preserve existing password rules and Google signup.
- Approval/status: recorded for later work; implementation not started. No application changes or tests performed.
- Owner process update: collect, analyze and record questions/modifications only while the owner is listing them. Start agreed local implementation after the owner finishes intake and authorizes work. Deployment hold remains unchanged and separate.

### R003 — 2026-09-13: Product archive/delete restriction during active orders

- Request: prevent product archiving or deletion from order placement through delivery completion.
- Approval/status: collected for later analysis and implementation; no application changes made.
- Pending analysis: inspect existing product controls and order/parcel states; define behavior for multiple active orders, cancellation, failed delivery and return-to-origin. Do not assume these exceptions are decided. Preserve order history and existing snapshots.
- Verification: not performed; source-level and synthetic regression checks will follow scope agreement.

### R004 — 2026-09-13: Email and in-app dashboard action notifications

- Request: notify the affected users by email and through the in-app notification menu when Super Admin approves a seller, and whenever actions happen in seller, admin or customer dashboards.
- Approval/status: request collected only; implementation awaits completion of owner question intake and agreed scope. This request does not authorize sending actual messages, enabling cron or deployment.
- Existing documentation: order-updates.md describes transactional order-status emails with retry handling; operations-governance.md describes a separate recipient-scoped notification_messages outbox. Documentation alone does not verify complete current coverage; inspect actual source before extending either system.
- Pending analysis: inventory dashboard actions and existing notifications; prepare an event/recipient/channel list for review, including seller approval, role-specific visibility, safe message content, unread/read menu behavior and duplicate prevention. Clarify the scope of 'any actions' before implementation rather than silently limiting or expanding it.
- Verification: no runtime tests or live checks performed. Later local tests must use synthetic recipients and fake email transport; real inbox tests remain separately authorized deployment acceptance.

### R005 — 2026-09-13: Switch between seller and customer dashboards

- Request: after seller approval, let the same email/Gmail account switch between Seller dashboard and Customer dashboard using a visible option or tab.
- Proposed intent for review: reuse the signed-in account and session; provide switching in both directions without logging out or creating another account. Switching changes the workspace view, not approved roles, ownership or permissions.
- Initial source evidence: lib/auth/sign-in-destination.ts already routes approved sellers to /seller by default; customer /account navigation and seller navigation already exist. This is not proof of a complete switching flow. Inspect layouts, access guards and mobile navigation during detailed analysis before extending existing controls.
- Approval/status: collected only; implementation awaits the owner finishing the question list and authorizing agreed local work. Existing seller-approval eligibility and staff access must be preserved; do not link another business or treat this as resolving the historical seller complaint.
- Local verification: targeted source search only; no application changes, runtime tests or live actions. Later synthetic tests should verify both directions and denial of seller access for unapproved or suspended accounts.

### R006 — 2026-09-13: Remove seller payout minimum

- Request: remove the NPR 1,000 minimum eligibility criterion for seller payouts.
- Initial evidence: seller-earnings-payouts.md documents NPR 1,000; lib/db/repositories/payouts.ts applies payoutPolicy.minimumPayoutPaisa to eligible queues, seller requests and payout preparation. Review all configuration, UI and enforcement paths together during implementation.
- Proposed scope for review: allow a positive eligible available seller balance below NPR 1,000, retaining destination requirements, settlement/return holds, authorization, independent approval and duplicate protections. This applies to seller earnings payouts, not customer wallet withdrawals.
- Approval/status: requested and recorded; implementation waits for completed intake and agreed local work. No payout records changed or transfers performed.
- Local verification: documentation and source search only; no runtime tests.

### R007 — 2026-09-13: Promotional wallet and Super Admin gift cards

- Request: wallet holds referral rewards and issued gift-card credit for shopping discounts only. Funds cannot be withdrawn; direct money deposits remain stopped. Only Super Admin may issue gift cards, with random amounts and random gift-card numbers.
- Existing baseline: referrals-wallet.md already describes promotional shopping credit with deposits, withdrawals, transfers and cash top-ups unavailable. Preserve historical balances, earned rewards, applied discounts, and existing referral offer/eligibility. This is separate from seller earnings payouts in R006.
- Pending analysis: inspect actual wallet/credit functionality and any gift-card support before designing an extension; prepare issuance, redemption, role permissions, audit records and duplicate-redemption protections for review. Do not assume gift cards already exist or are fully absent from this initial search.
- Decisions still needed after intake: what 'random amount' means (system-selected within an approved range versus a variable amount chosen by Super Admin), permitted range/denominations and budget, recipient binding versus transferable redemption codes, and any expiry policy. Do not invent monetary limits or expiry rules.
- Approval/status: collected only; no application implementation, card issuance, wallet credit, deposit configuration change, messages or deployment authorized in this intake step.
- Local verification: documentation and targeted source search only. Later checks must use isolated synthetic data and verify Super Admin-only issuance, safe unique codes, single redemption, shopping-discount accounting and disabled wallet deposits/withdrawals.

### R008 — 2026-09-13: Automatically assigned product SKUs

- Request: system assigns SKUs when sellers list products, different and unique for every seller.
- Proposed interpretation for consolidated review: each new product receives its own system-generated SKU, unique across sellers as well as within a seller's catalogue; seller need not type one. Confirm the intended uniqueness scope and display format during review.
- Initial source evidence: products repository inserts input.sku and revision code updates it; seller product API reports duplicate SKU within the shop. Review form validation, database constraints, edit paths and retry/concurrency behavior before implementation.
- Preservation: do not silently renumber existing products or historical references. Decide existing SKU handling explicitly in final scope.
- Approval/status: collected only; implementation awaits completed intake and authorization of agreed local work.
- Local verification: targeted source search only; no code changes, SKU generation, runtime tests or live records changed.

### R009 — 2026-09-13: Others category and occasion options

- Request: add an Others option to both product categories and occasions when none of the listed choices fits.
- Initial source evidence: product submission validates active category and occasion records through existing catalogue repositories. Check existing catalogue definitions before adding options to avoid duplicates.
- Pending review: confirm whether Others is simply a selectable fallback or also asks the seller to specify text; review moderation and storefront/filter presentation using existing taxonomy controls. Do not assume sellers may create public categories or occasions themselves.
- Approval/status: collected only; no taxonomy records, application code or live data changed. Implementation waits for completed intake and agreed local scope.
- Local verification: targeted source search only; later synthetic tests should cover selection, validation, persistence and existing product classification preservation.

### R010 — 2026-09-13: Warranty/guarantee choice and flexible duration

- Request: seller product-listing form should offer Warranty or guarantee as a Yes/No dropdown. Selecting Yes reveals duration inputs; sellers must not have to fill every duration unit.
- Interpretation recorded for review: days, months and years (owner wording repeats year but also explicitly mentions day/month/year). Allow a duration such as months alone without requiring days and years. Whether Yes requires at least one positive duration remains a business-rule decision for consolidated review.
- Initial source evidence: components/seller/product-submission-form.tsx currently uses a warranty text field; lib/products/submission.ts parses nullable warranty text with a length limit. Review storage, edit forms and customer-facing display before replacing existing input behavior. Preserve historical warranty text and order/policy snapshots.
- Approval/status: intake only; no implementation. No runtime tests; targeted source search only. Deployment hold unchanged.

### R011 — 2026-09-13: Mark mandatory fields with an asterisk

- Request: any section requiring mandatory details should mark those fields with a star/asterisk so users know they must fill them.
- Proposed scope for review: seller product-listing form at minimum; inventory other forms under the owner's wording about any sections and confirm broader coverage during consolidated review. Reflect actual validation, including conditional requirements, rather than making currently optional fields mandatory.
- Presentation intent: visible asterisk beside required labels plus a clear explanation that * means required; preserve accessible required-field semantics and clear validation errors.
- Initial source evidence: product form already has required attributes on several inputs and a required label for its first image. Audit all applicable fields and server rules for consistency before implementation.
- Approval/status: recorded only; implementation awaits completed intake and agreed local work. No code changes, tests or live actions performed.

### R012 — 2026-09-13: Four-sided product photos and optional video

- Request: seller product listings must include photos showing all four sides of the product, with an extra video section that is optional for now.
- Recorded interpretation for review: four required photo slots for distinct sides (proposed labels: front, back, left and right), with video not required to submit. Confirm suitable angle labels for products without conventional sides during consolidated review.
- Initial source evidence: product-submission-form.tsx currently offers 1–5 images, requires only the first image for new listings, and retains existing images on revision. lib/products/submission.ts supports five image fields with JPEG/PNG/WebP validation and a 5 MB per-image limit. No video field was found in these inspected form/validation files; inspect the full media storage and serving paths before implementation.
- Pending scope decisions: handling existing listings with fewer than four photos when edited, retention of the optional fifth photo, and supported video types/size/duration within Babal hosting limits. Preserve all existing uploaded media; do not force retrospective media replacement without an explicit decision. Required photo inputs alone cannot prove that uploaded images depict distinct sides; review guidance/moderation should address this honestly.
- Approval/status: collected only; implementation awaits completed intake and agreed local work. No media upload, application changes or live actions performed.
- Local verification: source search only; later synthetic checks should cover four-photo submission requirements, optional-video omission, safe upload validation, edits preserving existing media, and customer gallery/video display.

### R013 — 2026-09-13: Simplify product-listing fields and labels

- Request: remove Producer or maker and Materials fields from the seller product-listing form; rename Story and details to Product description; rename the preparation wording to a clear phrase meaning time taken to prepare the product.
- Proposed preparation label: Time needed to prepare the product (days). This is a wording change, not a change to delivery estimates or preparation calculations.
- Initial source evidence: product-submission-form.tsx contains Story and details, required Producer or maker and Materials inputs, and Preparation time (days). Its form-assistance schema also references producer/materials. Inspect submission validation, persistence and edit/display dependencies so removed fields do not remain hidden submission requirements.
- Preservation: removing inputs does not authorize deleting existing producer/material data or changing historical order/product snapshots. Resolve handling of new listings without those values during detailed analysis; do not fabricate replacement content.
- Approval/status: collected only, awaiting completed intake and agreed local implementation. Verification consists of source search only; no application changes or runtime tests.

### R004 clarification — 2026-09-13: Contextual notifications and destination links

- Owner extends the notification request: actionable events must appear in the relevant dashboard section as well as the notification menu; selecting a notification should navigate directly to its related section/record.
- Explicit example: seller submits a product for review; Admin receives a notification and can open the exact product review/approval page from that notification.
- Recorded interpretation: redirect on user selection of the notification, not unsolicited navigation when a notification arrives. Confirm this interpretation during consolidated review if needed.
- Pending analysis: map each event to recipients, its dashboard location, and its authorized destination, integrated with R004 email/in-app coverage. Preserve access checks and private data boundaries; opening a notification must not approve a product or perform another mutation. Handle stale/removed/inaccessible targets gracefully.
- Approval/status: intake only; no notification delivery, messages, application changes or deployment. Detailed source review and synthetic event/navigation tests remain pending agreed implementation.

### R014 — 2026-09-13: Admin/Super Admin records and workflow progress tab

- Request: add a tab in Admin and Super Admin showing captured records, including how many sellers are approved, the next step, and which subsequent steps have been completed.
- Interpretation for consolidated review: an activity/progress view combining summary counts with per-record workflow status, completed actions and pending next steps. Proposed display includes record type/reference, action, actor, timestamp, current status and a link to the authorized detail page. These proposed fields remain subject to scope review.
- Existing documentation evidence: operations-governance.md describes marketplace aggregate reports and audit records for several operations. admin-workspace.md notes existing append-only audit/ledger boundaries. Inspect actual audit coverage, reports, navigation and workflow source before creating or extending a view; do not duplicate systems or assume all events are currently recorded.
- Pending scope: define what every record includes (seller applications, product reviews, orders/parcels, returns, payouts and other dashboard actions) and each workflow's actual next step. Distinguish current approved-seller counts from historical approval-event counts. Show only recorded evidence; do not fabricate missing historical actions or imply an external action was completed without evidence.
- Access/preservation: both staff roles receive only records allowed by existing permissions. Private Super Admin configuration remains private. Integrate links with R004 contextual notifications; displaying a next step must not execute it automatically.
- Approval/status: request collected only; implementation awaits completed intake and agreed local scope. No application changes, new event capture, live-record access or deployment performed.
- Local verification: documentation/source search only; later synthetic checks should cover accurate counts, workflow progression, event history and role-specific access.

### R015 — 2026-09-13: Explain and clarify Order emails administration

- Question/request: explain what the Admin/Super Admin Order emails section means, what can be changed or tracked there, and make it clearer.
- Source-confirmed local behavior: app/admin/order-emails/page.tsx requires order.manage permission, shows status counts, queue age/due/failure/expired-lease summary, and latest 50 order email updates with order number, triggering update, sending status, attempts, safe failure and next retry time. components/admin/order-email-retry.tsx offers Send up to 6 eligible emails and refreshes the view after the action.
- Explanation: this monitors queued customer order-status email sending. Sent means accepted by the mail server, not guaranteed inbox delivery or read receipt. The button can attempt actual sending of eligible messages; it is not merely a refresh. This page does not edit order status, email templates or recipient details. Generic dashboard notifications are a separate existing system.
- Requested improvement for later scope review: plain-language purpose and status definitions, clarify email-sending status versus parcel delivery status, explain exactly what the retry action does, show understandable next steps for delays/failures and links to related orders. Replace or explain technical terms such as expired sender leases; coordinate with R004/R014 rather than duplicate monitoring. Preserve safe failure redaction.
- Approval/status: explanation and request recorded only; UI implementation deferred until completed intake and agreed local work. No retry button/API invoked, email sent, cron enabled or production accessed.
- Verification: local source and documentation inspection only, not runtime or production verification.

### R016 — 2026-09-13: Show product discount percentage

- Request: show the percentage difference between original price and actual selling price, alongside the crossed-out original price and current price.
- Proposed calculation for review: (original price minus selling price) / original price * 100. Example: original Rs. 1,000 and selling Rs. 800 displays 20% off. Calculate from existing price values rather than introducing a separately editable discount that could disagree with them.
- Initial source evidence: submission.ts already parses pricePaisa and optional compareAtPricePaisa, requiring the latter to exceed selling price; product detail renders selling price and compare-at price. Review all product cards and pricing displays before extending existing rendering.
- Pending scope review: consistent display on product detail and listing cards, plus seller form preview while entering prices; agree rounding precision and handling of very small discounts. Show a percentage only with a valid positive original price above selling price. Do not combine this product-price percentage with referral, gift-card or wallet discounts.
- Preservation: display change does not alter stored prices, order totals, historical discounts or snapshots.
- Approval/status: collected only; implementation awaits completed intake and agreed local work. Local verification limited to source search; no application changes, runtime tests or live actions performed.

### R017 — 2026-09-13: Explain delivery charges and owner-managed rates

- Question/request: explain the observed Rs. 250 delivery charge, differences between per-order/per-cart and different-seller charging, recommend an operating approach, and allow the owner to assign/change delivery rates manually later.
- Source-confirmed local rules: lib/checkout/validation.ts getManualDeliveryQuote uses normalized destination district: Kathmandu/Bhaktapur/Lalitpur Rs. 150; configured Terai district set Rs. 180; other recognized districts Rs. 250. getDeliveryEstimate applies the charge once per order regardless of item quantity or seller count. Order creation calculates and persists that charge and the original commercial snapshot. The cumulative local version rejects unknown districts; earlier deployed behavior may differ. The owner's specific checkout/district was not inspected, so the exact reason for that observed live charge is unverified.
- Current boundaries: manual configured tariff, not a real-time courier price. Seller origins, parcel count, weight and dimensions do not affect this calculation. Separate seller parcels preserve one customer charge; parcel cash allocation is not an extra delivery fee. No existing admin rate editor or per-order fee override was found in the targeted source search; detailed coverage remains to be checked.
- Options for review: (1) one destination-zone charge per checkout/order, simple for customers but marketplace covers any extra separate-parcel cost; (2) charge per seller parcel, closer to separate dispatch costs but raises multi-seller checkout totals; (3) base charge plus extra-parcel surcharge/cap, balancing simplicity and cost but requiring approved pricing rules; (4) manually quoted exceptions before customer confirmation.
- Recommendation for scope discussion: retain the approved one-charge rule initially, add owner-managed zone/district rates for future orders, explain the selected destination band at checkout, and track actual courier costs separately per parcel. Review real operating costs before choosing any additional seller/parcel charge. No new tariff amounts are assumed.
- Proposed manual controls subject to approval: Super Admin rate settings with effective dates/audit trail; explicit per-order exception workflow if desired. Existing confirmed orders must not be silently repriced. A post-confirmation change requires an agreed customer consent/adjustment workflow and consistent totals, COD allocations, receipts and notifications. Whether authorized Admins may edit rates, override timing, handling of reductions and cancellation/refund effects remain decisions for review.
- Approval/status: question analyzed and request recorded only; existing one-charge and historical-total constraints still apply. No rate edits, new UI, migrations, live order inspection or deployment performed.
- Local verification: source/documentation inspection only; no runtime or production checks. Synthetic tests for rate selection, mixed-seller carts, saved quote consistency and historical preservation are deferred until scope approval.

### R017 decision — 2026-09-13: Recommended delivery approach approved

- Owner decision: go with the recommended approach.
- Approved scope: retain one customer delivery charge per order regardless of seller/parcel count; add Super Admin-managed district/zone delivery rates for future orders; clearly explain the applicable destination rate at checkout; record actual courier costs separately for each seller parcel using or extending existing cost records where available.
- Preserve existing Rs. 150/180/250 rates as initial defaults unless the owner changes them through the agreed settings. No additional per-seller/parcel customer surcharge approved. Existing confirmed order totals, delivery charges and policy snapshots remain unchanged.
- Separate parcel courier costs are operational records and must not automatically change customer totals or seller settlements. Review existing cost tracking to avoid duplication.
- Manual per-order overrides and post-confirmation repricing were additional options, not part of the recommended default; neither is approved by this decision. Revisit only if explicitly requested.
- Implementation approval applies to this scope for the later agreed work phase. Current intake-only instruction still applies: do not implement until the owner finishes requests and authorizes starting local work. This is not deployment, message-sending or live rate-change authorization.
- Status/verification: decision recorded; no implementation, tests, rate edits, live actions or deployment performed.

### R018 — 2026-09-13: 24-hour customer cancellation window before processing

- Request: customer may cancel only during the first 24 hours after order placement. After that, customer cancellation closes and further order processing begins, followed by delivery within the applicable delivery period.
- Initial source evidence: cancelCustomerOrder in lib/db/repositories/fulfillment.ts currently requires confirmed status; seller start_packing transitions confirmed items to packing. Existing policy says free cancellation before packing. This request changes time eligibility and processing timing, not just button visibility.
- Recorded interpretation for consolidated review: a full 24-hour hold from server-recorded placement time for new orders, with customer cancellation available during that hold; seller preparation/packing/dispatch cannot close the window early. After the deadline the order becomes eligible for processing and self-service cancellation is denied. Expiry alone is not evidence that packing or dispatch actually happened.
- Proposed interface/validation: display cancellation deadline and awaiting-processing status, enforce the deadline and hold server-side across whole-order and parcel paths, and handle simultaneous cancellation/processing atomically. Apply equivalent ownership/receipt authorization for signed-in and guest customers. Agree exact deadline boundary during detailed design.
- Delivery implication: if preparation begins only after the hold, estimates must account for that additional 24 hours plus preparation and transit. Explain this at checkout/receipt/tracking and coordinate notifications and progress records with R004/R014. No new guaranteed arrival date or courier automation is inferred.
- Preservation and pending decisions: define rollout for already-placed orders without rewriting snapshots; preserve authorized staff exception handling, return/complaint rights and existing stock/credit restoration. Coordinate cancelled-order exceptions with R003 product archive/delete restrictions. Do not treat the customer deadline as a blanket ban on all administrative cancellation or aftercare.
- Approval/status: request collected for consolidated business-rule review; implementation awaits completed intake and authorization to start agreed local work. No scheduler/cron enabled, order processing performed, messages sent or live records changed.
- Local verification: targeted source search only. Later synthetic tests should cover just before/at/after deadline, early-processing denial, concurrent requests, guest/account access, stock/credit restoration, multi-seller parcels and estimate consistency.

### R019 — 2026-09-13: Verified rider accounts and full delivery workspace

- Request: explain current rider identity/dashboard and delivery assignment; develop a properly verified rider account with customer/rider switching under one registration, delivery progress updates, open-box evidence, possible delivery OTP verification, and maps to reach the customer's delivery location. Owner requests questions/suggestions before moving ahead.
- Source-confirmed baseline: app/rider/page.tsx exists with assigned active legacy orders and seller parcels, recipient contact/written address, optional saved delivery-pin link and foreground GPS Start/Stop sharing. Access currently uses customer authentication; assignment matches an active registered email in delivery/repository.ts and operations/parcels.ts, not a separately verified rider profile. Current page explicitly reserves dispatch, delivery confirmation and cash records for Admin. Inspected rider APIs provide location updates; a full verification/application, delivery-proof and OTP workflow is not present in the inspected rider surface.
- Assignment explanation: authorized staff link an order (legacy) or seller parcel (managed parcels) to an own-rider account, or record a manual courier/reference. Assignment gives access to that job; it does not dispatch, confirm delivery or change the delivery charge. Reassignment removes prior rider access and clears location. Existing parcel model must be extended rather than bypassed or duplicated.
- Proposed scope for review: rider application/profile approval and suspension, approved-rider assignment selection, customer/rider switch, assigned-job dashboard and history, authorized progress events/failure reasons, handover evidence and notifications, and destination map/navigation alongside manual address fallback. Rider needs the saved delivery address/pin, not unrestricted live tracking of the customer. Browser location sharing remains foreground/device-dependent; no background guarantee or new paid provider.
- Decisions requested before design/implementation: (1) Super Admin-only final rider approval versus Admin approval too, with private evidence requirements to agree; (2) rider submits delivery/proof/COD reports for staff confirmation versus rider directly finalizes delivery/collection within assigned-job permissions, preserving independent remittance approval; (3) OTP delivery channel and open-box evidence rules. Suggested initial channel is existing email with customer order-page access, avoiding an unconnected paid SMS service; select photo/checklist versus video evidence and whether open-box applies to selected eligible products or every order. These are proposals, not approved policy.
- Design dependencies: define OTP expiry/attempt limits/single use, authorized exception when code is unavailable, consent and private proof access/retention, pickup locations if required, truthful delivery versus cash events, and handling previously assigned ordinary accounts without silently granting verification. OTP is not proof of COD collection or courier remittance. Coordinate R004 notifications, R005 switching, R014 activity, R017 charges/costs and R018 processing hold.
- Approval/status: explanation and request recorded; questions pending. Current intake-only instruction remains in force; 'work on that' is not treated as finishing intake or deployment authorization. No account verification, role grant, uploads, OTP/email sending, assignment changes, implementation or live access performed.
- Verification: local source/documentation inspection only. Later isolated synthetic acceptance must cover approval/access boundaries, reassignment/suspension, switching, permitted transitions, OTP/evidence behavior, privacy, map denial/staleness, cash safeguards and mobile use.

### R019 decision — 2026-09-13: Rider approval, evidence and configurable delivery rules

- Owner approves Super Admin-only rider approval, Admin-managed assignments, and initial staff confirmation of rider-submitted delivery/completion and COD reports. Preserve independent remittance controls; delivery proof does not itself prove cash collection or remittance.
- Owner requires at least one photo OR one video of the delivered product as delivery proof. Proposed workflow: rider records handover and uploads proof, then staff reviews/confirms completion. Do not require both photo and video. Preserve private evidence access and avoid unnecessary customer identity/location capture in media.
- Owner does not require OTP for COD. Keep an optional OTP method available for future activation/configuration; OTP must not block current COD delivery. Channel and technical safeguards remain to be specified before that method is enabled; no SMS/provider purchase or real OTP sending authorized.
- Owner requests Super Admin dashboard controls to later change whether delivery/open-box requirements apply to all products or only eligible products. Treat mandatory delivery proof as applying to all rider deliveries initially based on the unqualified proof requirement. Clarify the separate initial open-box inspection policy during consolidated scope review rather than assume every parcel must be opened. Configuration should distinguish proof, open-box inspection and optional OTP rules.
- Settings changes must preserve recorded evidence and historical policy snapshots; define effective application to future versus existing assignments during detailed review. File limits, safe storage/serving, retention and review/rejection behavior remain implementation-scope decisions.
- Approval/status: these business decisions are approved for the later agreed local implementation phase. Owner has not yet ended request intake; no code, rider roles, assignments, settings or live records changed. Deployment and message-sending holds remain in force.
- Local verification: decision recorded only; no runtime tests performed.

### R020 — 2026-09-13: Super Admin-managed individual Admin roles and feature permissions

- Request: Super Admin can enable/disable features for each Admin and assign/manage different roles for different Admin accounts.
- Initial source evidence: lib/marketplace/permissions.ts currently maps fixed customer/seller/admin/super_admin roles to static permissions; can() evaluates role only. Team invitation UI offers Admin or Super Admin. The named admin.permissions.manage permission is not evidence of a working per-person permissions editor. Inspect actual account/role persistence and all authorization paths before extending existing staff management.
- Proposed scope for consolidated review: Super Admin staff-access interface with reusable role/permission presets and per-Admin feature/action controls; show effective access clearly, record who changed permissions and when, and apply checks to server routes, mutations and data access as well as menu/button visibility. Disabled feature access must not remain usable through a direct URL/API. Define read versus act permissions where needed.
- Examples for review only: catalogue/product review Admin, order/delivery Admin, customer-support Admin and finance-preparation Admin. These are illustrative presets, not finalized role definitions.
- Preservation: Admins cannot grant themselves authority or alter their own roles/permissions. Keep Super Admin configuration and explicitly reserved actions private, preserve existing privileged access during migration, retain independent approval and immutable audit protections. R019 rider approval and R007 gift-card issuance remain Super Admin-only; R017 rate settings also remain Super Admin-managed. Do not infer permission to delegate these to ordinary Admins.
- Pending analysis: inventory hard-coded role checks alongside permission guards, choose safe defaults for existing Admins and effective revocation behavior, and verify how the existing dualApprovalRequiredFor admin.permissions.manage declaration is actually enforced before proposing any business-rule change. Do not silently bypass established approval safeguards.
- Approval/status: collected only; implementation awaits completed request intake and agreed local scope. No role grants, revocations, invitations, messages, live account changes or deployment performed.
- Local verification: targeted source inspection only. Later synthetic checks should verify distinct Admin access, direct-route/API denial, changes to active sessions, no self-escalation and retained Super Admin/maker-checker protections.

### R014/R020 clarification — 2026-09-13: Central Super Admin action audit

- Owner requirement: every action must be recorded and visible in the Super Admin dashboard to track marketplace activity.
- Scope intent: extend R014 with a central Super Admin audit history across customer, seller, rider, Admin, Super Admin and system workflows, including R020 role/permission changes. Record actor (or system), action, affected record, timestamp, outcome and safe relevant before/after changes. Link to authorized detail views and support useful filtering/search during scope review.
- Pending comprehensive analysis: inventory actual event coverage and missing paths, including unsuccessful/denied sensitive actions and system-triggered changes; explicitly map what counts as an action. Routine page views/clicks are not silently added as behavioral surveillance. Clarify any desired read/access auditing in consolidated review. Do not claim complete coverage until verified across the agreed event inventory.
- Integrity/privacy: use or extend existing append-only audit records; ordinary application controls must not permit editing/deleting history, including by Super Admin. Do not record passwords, secrets, OTP values, session tokens/URLs, gift-card redemption secrets or unnecessary personal data. Super Admin visibility does not require displaying credentials. Log safe references and redacted summaries where needed.
- Historical boundaries: retain genuine existing records; do not invent retrospective actions where evidence does not exist. Distinguish historical coverage gaps from events captured after the eventual release. Preserve restricted Admin visibility rather than exposing the full Super Admin audit to all Admins.
- Approval/status: requirement recorded for later agreed implementation; intake remains open. No logging implementation, role changes, live record access, messages or deployment performed.
- Verification: documentation update only. Later synthetic checks should verify agreed action coverage, actor attribution, failure/outcome handling, transaction consistency, immutable history, privacy and role restrictions.

### R021 — 2026-09-13: Individual/company seller registration and PAN/VAT document selection

- Request: seller can register as Individual or Company; adapt registration/tax-document fields to that choice and allow PAN, VAT or both, requiring at least one upload.
- Recorded interpretation for consolidated review: explicit Individual/Company selector and PAN/VAT/Both tax-document selection; require at least one valid PAN or VAT certificate. Confirm whether selecting Both requires both certificates and what identity/business-registration fields apply to each applicant type. Do not infer that individuals are automatically tax-exempt or that companies universally require VAT.
- Initial source evidence: seller-application-form.tsx currently has PAN or VAT selection, one PAN or VAT number and tax-certificate upload, plus business registration fields/certificate. seller-applications repository uses taxMode PAN|VAT; API maps taxCertificate to VAT certificate when VAT selected. Review validation, uniqueness rules, storage, private-document viewing and approval flows before extending this structure.
- Preservation: keep existing applications, seller links, tax numbers and private uploaded evidence intact; do not reclassify existing businesses or invent missing documents. Individual applications must not require fake company details. Classification/document changes must not silently enable marketplace VAT collection or modify checkout/tax calculations.
- Pending decisions: exact fields/documents per applicant type, Both upload requirement, identifier representation when certificates share a tax identifier, and treatment of existing applications. Any legal eligibility conclusions require separate authoritative review; this intake record makes no legal compliance claim.
- Approval/status: collected only; implementation awaits completed intake and agreed local scope. No application changes, approvals, uploads, live records or deployment performed.
- Local verification: targeted source search only; later synthetic tests should cover all applicant/document combinations, missing/invalid uploads, duplicate identity protection, private access and existing application preservation.

### R018 discussion — 2026-09-13: Cancellation before seller readiness instead of 24-hour hold

- Owner asks whether customer cancellation should remain available until the seller makes the order ready for delivery, and requests a recommendation. This is a proposed revision, not final approval of a replacement policy.
- Source recheck: cancelCustomerOrder currently permits confirmed orders only; moving into packing can already close online cancellation. Allowing cancellation during preparation/packing until ready_for_pickup would therefore require an actual behavior change.
- Recommendation for review: remove the mandatory 24-hour processing hold; for ordinary ready-stock products allow cancellation while pending/preparing/packing, and close self-service cancellation at ready_for_pickup or any later fulfillment state. Show this boundary before purchase and notify when readiness closes it. Sellers may process immediately, without an added day in estimates.
- Multi-seller recommendation: apply eligibility per seller parcel so one ready parcel does not block cancellation of another eligible parcel. This requires an explicitly agreed partial-cancellation financial policy covering the single delivery charge, promotional credit/referral/gift-card restoration and COD allocation. Existing section-two manual handling of mixed cancellations must not be assumed to implement automatic customer partial cancellation.
- Made-to-order/customized goods: cancelling after work begins may leave seller costs. Proposed exception for review is staff-reviewed cancellation once actual production has begun, with terms clearly shown beforehand. Do not introduce a hidden cutoff or infer this exception is approved.
- Integrity: readiness must reflect actual ready-to-handover goods; log actor/time, block stale competing cancellation/readiness transitions and preserve aftercare/staff exception paths. No guarantee of legal adequacy is made; this is operational design advice.
- Status: revised decision pending owner response; earlier 24-hour proposal must not be implemented while this alternative remains under discussion. No source changes, orders, tests, messages or deployment performed.

### R018 decision — 2026-09-13: Readiness-based cancellation approved; 24-hour hold superseded

- Owner approves the recommended readiness-based approach, including the custom-made exception. This replaces the earlier proposed mandatory 24-hour cancellation/processing hold. Do not implement the 24-hour hold or add an extra day to estimates for that reason.
- Approved ordinary-product behavior: sellers may process immediately; customer self-service cancellation remains available while placed/preparing/packing and closes when the relevant seller parcel is marked Ready for pickup or progresses beyond that state. Dispatched cases go through support/existing aftercare rather than self-service cancellation.
- Approved multi-seller behavior: evaluate eligibility per seller parcel; one ready parcel must not prevent cancellation of another eligible seller parcel. Whole-order cancellation is available only where all affected parcels remain eligible. Final implementation must handle legacy/non-parcel orders consistently without bypassing the cutoff.
- Approved custom-made exception: after actual production begins, cancellation becomes a staff-reviewed request rather than automatic cancellation. Explain the exception before purchase. Define how custom-made classification and actual production start are recorded during detailed design; no automatic seller fee/refund deduction is approved by this exception.
- Approved transparency: record readiness actor/time and notify the customer when self-service cancellation closes; readiness must reflect goods actually ready for handover. Enforce transitions server-side and protect competing cancellation/readiness actions atomically.
- Still pending consolidated financial decision: partial-cancellation handling of the single delivery charge, COD allocations, promotional/referral/gift-card credit restoration, and related holds. Preserve historical totals/snapshots and existing immutable money records; do not invent reallocation or forfeiture rules. R003 must release archive/delete restrictions appropriately for cancelled fulfillment obligations while respecting other active orders.
- Approval/status: replacement business policy approved for the later agreed local implementation phase. Request intake has not been explicitly closed and global implementation has not begun. No application changes, orders, tests, messages, migrations or deployment performed. Separate deployment hold remains unchanged.

### R007 decision — 2026-09-13: Super Admin sets gift-card amount

- Owner approves the recommendation: Super Admin chooses each gift-card amount; the system generates a random, unique redemption code. This supersedes the earlier proposal for randomly selected monetary amounts.
- Preserve Super Admin-only issuance and promotional shopping-credit use. Redeemed wallet funds cannot be withdrawn; direct deposits remain disabled. Existing referral rewards, discounts and historical balances remain unchanged.
- Remaining scope decisions: recipient binding versus bearer redemption, expiry policy, permitted amount limits and issuance budget, and redemption safeguards. Do not infer approval of limits or expiry from this amount-selection decision. Keep redemption codes private and out of general audit logs; audit safe gift-card references instead.
- Approval/status: business decision approved for later agreed local implementation. Intake remains open; no cards issued, codes generated, wallet entries changed, messages sent or application code modified. Deployment remains on hold.
- Verification: decision recorded only; no runtime tests performed.

### R012 clarification — 2026-09-13: Four different product angles

- Owner confirms that four conventional sides are not necessary; four different product angles are acceptable. Replace the earlier fixed front/back/left/right interpretation with four useful views from different angles.
- Retain the four-photo requirement for new listings and the optional video section. Guide sellers to show distinct, informative views rather than assigning mandatory geometric side labels. Upload-count validation cannot itself prove distinct angles; use guidance and existing product review.
- Preserve existing listings and uploaded media when introducing the requirement. Handling of later edits to older listings remains part of consolidated implementation scope; do not force retrospective replacement automatically.
- Approval/status: clarified requirement recorded for later local implementation. No listing edits, uploads, application changes or runtime tests performed. Intake and deployment holds remain unchanged.

### R004/R014 decision — 2026-09-13: Actionable notifications versus audit history

- Owner approves recording business actions in audit history while notifying only people affected by an event or needing to take action. Minor actions that do not affect further processing do not require notifications.
- This supersedes R004's earlier broad wording that every dashboard action should produce email and in-app notifications. Preserve comprehensive business-action audit scope under R014/R020; absence of a notification must not suppress required audit history.
- Approved notification scope: meaningful status changes, decisions and events requiring action, sent to the relevant authorized recipients through the agreed email/in-app channels, with contextual destination links. Define the event/recipient matrix during consolidated review; do not notify unrelated accounts or broadcast every audit entry.
- Implementation should prevent duplicate notifications and keep private content role-appropriate. Existing agreed examples such as seller approval, product review requests, delivery assignments and cancellation-cutoff changes remain candidates for the explicit event matrix.
- Approval/status: business decision recorded for later agreed local implementation. No notifications sent, audit systems changed, application edits or runtime tests performed. Request intake remains open; deployment and message-sending holds remain unchanged.

### R003 decision — 2026-09-13: Archive/delete only after all related obligations are settled

- Owner clarifies that product archive/delete is allowed only when everything related to that product is settled. Delivery completion or cancellation alone does not release the restriction.
- Recorded business scope: block while any related order/item/parcel has unfinished fulfillment, cancellation or return processing, an unresolved complaint/dispute, a pending refund, or outstanding related cash/settlement obligations. Check all related orders, not just the latest one. Review exact financial linkage and meaning of settled during detailed design rather than assuming an aggregate delivered/paid status is sufficient.
- Release only after all applicable related obligations reach their agreed resolved/settled states. Cancelled/returned items must complete required inventory, credit/refund and financial adjustments before release. An open case remains blocking even if the delivery itself is complete.
- Scope boundaries for final review: decide how unexpired return windows with no open case, seller-level payout/reserve holds and obligations partly attributable to a product affect eligibility. Do not invent automatic settlement, write-offs or mandatory expiry of all history as a workaround.
- UX/implementation intent: explain specific blocking obligations to the owning seller and link to authorized relevant records; enforce server-side across archive/delete paths and concurrent new orders/cases. Preserve historical product references, policy snapshots and records after archive/logical deletion. This does not authorize removing Super Admin suspension/unpublish controls needed to stop new sales.
- Approval/status: clarified business rule approved for later agreed local implementation. No product/order/financial changes, runtime tests, messages or deployment performed. Intake remains open and deployment hold unchanged.

### R022 — 2026-09-13: Clear exception ownership and next actions

- Owner requests the proposed exception workflow for failed delivery, rejected proof, unavailable customer, incorrect cash entries and cancelled parcels. Each must show who acts next, connected to rider workspace, actionable notifications and audit history.
- Proposed workflow: an exception has type, related order/parcel/case, status, assigned responsible staff/person, next action, history and supporting evidence. Reuse existing delivery failure, cases and incident records; do not build a competing order or financial ledger.
- Ownership: rider reports failed delivery/unavailable customer; assigned operations Admin decides retry/reassignment/return-to-origin. Staff rejects delivery proof with a reason and assigns resubmission to the rider; staff reviews the replacement. Incorrect cash entry goes to authorized finance/operations review with independent approval for any eventual adjustment; posted evidence is not editable. Cancelled parcels remain assigned to operations until necessary stock, refund/credit and cash reconciliation are complete.
- Scope boundary: surfacing and assigning an incorrect-cash exception does not authorize inventing a financial correction or write-off. Any adjustment mechanism must be explicitly designed, linked to the original record and preserve immutable history and existing approval controls.
- Local verification planned: each exception produces the right next owner/action and authorized notification without making unrelated parcels delivered, paid or settled. Test denied access, reassignment, duplicate reporting and resolution history with synthetic data.
- Status: added to consolidated scope; not implemented.

### Intake closure and finalization — 2026-09-13

- Owner says to add R022, finalize for now and start working. Request intake is closed for this review cycle; scope consolidation and local implementation preparation are authorized. Earlier intake-only entries describe historical status, not an ongoing ban on preparation.
- Prepare a consolidated scope with all R002–R022 requests and accepted revisions. Do not reopen individual approvals. Monetary/identity decisions not yet agreed must remain explicitly pending and block only dependent work.
- Final scope review file: docs/architecture/consolidated-scope-2026-09-13.md. Source implementation status remains not started at this checkpoint. No deployment authorization has been given; all original live-action, messaging and preservation constraints continue.

### Consolidated scope verification — 2026-09-13

- Created docs/architecture/consolidated-scope-2026-09-13.md with approved decisions, complete request coverage, exception ownership, source-mapped work groups, unresolved decision gates and local acceptance/release constraints.
- Checked that the scope table contains every request R002 through R022 (21 modification requests), retains explicit deployment hold and superseded cancellation wording, and includes incorrect-cash exception handling. This is documentation verification only, not application testing.
- Final scope review is pending; no previously approved individual modification is being reopened. Once consolidated scope is accepted, execute agreed local work while asking only for unresolved business decisions affecting dependent changes.

### Authorized local execution begins — 2026-09-13

- Owner explicitly authorizes consolidated local implementation R002–R022; previous intake-only status is historical. Deployment/messages/live data/cron hold remains.
- Fresh source baseline: outputs/consolidated-local-20260913-042936/source-before.zip, adjacent source-before.manifest.json and worktree-before.txt. Existing source, previous releases, data and uploads preserved.
- Execution ledger: docs/superpowers/plans/2026-09-13-consolidated-local-execution.md. First changes implement signup confirmation, product form removal/warranty/labels, computed discount presentation and same-account dashboard links. Per-request final verification remains pending.
- Focused signup/product regressions pass; initial full suite 104/104 passes. Browser, native DB and cumulative build not yet run for this scope; no new release candidate yet.
- Unresolved gift policy, seller document matrix and closure boundary presented to owner; dependent implementation stays pending. Existing declared permission maker-checker rule will remain enforced.

### Local implementation and first integrated acceptance — 2026-09-13

- Implemented R002 confirm password; R005 customer/seller switching; R006 removal of payout minimum with historic policy untouched; R008 generated SKU claims; R009 Others taxonomy; R010 flexible warranty; R012 four new-listing photos/optional bounded MP4; R013 removed fields/labels; R016 derived discount; R017 future delivery-rate versions and separate parcel costs; R020 effective Admin permissions with independent approval. No approval or monetary rule is relaxed beyond approved scope.
- R011 required-label pass is implemented on reviewed forms; dynamic/render review continues. R004 contextual recipient views and transactional business outbox, R014 safe audit/current queues and R015 email-monitor wording implemented; notification coverage/native fake transport and per-person progress work continues. R022 staff source-linked ownership/evidence history implemented; rider integration remains blocked with R019.
- Principal files and tests are itemized in consolidated-r006-local.md, consolidated-product-review-local.md, consolidated-r017-local.md, consolidated-r020-local.md, consolidated-r015-local.md, consolidated-r014-r004-view-local.md and consolidated-r022-local.md. Later checkpoint report will reconcile the complete per-file source baseline comparison.
- Five new additive migrations: product-identity-taxonomy, staff-permissions, delivery-rates-costs, business-notifications, exception-work. Fresh native verification applies prerequisites only to newly created empty synthetic databases and repeats new migrations. Caught and corrected missing InnoDB/utf8mb4_unicode_ci on new rate tables; original failed evidence retained. Manifest is explicitly consolidated-local-in-progress-2026-09-13, not a release candidate.
- Current npm test: 151 passed, no failures/skips (tests-latest.txt). Separate Babal build succeeded (build-products-reviewed.txt). Application-scoped oxlint passed; touched verifier script lint required a URL type correction and then passed. Source remains under active changes, so these results are checkpoint evidence, not final-source acceptance.
- Fresh native permission/rate concurrency and readiness checks passed; R022 native seven groups passed, including immutable history, revoked access and incorrect-cash resolution block. Inherited operations and customer journeys passed against earlier build snapshots (operations-run.txt, journey-run.txt), including320/390/1440, keyboard/zoom and zero horizontal overflow; rerun after material affected changes before final release. New products browser/native seven groups pass current product snapshot: exact signup rejection, same-session switching, four photos/generated SKU, actual H264 playback, legacy preservation and concurrent revision. Browser caught remaining Materials input; removed and render regression added before passing rerun.
- Unanswered business gates remain R003 settlement boundary, R007 gift policy, R018 partial financial example, R019 identity/proof/OTP rules and R021 seller document matrix. No dependent financial/identity persistence silently implemented. See consolidated scope gates and pending owner questions.
- Deployment hold remains absolute. New maintenance supplement consolidated-babal-maintenance-2026-09-13.md explicitly replaces historical empty-database instructions for future upgrade review; final candidate/report remain pending. No cPanel access, production migration, cron, real email or live record mutation.

### Additional independent scope and integrity acceptance — 2026-09-13

- R014 per-person recorded progress implemented with explicit source action/outcome matrix, own-actor Admin restriction and Nepal date bounds; current queue counts remain separate. R011 rendered helper regressions found missing conditional document, catalogue slug, collection note and governance markers, corrected without changing requirements. Staff browser five groups passed including active-session permission changes and unchanged exception money/parcel state. Updated progress page browser acceptance awaits rebuilt source.
- R004 existing outbox extended for guest aftercare through additive0035 guest-business-notifications: nullable user recipient only with constrained guest email/order/business-event shape. No fabricated guest accounts/in-app messages. Original checkout-email tracking and receipt access remain protected; no login bypass.
- Native guest business harness nine groups pass using fake transport only, including repeated migration legacy-row/FK/unique preservation, unchanged account count, no receipt-hash disclosure, stale guest contact suppression and concurrent claims. A deliberate missingCHECK fault initially failed the regression because readiness incorrectly remained ready; manifest/readiness now inspect the required MariaDB guest integrity check and the fault test passes after constraint restoration. Evidence native-business-guest-readiness-red.txt and native-business-guest-readiness-green.txt; no production database touched.
- Native R006 verifies1-paisa and99999-paisa payout preparation, zero balance rejection and concurrent single allocation; all prepared, none approved/paid. Evidence native-small-payouts.json. Existing cumulative/source ZIPs retain original hashes.

### Final local checkpoint for unanswered decision gates — 2026-09-13

- Final implemented-source verification:180 automated tests pass, no failures/skips; TypeScript, application/touched-script lint and independent Babal build exit0. Evidence tests-final-local.txt/types-final-local.txt/lint-final-local.txt/build-final-local.txt under preserved execution directory. New manual email processing audit parity, concrete legacy shipping/privacy audit mirrors and malformed-profile fail-closed fixes are included.
- Product, staff/progress and inherited operations/customer browser/native passes are recorded with exact build boundaries; audit-only final patches have regression/build coverage. Local performance and fake SMTP results are not production/inbox acceptance.
- Verified every875 entry of source-before.zip against its baseline per-file SHA-256 manifest, zero mismatches; baseline ZIP hash57321a61ee99d37b55001e5c6f8fb73c6bcc0c4069e1811493fffec60f96c199. Original cumulative/deployed ZIP hashes unchanged. No baseline source files missing in comparison.
- All synthetic browser/app sessions stopped. Verified exact root-owned MariaDB test process/data directory, stopped it and confirmed no listeners on13316/43873/43874; preserved its data directory. No other server/process or existing business database changed.
- Per-request current status and evidence: consolidated-local-checkpoint-2026-09-13.md. Concrete pending decisions: consolidated-pending-decisions-2026-09-13.md. Ordered additive maintenance/backup/rollback/acceptance preparation: consolidated-babal-maintenance-2026-09-13.md.
- R003/R007/R018/R019/R021 dependent work and R004/R014/R022 associated source integrations remain incomplete pending owner business rules. No answer inferred, no final cumulative candidate ZIP or deployment-ready claim. Separate deployment authorization remains mandatory.

### Four remaining recommendations approved — 2026-09-13

Owner explicitly approves implementation of the concrete R003 product-settlement, R007 gift-card, R019 rider identity/evidence and R021 seller-document recommendations. R018 partial cancellation remains pending for later discussion. These four are no longer decision blockers; no repeat approval will be requested. Rider open-box/OTP initially off; no automatic evidence deletion. No real messages or deployment authorized. Fresh actual-source snapshot outputs/approved-four-2026-09-13T05-17-00-125Z/source-before.zip, SHA25648e372b80a7e06a63d0f0e975dd09dc8f84518cce2827abd0ae281fc52910d6e.

### Owner-requested safe stop after four approved recommendations — 2026-09-13

- Source for R003/R007/R019/R021 and associated notification/audit/exception integrations is saved. Partial cancellation R018 remains pending, with no financial decision inferred.
- Combined206 tests passed before the final focused rider/OTP additions; latest rider9+OTP3, native rider7/gift5/closure3 groups and independent Babal build passed. New browser acceptance and final combined verification remain pending. Full stop report: approved-four-local-2026-09-13.md.
- Build finished during safe shutdown; isolated MariaDB received verified-datadir graceful shutdown. No browser servers were started for the new build. All agents stopped. No new release ZIP/deployment-ready claim and no live action.

### Four approved recommendations: final local acceptance — 2026-09-13

- Resumed at owner request. R003/R007/R019/R021 and associated notifications/audit/exceptions implemented and locally accepted. Final211 tests, nonincremental TypeScript, application/middleware/touched verifier lint and independent cumulative Babal build pass.
- Seller six-matrix, gift, rider and optional prepaid-code browser workflows pass; inherited operations/customer journey pass at320/390/1440 with keyboard/zoom and no overflow findings. Native wallet-integrity readiness fault checks pass; immutable history and financial checks retained. Exact evidence and boundaries: approved-four-local-2026-09-13.md.
- Added migration36gift cards,37seller registration,38verified riders; manifest90tables34triggers20entries. New OTP channel is protected order receipt/current rider verification, initially off; no SMS/email send, COD exempt. No new provider or paid dependency.
- All960 baseline ZIP entries verify; old cumulative/deployed hashes unchanged. R018 partial accounting remains the sole business decision, full release completion and new ZIP still held. No deployment/live records/real messages/cron.

### R018 financial Option 1 explicitly approved

Owner approves retaining the original single delivery charge while any parcel remains, proportionally restoring only cancelled-item wallet credit and removing its friend-discount allocation. Example remaining COD Rs.1,075 and wallet restoration Rs.50. No marketplace subsidy. Preserve original snapshots and separately record adjustments. No 24-hour hold; relevant parcel readiness is cutoff; custom production started requires staff review. Deployment/messages/live-data hold remains. Fresh source baseline: outputs/cancellation-option-one-2026-09-13T14-41-49-562Z.

### Delivery revision and local authorization regression — 2026-09-13

- Owner requests increased customer delivery for different stores while multiple products from the same store share a charge. The immediately following correction supersedes full-rate-per-store approval: first store pays the destination base rate; second store adds 50% of that base (Rs.150 becomes Rs.225). The third-and-later-store increment and whole-store cancellation recalculation have been presented for confirmation; no answer inferred. Historical orders retain their recorded policy. This supersedes the single-fee rule for future orders only once the revised policy is implemented.
- Preserved affected source before edits in outputs/delivery-revision-2026-09-13T17-07-42-047Z. Fixed the legacy customer cancellation wrapper to pass the caller's actual customer ID/receipt hash into the shared repository instead of retrieving the current receipt hash internally. A synthetic receipt-revocation race reproduced unauthorized cancellation before the fix and rejects it after the fix. Eight related tests pass (outputs/cancellation-auth-green.txt); complete regression and type checks are running. No deployment, production or real-message action.

- Fresh post-fix verification:224 automated tests pass, TypeScript without incremental cache exits0, and application-scoped lint exits0. Evidence: outputs/delivery-revision-regression.txt, outputs/delivery-revision-types-clean.txt, outputs/delivery-revision-lint.txt. Initial type-check failure was caused by the nine temporary backup copies being included by the repository's broad TypeScript glob; every copy was verified against the ZIP before removing the duplicate source folder. Preserved backup is outputs/delivery-revision-2026-09-13T17-07-42-047Z.zip. Delivery pricing integration, final browser/native/build reruns and cumulative packaging remain pending; this is not deployment-ready acceptance.

### R017/R018 delivery revision decision and cumulative local completion — 2026-09-13/14

- Owner approves the remaining rule: charge the destination base for the first distinct store and add 50% of that same base for every additional distinct store. At a Rs. 150 base, one/two/three/four stores charge Rs. 150/Rs. 225/Rs. 300/Rs. 375. Multiple products from the same seller identity share one store contribution.
- Owner also approves recalculation after an eligible entire-store cancellation based on distinct stores remaining: three to two becomes Rs. 300 to Rs. 225, two to one becomes Rs. 225 to Rs. 150, and all stores cancelled removes delivery. This supersedes the earlier single-fee and immediately preceding full-rate-per-store proposals for future orders. Historical orders retain recorded amounts and policies.
- Implemented authoritative server calculation, cart estimates, immutable checkout snapshots, receipt/staff safe read models, customer/staff cancellation displays and public/current policy copy. New snapshots use `base_plus_half_per_additional_store_v1`; malformed or inconsistent explicit snapshots fail to staff reconciliation, while legacy snapshots keep legacy accounting.
- Cumulative local verification: 230 automated tests; TypeScript and application-scoped lint; fresh isolated Babal build; synthetic MariaDB readiness/constraint/concurrency checks; cumulative operations and customer Playwright journeys; cancellation Playwright at 320/390/1440 with fake transport and repeated migration. The final operations rerun also renders the Super Admin delivery-rate policy. No provider traffic, real mail, production data, deployment, cron or cPanel mutation occurred.
- Final cumulative candidate: `outputs/hastabazaar-consolidated-delivery-revision-2026-09-14.zip`, SHA-256 `5b908944bc289a20be2704206e77a7c7615a6c76ef1ca9b87d7b053017e4ad3a`. Adjacent manifest and verification record cover 3,425 files. The earlier 13 September local attempt and every previous ZIP remain unchanged. Production/runtime/inbox acceptance and deployment remain pending separate explicit authorization.

### Production deployment explicitly authorized and completed - 2026-09-14

- Owner explicitly authorized backup-first production deployment, then explicitly confirmed the final distinct-store rule: Rs. 150/Rs. 225/Rs. 300/Rs. 375 at a Rs. 150 base for one/two/three/four stores, with eligible whole-store cancellation recalculated from remaining stores.
- Fresh cPanel full-account backup `/home2/hastabaz/backup-9.14.2026_00-43-20_hastabaz.tar.gz` was listed as available before maintenance changes. The Node application was stopped before DDL and release extraction.
- Production inspection found the prerequisite chain through migration 8 installed. Applied only additive migrations 9-20 in order; the empty-database-only base was not run. Final read-only inventory passed 92/92 tables, 38/38 triggers and 4/4 required integrity checks.
- Installed the 14 September candidate into the existing Babal app root. A server round-trip download matched 24,744,984 bytes and SHA-256 `5b908944bc289a20be2704206e77a7c7615a6c76ef1ca9b87d7b053017e4ad3a`. Node.js 22.23.2 started successfully with `app.cjs`.
- Production `/health` returned HTTP 200 and `marketplaceReady: true`. Anonymous `/`, `/shop`, `/login`, `/contact` and `/seller` passed at 1440/390/320 with no HTTP failures, overflow, console errors or page errors; `/seller` redirected to login.
- No cron, real message/email, test order or business-record mutation was used. Authenticated real-account, protected upload, mailbox and financial acceptance remain pending separate authorization. Full evidence and rollback boundary: `docs/deployment-consolidated-delivery-revision-2026-09-14.md`.

### Post-deployment seller registry, checkout presentation and Buy Now - 2026-09-14

- Owner reported that Super Admin could not see every registered seller. The local seller registry now lists all lifecycle states rather than only open applications, with owner/account, contact, location, document, product and order activity details; pagination and status counts are included. Existing review permissions and seller records are unchanged.
- Customer checkout now shows only the estimated arrival range alongside the authoritative delivery amount and total. Rate bands, base-fee/store-count formulas and preparation/transit calculation details remain available to Seller and Admin/Super Admin protected order views.
- Product purchase controls now provide both `Add to cart` and `Buy now`, following the supplied reference layout. `Buy now` submits the selected quantity through the existing trusted cart endpoint before opening checkout, preserves existing cart contents, and prevents the same local selection from being submitted twice during navigation.
- Fresh local verification after these changes: 237/237 automated tests pass; non-incremental TypeScript, application-scoped lint and touched-file whitespace checks pass. No build/browser/prod acceptance was claimed for this post-deployment increment. These changes are local only and require a new cumulative candidate plus separate deployment authorization before production installation.

### Database-driven homepage and footer revision - 2026-09-14

- Owner approved local implementation after reviewing the proposed homepage. Removed the four hard-coded fallback products; the page never presents sample inventory as purchasable products. Static hero photography remains editorial branding only.
- Added real eligible offer products, latest seller listings and an accessible Top products slider. Eligibility requires published/non-deleted product, active approved seller owner, active category, stock and image. Top ranking uses only delivered order items on delivered orders from the previous 90 days; returned/cancelled/non-delivered purchases do not contribute. When sales are insufficient, the fallback is explicitly “Featured by Hastabazaar” and contains only active independently approved homepage-promotion products.
- Product cards now show seller trading name and truthful Offer/New/Popular/Featured context. Active offer cards expose only public campaign name, eligible product count and end date; internal promotion notes remain private. No schema or historical-record mutation was added.
- Footer reorganized into Shop, account, help/policies and seller groups with support@hastabazaar.com. Mobile groups use two columns.
- Final local verification: 239/239 automated tests; TypeScript; application/verifier lint; fresh isolated Babal build; synthetic MariaDB browser acceptance at 390x844 and 1440x1000 with no failed HTTP responses, page errors or horizontal overflow, loaded visible product images and functioning slider controls. Generated and existing sample photographs stayed in isolated visual evidence only, never source/product uploads.
- Exact boundary and screenshot paths: docs/architecture/homepage-marketplace-local-2026-09-14.md. Synthetic database/app processes were removed and isolated MariaDB was shut down; ports 43876 and 13316 are free. Production remains unchanged and deployment still requires a new cumulative candidate plus separate explicit authorization.

### Super Admin homepage product controls - 2026-09-14

- Owner requires individual homepage control without deleting or unpublishing a product, managed by Super Admin. Added `/admin/homepage` with search and eligible/hidden filters plus the same per-product control on the moderation detail page.
- Hide/show applies to Offers, Latest and Top Products and to active-offer eligible counts only. The product stays published in the shop with its original URL, seller, stock, uploads and historical records unchanged.
- Authority is Super Admin-only at page, API and repository boundaries. Every state change requires a reason, writes an audit entry, uses an idempotency request identifier and rejects stale versions. Regular Admin and inactive/forged actors cannot mutate the control.
- Added ordered additive migration `0040_homepage_product_controls` and the corresponding Babal MariaDB migration. The cumulative manifest now reports 93 tables, 38 triggers and 22 migrations. No base/reset schema is authorized over existing data.
- The fresh cumulative automated suite passes 241/241 tests. TypeScript, scoped lint, fresh isolated Babal build and synthetic MariaDB/Playwright hide-and-restore flow also pass. Browser evidence covers 1440x1000 and 390x844 with blocked provider network, no failed responses/errors/overflow, unchanged published state, homepage removal and restoration. A separate filtered `/shop?q=...` path reached the existing generic error boundary during diagnostics; unfiltered `/shop` passed and the search defect was left unchanged for separate investigation. Exact boundary: docs/architecture/homepage-product-controls-local-2026-09-14.md.
- Production remains unchanged. A new cumulative release candidate, backup-first deployment review and separate explicit deployment authorization are still required.

### Cumulative homepage-controls deployment attempt — 2026-09-14

- Owner explicitly authorized deployment of all completed local work. Prepared `outputs/hastabazaar-cumulative-homepage-controls-2026-09-14.zip`: 24,763,828 bytes, 3,437 verified entries, SHA-256 `07646e7c2e818c0136c21358111ca1afb0fe5534271ee016b9cc63ffb86cf584`. Adjacent per-file manifest, SHA file and verification record were written without replacing prior releases.
- Fresh release gates: 241/241 tests, non-incremental TypeScript, application-scoped lint, isolated Babal build and synthetic MariaDB/Playwright homepage/control flow pass. Full repository lint separately reports 11 pre-existing legacy preflight/verifier findings.
- The cPanel browser-control helper failed before window selection and failed its one allowed reset/retry. No production backup, stop, upload, migration, extraction, restart or record mutation occurred. Production remains unchanged; exact continuation boundary is `docs/deployment-cumulative-homepage-controls-2026-09-14.md`.
