# Hastabazaar consolidated scope — 13 September 2026

> Historical planning snapshot. Later approvals and implementation in the chronological change register supersede the pending gates below. Current cumulative status is in [consolidated-local-completion-2026-09-14.md](consolidated-local-completion-2026-09-14.md).

Status: final scope review prepared; source implementation has not started. Owner closed intake for this cycle and requested finalization/start. This document consolidates R002–R022 in change-register-2026-09-13.md. Individual decisions already approved remain approved. Recommendations explicitly identified below require scope acceptance or later targeted decisions; they are not implied monetary or identity policy.

## Release and operational boundaries

- Babal.Host cPanel only; target Node 22.23.2, MariaDB, application root /home2/hastabaz/hastabazaar-app, startup app.cjs. No new hosting, paid subscriptions or OpenAI/ChatGPT branding.
- No deployment, release upload, production migrations, cron activation, messages/emails or live record changes. Separate explicit deployment authorization remains required after final scope and cumulative local review.
- Preserve all existing uncommitted source changes, database data, media, authentication and privileged access. Do not reset, checkout over, bulk-format or commit unrelated changes. Review and snapshot the actual current source rather than relying on HEAD as the baseline.
- Preserve historical policies, order totals, rewards and discounts. Public support remains support@hastabazaar.com. Credentials, tokens, OTP values and session URLs must not be displayed or logged.
- Latest preserved cumulative LOCAL candidate: outputs/hastabazaar-customer-section-three-2026-09-13.zip; SHA-256 d2b82a4bec5d899d9aace0647fdd9b3bc212745d5e8440804403579e99a1764d. Last known deployed: outputs/hastabazaar-delivery-maps-2026-09-11.zip. Never overwrite these ZIPs or their reports.
- Sections 1–3 are previously locally verified, not production accepted. This scope review reruns no application tests. Recorded 100 tests are historical for this phase. Local Windows Node 22.23.1/MariaDB 11.4.9 are not exact Babal parity.
- Never import base/reset schema over existing data. New additive migrations and readiness requirements will be designed per subsystem and tested only on fresh synthetic databases.

## Complete request coverage

| ID | Resulting scope | Acceptance focus |
| --- | --- | --- |
| R002 | Confirm password in email/password signup; matching required on client and server, confirmation never stored. | Mismatch rejected; valid signup and existing mailbox-verification transition retained; Google flow unchanged. |
| R003 | Archive/delete blocked until all related obligations are settled, across every related order. | Explain blockers; enforce server-side; preserve history and Super Admin unpublish/suspension. Detailed settlement boundary is a decision gate below. |
| R004 | Email/in-app notifications for affected recipients and people needing action; contextual links and section visibility. Minor unrelated actions do not generate notifications. | No duplicate/broadcast leakage; clicking opens authorized record without performing mutation; audit remains separate. |
| R005 | Approved sellers switch customer/seller workspace within the same account/session. | Both directions work, including mobile; switching grants no new permissions. |
| R006 | Remove Rs. 1,000 seller payout minimum while retaining positive available-balance and settlement/approval controls. | Eligibility queue, request, preparation and UI agree; zero/negative/ineligible balances remain blocked. Customer wallet withdrawals remain disabled. |
| R007 | Super Admin chooses gift-card value; random unique redemption code; redemption creates shopping-only credit. | Super Admin-only issuance, safe code handling, one redemption, correct ledger attribution, no deposits/withdrawals; issuance/redemption policy gate below. |
| R008 | System-generated SKU for each new product, unique across sellers. | Concurrent creation/retry safety; no manual required SKU; existing SKU/history preserved and uniqueness conflicts handled without automatic renumbering. |
| R009 | Others option in both categories and occasions. | Extend existing active taxonomy without duplicate entries. Proposed first version: selectable fallback without new free-text public taxonomy. |
| R010 | Warranty/guarantee Yes/No with flexible days/months/years. | Do not require every unit. Proposed Yes rule: at least one positive unit, other units blank/zero; preserve old free-text warranty on existing products. |
| R011 | Asterisks and required-field explanation wherever fields are mandatory in the reviewed marketplace forms. | Labels and conditional/server rules agree; preserve accessible required semantics; do not convert optional fields to required. |
| R012 | Four useful product photos from different angles for new listings; separate optional video. | Keep optional fifth image; preserve existing listings/media without retroactive four-photo enforcement; explain angles honestly. Safe video bounds/storage must be specified before uploads are added. |
| R013 | Remove Producer or maker and Materials inputs; Story and details becomes Product description; preparation label becomes Time needed to prepare the product (days). | Remove hidden validator requirements for new listings; preserve old values/history; estimates unchanged by wording. |
| R014 | Admin progress/records view and comprehensive Super Admin business-action audit. | Accurate current counts versus historical events, actor/time/outcome, next actions, links, filtering and role visibility. Do not fabricate past events or capture routine browsing as business actions. |
| R015 | Clearer Order emails administration. | Explain queued/sending/retry/mail-server-accepted states, actual send-button effect and next steps; link orders; no promise of inbox delivery/read receipt. |
| R016 | Calculated product discount percentage beside current/original prices; include seller preview and customer cards/detail. | Derived from stored prices, no independent discount field or wallet/referral mixing. Proposed display: one decimal when needed; never advertise 100% off a positive-price product through rounding. |
| R017 | One delivery charge per order, Super Admin district/zone rate settings, clear checkout explanation; track actual courier costs per parcel separately. | Initial Rs. 150/180/250 retained until owner changes settings; future orders use saved rate version, old totals remain; no per-seller customer surcharge or automatic seller deduction. |
| R018 | Cancellation until seller parcel is ready for pickup; immediate processing; custom-made work started goes to staff review. | Eligibility per seller parcel, race-safe cutoff and notification, no added 24-hour hold; partial financial policy gate below. |
| R019 | Verified rider workflow: Super Admin approval, Admin assignments, customer/rider switch, job/progress workspace, one delivery-proof photo OR video, staff confirmation, optional OTP method not required for COD. | Assigned-only access, suspension/reassignment revocation, private proof, manual destination fallback and active-device GPS. Super Admin can configure applicability; proof/open-box/OTP are distinct policies. Verification/evidence gate below. |
| R020 | Super Admin manages individual Admin feature/action permissions and reusable role presets. | Server authorization and UI agree, existing privileged access survives additive transition, no self-escalation, Super Admin-only actions remain reserved and maker-checker protections retained. |
| R021 | Individual/Company seller application and PAN/VAT/Both document selection with at least one certificate. | Private evidence, no fake company fields for individuals, preserve existing applications/tax identifiers; document matrix gate below. No automatic tax-calculation change. |
| R022 | Exceptions show responsible person, next action and history, connected to rider dashboard, notifications and audit. | Follow existing parcel/case/incident states; no duplicated ledger or fabricated settlement. See ownership table. |

## Exception workflow and ownership

Each exception shows type, order/parcel or case reference, status, responsible person/team, next action, created/updated times, supporting evidence and append-only history. If nobody has been assigned, show Unassigned operations queue instead of pretending somebody owns it. Reassignment notifies the new responsible person. Only users with the required effective permission can act or view private evidence.

| Exception | First report | Who acts next | Permitted progression |
| --- | --- | --- | --- |
| Failed delivery | Assigned rider records reason | Assigned operations Admin | Review and authorize retry, reassignment or return-to-origin; actual fulfillment stays truthful. |
| Customer unavailable | Assigned rider records attempt | Assigned operations Admin | Review contact/next-attempt arrangements and assign next action; do not send unapproved SMS or invent contact. |
| Rejected delivery proof | Authorized staff records rejection reason | Assigned rider | Submit replacement proof; staff reviews it. Retain original proof/history; proof alone does not mark cash collected. |
| Incorrect cash entry | Rider/staff reports discrepancy referencing entry | Authorized finance/operations reviewer | Investigate and retain a tracked unresolved incident until an approved adjustment exists. Posted cash entries remain immutable. No automatic balancing or write-off. |
| Cancelled parcel | Valid cancellation event | Assigned operations Admin, with finance reviewer where needed | Verify stock and credit/refund/cash obligations; resolve only after recorded requirements complete. Other parcels continue independently. |

Resolution requires recorded evidence and appropriate role checks. A next-action button opens the underlying authorized workflow; it does not bypass approval. The scope includes tracking an incorrect-cash incident, not an unspecified new financial correction engine.

## Architecture and implementation approach

Recommended: extend existing repositories, protected routes, role system, parcel state machines, promotional ledger and outboxes in staged changes. A full rewrite would risk current commerce/history, while adding separate dashboard-only systems would leave direct APIs unprotected and duplicate records. Neither is needed for this request.

Use existing audit_logs for business-action evidence and existing operational records for source truth. Add missing event coverage transactionally with state changes. A small explicit event/recipient/destination inventory determines which events also enter notifications. Reuse the order-email sender safeguards; general dashboard notifications must not become a second sender for the same order event.

Extend staff authorization with effective per-person permissions and preserve reserved Super Admin authority. Inventory hard-coded role checks as well as can()/requireStaff paths; restricting menu visibility alone is insufficient. Default migration retains existing legitimate access until Super Admin configures changes. Permission revocations must apply to active sessions on subsequent requests.

Reuse shipping_jobs/shipping_parcels for rider work and partial cancellation. The older whole-order path remains compatible and must not bypass new restrictions. Delivery completion, customer cash collection, remittance and seller payout remain separate evidence-backed events.

Use additive, versioned configuration for delivery rates and approved delivery-proof policies. Snapshot applied commercial rules on new records. Do not silently modify existing orders or infer historical verification. Product videos are public only under the same product-visibility rules as images; rider proof and seller documents are private.

## Work groups and verified source map

These are execution boundaries, not a claim that each feature is already implemented. Detailed executable plans are prepared per group after its necessary decisions are settled; do not write one giant speculative patch.

1. **Signup and straightforward product-form improvements** — R002, R009–R011, R013, R016. Existing surfaces: app/register/page.tsx, app/api/auth/register/route.ts, components/seller/product-submission-form.tsx, lib/products/submission.ts, lib/db/repositories/products.ts, app/products/[slug]/page.tsx, components/catalog/product-card.tsx. Start with confirmation/matching and copy/required-label consistency, then structural fields with preservation tests.
2. **Access and account foundations** — R005, R020, R021 and rider identity portion of R019. Existing surfaces: lib/marketplace/permissions.ts, lib/auth/staff.ts, lib/auth/sign-in-destination.ts, app/admin/team/page.tsx, components/admin/staff-invitation-manager.tsx, lib/sellers/application.ts, lib/db/repositories/seller-applications.ts, seller/account navigation. Build permissions before exposing new staff mutations; settle identity document matrix before onboarding schema.
3. **Product identity and media** — R008, R012 plus dependent product validators. Existing product create/revision API/repository, protected product-media handler and product gallery. Add SKU generation and constraint handling; implement four-photo new-listing requirement and bounded optional video without replacing old media.
4. **Commercial controls** — R006, R007, R017. Existing lib/marketplace/policy.ts, lib/db/repositories/payouts.ts, lib/db/repositories/wallet.ts, lib/checkout/validation.ts, lib/db/repositories/orders.ts and lib/operations/parcels.ts. Remove payout minimum consistently; introduce rate configuration; implement gift cards after its policy gate. Track courier cost separately from COD and payout entitlement.
5. **Cancellation and product closure** — R018, R003. Existing customer cancellation route and lib/db/repositories/fulfillment.ts, lib/operations/parcels.ts, product archive/delete routes, wallet/returns repositories. Agree partial money rules first, then add transactional eligibility and adjustments with race tests. Expose exact unresolved obligations before archive/delete.
6. **Rider operations and exceptions** — R019, R022. Existing app/rider/page.tsx, app/api/rider location routes, lib/delivery/repository.ts, components/delivery/rider-sharing.tsx, parcel operations and incident/case repositories. Add verified identity, proof/progress review and explicit ownership; preserve foreground-only sharing and staff financial authority.
7. **Unified visibility and notifications** — R004, R014, R015, R011 cross-dashboard pass. Existing notification_messages, audit_logs, order_email_jobs, lib/operations/email-queue.ts, app/admin/order-emails/page.tsx and admin/account navigation. Instrument earlier groups as they are implemented; finish the event coverage matrix, role-scoped activity views and plain-language queue operations here.
8. **Cumulative local acceptance and candidate** — cross-role browser journeys, security/financial regressions, additive migration acceptance and release identity. Keep all earlier release ZIPs and reports, produce a new cumulative candidate and manifest only after checks pass.

## Remaining decision gates and recommended review choices

These items are deliberately planned and remain visible; dependent implementation must wait for the indicated rule rather than silently inventing it. They do not prevent source mapping, test design or the already defined portions of other groups.

| Gate | Decision needed | Recommendation or boundary |
| --- | --- | --- |
| Partial cancellation money | Single delivery fee after one/all parcels cancelled, precise credit/discount restoration and outstanding COD adjustment | Keep one delivery fee if any parcel remains; remove it if all parcels cancel before fulfillment. Restore only credit allocated to cancelled items; do not shift costs/credit onto unrelated parcels. Validate against existing allocations before presenting exact examples for approval. No new adjustment executed before approval. |
| Product fully settled | Whether unexpired return eligibility alone blocks archive; treatment of attributable payout/reserve holds | Distinguish open obligations from possible future claims. Preserve aftercare even for archived products. Owner must approve the final predicate; no aggregate delivered flag shortcut. |
| Gift-card policy | Recipient-bound or bearer code, expiry, amount limits | Propose one-time bearer redemption into the signed-in account, no expiry for the initial version, and positive amount within existing safe integer-money limits. These are proposals, not approved restrictions; show final policy before issuance implementation. |
| Seller documents | Exact Individual/Company fields, PAN/VAT/Both evidence | At least one certificate is already required. Proposed Both means upload both selected certificates; Individual should not require fictitious company registration. Confirm the document matrix before persistence changes; no tax/legal eligibility inference. |
| Rider verification and evidence | Required identity/contact evidence, video bounds/retention, initial open-box settings | Super Admin manually approves; retain application evidence privately. Show the concrete document checklist before implementation. Require one photo or video for rider handover; open-box/OTP initially inactive unless explicitly selected. OTP capability remains planned, with email suggested but channel not yet approved. No SMS integration or background app. |
| Media technical bounds | Product/rider video duration/size/format and storage limits | Choose documented conservative limits after checking the current Babal upload/runtime constraints and local validation options. No provider purchase or live preflight under hold; any unresolved production limit remains a deployment gate. |

The default proposals in R009/R010/R012/R016 above are reversible product choices offered for this scope review. Other approved requirements are not reopened. These decisions cannot authorize messages, live data changes or deployment.

## Verification and completion evidence

- Before code changes, record a fresh workspace/source snapshot and current baseline diagnostics without overwriting build output or existing databases. Use the installed runtime/dependencies; no speculative upgrades.
- For meaningful behavior changes, write focused failing regressions first, then implement and verify. Do not create tests that only duplicate copy changes. Record exact commands/results and per-request status in the change register.
- Run npm test, TypeScript via npx --no-install tsc --noEmit --incremental false, and application-scoped lint with npx --no-install oxlint app components lib tests middleware.ts plus touched scripts. Broader inherited lint issues stay explicitly reported.
- Run the Babal build in a separate source/build directory using npm run build:babal. Never run npm run schema:babal against existing data or treat a base schema as an incremental migration.
- Fresh synthetic MariaDB only; SMTP/provider effects disabled. Validate new additive migrations twice, readiness/table/trigger requirements, concurrent permissions/cancellation/redemption changes, integer-paisa financial reconciliation and old snapshot preservation.
- Browser acceptance at 320/390/1440 px with keyboard/error/focus and zoom checks; guest/account receipt protection, customer/seller/rider switching, two Admin permission profiles, Super Admin-only controls, inaccessible stale assignments, media rejection, exception next-owner and notification destinations.
- Verify original release hashes and source preservation. Build a new cumulative ZIP and adjacent per-file manifest, exclude secrets/data/test media, read/hash all archive entries, and report limitations. Stop synthetic app/database servers after verification.
- Local results are not production verification or field Core Web Vitals. Pending Babal compatibility, backups, production migration/deployment acceptance and designated inbox testing remain outside this phase until separately authorized.

## Review checkpoint

All 21 modification requests R002–R022 are represented above; R001 is the handoff/control request. The approved 24-hour-hold replacement, fixed-by-Super-Admin gift-card value, four-angle photos and selective notifications take precedence over earlier wording in the chronological register.

Confirm this consolidated scope and staged approach to begin local implementation without repeatedly approving already agreed modifications. Business decision gates above will receive concrete examples/checklists before their dependent changes. Separate final deployment authorization is still required regardless of local scope approval.
