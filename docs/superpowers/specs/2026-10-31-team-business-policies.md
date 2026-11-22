# Team & business policies — workspace and operating coverage

Status: **approved by the user for the work plan, 31 October 2026**. Approval covers this five-tab workspace, department permissions, responsibilities, eligible backups, handoffs, temporary continuous service clocks and the operating targets below. Full-time coverage applies for now; exact fixed working hours are explicitly deferred. Actual member accounts, coverage and provider availability still need mapping. **Implementation remains on hold** until planning is complete and the user explicitly resumes work. No staff access, calendar, business setting, email or deployment has been changed.

Related: [master work plan](../plans/2026-10-30-seller-order-response.md), [decision register](../plans/2026-10-30-planning-readiness-review.md), [Overview/shared review](2026-10-30-super-admin-overview-review.md), [Sellers](2026-10-30-seller-management-workspace.md), [Products](2026-10-30-products-storefront-workspace.md), [Orders](2026-10-30-orders-customer-care-workspace.md), [Finance](2026-10-30-finance-payments-workspace.md), [manual-payment authority](2026-10-31-manual-payment-rules.md), [single-Super-Admin amendment](2026-10-31-single-super-admin-finance-approval.md), [fee publication rules](2026-10-31-fee-publication-schedules-combinations.md), [approved cancellation/return rules](2026-10-31-cancellation-return-rules.md), [Email delivery](2026-10-30-email-delivery-automation.md) and [Form Management](2026-10-30-form-management-reliability.md).

## 1. Purpose, approach and source evidence

Give Super Admin one place to answer: who can do this, who owns it now, who covers an absence, which service clock applies, and which policy version governs the work. A department is a way to organize responsibility; it is not an unrestricted access role. Assignment does not confer permission. An available family/team member must use their own authorized account, not a shared Super Admin sign-in.

Approved approach: **department templates with explicit permissions, one accountable task owner, eligible backups and a shared policy register**. This builds on existing access presets and the approved common review workflow. Using broad Admin access for everyone is simpler to configure but exposes unrelated decisions and evidence. Requiring a different employee for every department/approval would conflict with the small team and approved single-Super-Admin rule. The approved approach supports one person covering several areas while showing each duty separately.

Read-only source inspected:

- [Team access page](../../../app/admin/team/page.tsx): Super Admin entry, staff invitations, permission manager, assisted account recovery and history already have a home at `/admin/team`. Invitation expiry is seven days. These are source findings, not proof of the live deployment.
- [Permissions](../../../lib/marketplace/permissions.ts) and [staff access templates](../../../lib/staff/access.ts): existing action permissions and presets cover orders, support, seller/product review, publication, payout preparation and reports. Review and publication are separate. Some presets bundle adjacent work, such as product/customer-review moderation and support/privacy requests; the approved screen design must describe the actual bundle, not pretend a label narrows its server authority.
- [Permission repository](../../../lib/db/repositories/staff-permissions.ts): saved permission profiles, change/version checks and history exist. A missing legacy profile currently defaults to configurable Admin permissions; invalid saved profiles fail closed. New invitations must not briefly inherit that broad legacy fallback when narrow access was selected.
- [Staff authentication](../../../lib/auth/staff.ts) and [mutation guard](../../../lib/db/repositories/staff-mutation-guard.ts): reads and commits must use current account/role/permission facts. Existing tabs, email links and task ownership are not enduring authority after revocation.
- [Business settings](../../../lib/db/repositories/business-settings.ts) already distinguishes saved versions, effective settings and controlled publication; its generic editor cannot impersonate purpose-built editors. [Navigation](../../../lib/admin/navigation.ts) currently mixes staff, business settings, policies and program links across destinations. Consolidate navigation, not independent copies of their records.
- [Nepal calendar helpers](../../../lib/dates/nepal-calendar.ts) format dates; this inspection did not establish a configured staff coverage roster or business-hours scheduler. Those records are approved planned work, not existing capabilities.

Historical [staff operations documentation](../../architecture/staff-operations.md) describes broad role access and application approval verifying documents. The newer approved seller plan requires separate exact-document verification and activation checks. The new workspace must follow those later approvals, not revive automatic document verification or old two-person finance rules.

## 2. Screen layout and navigation

One Team & business policies workspace with five focused tabs:

| Tab | Main content and actions |
|---|---|
| **People & access** | Staff directory, invitations, exact access, permission changes, suspension/revocation and links to account security. |
| **Responsibilities & coverage** | Departments, queue owner, primary/backup coverage, active assignee, leave/handoffs, uncovered duties and overdue ownership. |
| **Service calendar** | Current full-time mode, clock explanations, holidays/availability exceptions and future working-hours drafts. |
| **Business identity** | Current company identity/contact/settings with evidence/status and links to their proper editors. No banking credentials. |
| **Policy register & procedures** | Current/scheduled/archived policies, accountable owner, scope, required actions, review history and authorized publication links. |

Header summaries: active staff, pending invitations, uncovered duties, access needing review and policy tasks due. Counts link to filtered records; do not count the same person several times as several staff members. Filter by department, account status, permission and coverage. Show explicit empty states such as No backup assigned; do not label a missing roster Healthy.

People table: name, verified account email, role, departments, effective work access summary, current availability, primary/backup responsibilities and relevant access-change date. Show account status, staff-role status, permission status and invitation status separately. A pending invite has no authority; delivery of its email does not mean acceptance. Do not describe Work access off as deletion of the person's buyer account.

Selecting a person opens their responsibilities and effective access with a before/after preview for changes. Each permission says what it allows and its limitations. Reserved actions are visibly Super Admin-only. Show inherited legacy access explicitly until reviewed. A department membership or team label must not imply document, payout, policy-publication or credential powers.

Ordinary staff get a limited **My responsibilities** view with their own access, active procedures, assigned work and current coverage contacts. They cannot browse all staff private details, alter grants, inspect private bank evidence or use the workspace's settings editor. The app's ordinary account-security menu remains accessible separately.

## 3. Permission and responsibility matrix

These are approved planning templates, not new grants. Apply only selected task capabilities and describe bundled capabilities truthfully. Final permission identifiers are builder choices; map every authorized action and evidence read to a server-enforced capability before enabling it. Never grant `admin.invite` merely because an old unrelated screen uses it as an entry gate.

| Team responsibility | Proposed ordinary staff access | Reserved or separately granted authority |
|---|---|---|
| **Seller operations** | Read permitted seller applications, check completeness, ask for corrections, record application-review decisions within existing seller-review authority, help sellers and prepare readiness work. | PAN/identity verification, sensitive document-change decisions, full seller-bank review, final public-profile publication, seller restrictions and enabling order acceptance remain with eligible Super Admin under the approved seller plans. Application approval alone verifies none of these. |
| **Products & storefront** | Product review, correction requests and customer-review moderation under the actual review permission. Catalog editing is selected separately. | Product publication is an explicit additional grant; Approve & publish needs both review and publication access and current readiness. No own-seller/product self-review. Commercial campaign or fee changes are not product-publication access. |
| **Orders & delivery** | Fulfillment, scoped cancellation/dispatch holds, shipping exceptions and customer updates within existing Orders authority. | Cannot confirm company money, verify seller identity, clear unrelated safety/finance restrictions or run held rider operations. Return entitlement decisions need the separate case-review permission. |
| **Customer care** | Complaints, feedback, permitted privacy-request work, return intake/clarification and customer communication. | Standard return/refund-entitlement review is a separate explicit grant. High-value entitlement decisions require Super Admin. A standard entitlement decision is not approval to send bank money. |
| **Finance preparation** | Prepare eligible payout/refund packets with masked beneficiary references; review ledger/reconciliation facts for assigned work. | Full seller-bank and customer-refund-destination evidence, outgoing packet approval/execution/paid recording, COD remittance approval, recovery allocations/write-offs and exceptions retain eligible Super Admin authority. |
| **Incoming-payment verifier** | A specifically designated Finance verifier may inspect scoped company receipt evidence and confirm an ordinary completed incoming payment exactly as approved in D7. | This is an explicit additional capability, not implied by payout preparation. Ambiguous/split/excess/late/reversed allocations, COD remittance and seller recovery repayment follow their Super Admin paths. Company bank evidence should omit unrelated transactions. |
| **Policies/operations coordinator** | Read applicable active procedures, maintain assigned review tasks and submit recommendations/evidence through permitted task records. | Cannot create/publish native reserved commercial/legal/settings drafts merely by owning a policy task. Super Admin uses the actual protected editor. |
| **Reports** | Read permitted operational summaries and recorded work within existing scope. | Reports access is not permission for full action audit, private identity/bank exports, staff access management or backup recovery. |
| **Super Admin** | Oversight and all permitted stages personally when necessary, including preparation and final finance decisions. | Still requires evidence, current versions, actual funds, readiness and conflict checks. Cannot fabricate verification, delete audit history or approve their own personally conflicted seller/customer/cash matter. |

Technical/system-health duties are now defined in the [approved System health & records design](2026-10-31-system-health-records.md), with the new backup program deferred. Map actual view/action capabilities before implementation. Do not add a generic Systems Admin role with bank, staff, form-publication or credential privileges; restricted actions remain with their explicitly authorized roles.

One eligible Super Admin is sufficient for refunds, payouts, COD, recovery and related financial approvals. Additional reviewers are optional. A department owner or backup is not a compulsory second approver. The company has one Super Admin now; do not require it to recruit another to use an otherwise valid flow. An own-personal-beneficiary conflict still needs an eligible independent resolution and must be shown as a specific blocked duty; ordinary company banking is not that conflict.

## 4. Invitations, access changes and offboarding

Recommended flow: Super Admin selects an account/email, ordinary Admin role, explicit template/permissions and duties; reviews the actual scope; saves the invitation; the intended verified account accepts within the existing seven-day period. Record invitation, access grant and delivery separately. The selected grant must be applied atomically with role acceptance, before that identity can access staff work. A new narrow invitation must not get broad rights from a missing permission profile. Never promote a person because their email appears in a task or department list.

Super Admin promotion must be a separate explicit full-authority action using the supported secure flow and current authentication; it is not a department template or prerequisite for being a backup. Do not add another Super Admin or invite anyone while planning.

Permission edits show Added / Removed / Retained, affected duties/tasks and sensitive-data exposure. Require a reason, fresh authority and current version. Templates are starting points: editing a saved template does not silently change every current member. Applying it to people needs an explicit person-by-person impact preview and audited grant. Ordinary Admins cannot change their own role/permissions; an active Super Admin may perform authorized staff management without an invented second-person requirement.

Existing legacy profiles get a Super Admin review list. Preserve actual effective access until explicitly changed; do not silently broaden, strip or mass-apply a new template during navigation migration. Invalid permissions fail closed. The directory must never claim a department restricts access that the underlying legacy grant still permits.

For leave, use availability and handoff; ordinary leave does not revoke account access. For revoked staff access or a compromised account, remove the affected authority immediately and invalidate its use on every subsequent server read/commit, including open tabs and private file links. Do not delay revocation until tasks are reassigned. In the same workflow mark affected duties for eligible reassignment, preserve drafts/history and flag gaps. Restrict the staff role separately from a full-account security block.

Prevent an ordinary access edit from removing the last usable Super Admin and leaving the business without a recovery path. Account-compromise containment must remain possible through the established secure recovery process; a last-admin warning is not permission to leave a compromised session active. Do not create an undocumented bypass, shared password, new recovery mechanism or second-Super-Admin dependency. Map actual recovery/revocation entry points during implementation.

Propose an access review each **30 calendar days**, plus an immediate review when duties change or someone leaves. Super Admin sees stale/inactive access, legacy broad grants and duties with no eligible cover. A review reminder does not expire legitimate access automatically or generate repeated notifications after completion.

## 5. Ownership, backups and handoff

Each department/queue records one accountable owner and an ordered list of eligible backups. Each actionable task has one active assignee, its original age/deadline, required capability, current stage and next action. Several people may help, but only one recorded assignee owns the next step. Review and payout-stage transitions may assign a new stage owner without changing the source case or resetting its deadlines.

Approved default routing: use the duty roster's eligible primary; when unavailable, route immediately to an eligible available backup; when none exists, show a coverage gap to the eligible Super Admin. Super Admin can personally cover several departments. Do not present that same person as an independent backup for their own absence. A queued task remains visible and unassigned if no eligible person is available; it is never assigned to a disabled, conflicted or unprivileged account to hide the gap.

For now, named member accounts and coverage handoffs will be entered when the plan is ready to operate. This document does not invent names, verify a live roster or assume a relationship grants authority. Full-time intent means the team should arrange handovers across the whole day, not that every family member is guaranteed to be awake or available continuously.

Backup selection uses both the needed permission and evidence-access scope. Seller operations may collect missing information while only Super Admin can decide a bank verification; a Finance assistant may prepare a payout while its approval waits for the eligible Super Admin. Do not bypass a reserved decision because the primary is absent. Where the only Super Admin is unavailable, expose the reserved-stage gap, retain the permitted operational work and customer update, and escalate through the configured contact/recovery arrangement rather than marking the decision complete.

Recommended handoff behavior:

- Planned absence: show open urgent/due tasks, propose an eligible substitute and record the handoff before absence. A substitute becoming active confirms receipt; unanswered handoff remains a visible coverage issue.
- Unplanned unavailability or lost permission: reroute immediately where a suitable backup exists; otherwise show Unassigned — coverage needed and notify Super Admin. Never reset the review clock.
- Urgent safety/credible harm: alert eligible duty staff and Super Admin immediately; do not wait for a routine reminder or office opening.
- Other unclaimed tasks: notify the eligible backup at the midpoint of their first-action allowance and escalate to Super Admin when overdue. For a two-hour cancellation target this means a backup alert at one hour, not a new two-hour allowance. If already overdue on discovery, escalate immediately. These routing milestones are approved; they do not change existing customer/decision targets.
- Claiming or reassigning uses current task version and authority. A backup can take over before expiry when authorized; update the active assignee and tell the former owner. Concurrent actions cannot create two decisions. Assignment and opening a notification are not substantive review/completion.

Missing future coverage is visible before a known absence, and immediately when detected unexpectedly. Do not auto-promote a backup or silently pause all store orders. If coverage cannot support a promised action, Super Admin must address the specific gap and communicate truthfully under the approved customer-update rules. Any separate new-order pause uses the existing authorized operational control and reason.

## 6. Full-time coverage now and working hours later

**Confirmed by the user:** use full-time team coverage for now. Fixed routine hours will be decided later. Do not record a Sunday–Friday 10–6 schedule as selected. The approved current service-calendar mode is **Continuous coverage — temporary**, in `Asia/Kathmandu`, including nights, weekends and holidays for team work. Availability gaps still require actual handoff and alerts; calendar labels are not evidence of staffing.

Approved clock convention for this temporary mode:

| Clock | Treatment |
|---|---|
| Elapsed hours | Run continuously from the saved event. Keep approved order 6/12-hour reminders, two-hour follow-up/cancellation action, 24-hour checkpoints/updates and return 24/48/24-hour targets unchanged. |
| Staffed hours | While continuous mode is active, count every hour; the four-staffed-hour incoming-payment target therefore falls four elapsed hours after a complete claim. A specific member going offline does not pause the team clock. |
| Staff business days | Count one service business day as **24 elapsed hours** in this continuous mode, two as 48 and three as 72. Apply to newly created staff review/instruction/inspection tasks under this calendar version. The user approved this interpretation together with these operating rules on 31 October 2026. |
| Calendar days | Retain their existing meaning, Nepal date calculations and approved deadlines. Recovery day-3/day-7 follow-up, commission notice periods and seven/fifteen-day return windows are unchanged. |
| Bank/carrier working time | Use the actual relevant provider schedule and contractual/saved terms. Full-time staff coverage does not mean a bank transfers money or a carrier collects parcels at night. Show the next supported provider step separately. |

No individual leave, missing assignee, email delay or system outage silently stops a clock. Apply only the already-approved specific operational holds where permitted. Keep original timestamps and supervision checks. Legacy customer/supplier commitments or a stored bank-business-day promise retain their original calendar; do not substitute this staff calendar for contractual terms.

When fixed hours are chosen later, Super Admin drafts the weekdays, open intervals, actual coverage breaks, holidays, after-hours roster and effective time. The preview shows deadlines/queues affected and uncovered elapsed-hour duties. Publish a new calendar version prospectively. Newly created tasks use it; existing saved due times and policy versions remain intact. Any factual deadline correction needs a reason, history and explicit allowed adjustment; changing office hours cannot extend a payment cutoff or hide overdue work. Declaring a day closed never cancels approved elapsed-hour responsibilities.

Do not silently translate one business day into an arbitrary number of hours for the later fixed schedule. That schedule must explicitly define its staffed-day length and deadline calculation before publication. Current templates show the precise due time plus the calendar name/version, so staff need not mentally calculate whether Saturday counts.

## 7. Service targets and daily Finance coverage

Carry forward all approved targets; the Team screen assigns accountable people and the right clock, it does not make a fresh promise for every queue. Approved additional D5 target: first meaningful review of a **complete new product submission within one service business day**. In temporary continuous mode under section 6 this is 24 hours. Approval/publication is never automatic when that target passes. A specific correction request or reasoned review action counts; opening the page does not. The already-approved one-business-day published-product revision and routine-profile targets remain unchanged.

Seller application/document/bank work keeps the approved stage-specific targets, including one-business-day first bank/material-identity change triage. Do not make all initial optional registration fields compulsory to start the clock. Count complete evidence from the action-specific requirements and preserve first submission age when asking for clarification.

Approved Finance operating pattern (31 October 2026); actual named staffing/provider coverage remains to be mapped:

- Incoming receipt verification and urgent authorized refund work stay covered continuously under their approved targets; they do not wait for a daily payout batch.
- A named Finance owner checks the payout-ready queue **daily at 2 PM Nepal time**. Eligible Super Admin handles approvals and manual bank execution when the actual banking channel is available. One eligible Super Admin may handle the entire flow.
- Reconcile activity and unresolved/uncertain instructions **daily at 6 PM Nepal time**, with material discrepancies raised immediately rather than waiting for that checkpoint. This is an approved daily operating check, building on the approved business-day reconciliation minimum.
- These are review/reconciliation appointments, not promises that every seller is paid at 2 PM. Actual funds, seller request/eligibility, destination, holds, original contractual due dates and bank completion still govern. Existing earlier obligations and urgent refunds take priority; do not defer them to the next batch merely for convenience.
- If a bank channel is unavailable, show Ready for bank processing and the supported next action, retain the original obligation and notify the owner. Do not retry uncertain transfers automatically or record Paid from approval. Do not reinterpret fixed-supply contractual deadlines or require a separate Finance employee/second approver.

D9 standard payout purpose with an optional note is now approved. The daily queue rule retains the seller explicit request and does not add a mandatory note or automatically execute payouts.

## 8. Business identity and policy ownership

Business identity shows the company's legal name, registration/tax references, business address and public contact details with current evidence/status, reviewer and effective record. Do not assert that a saved value is externally verified merely because it is filled in. Operational changes use the protected existing editor with a reason and impact preview. Preserve invoice/order/company identity snapshots. This section does not reopen content-language, translation, public-contact exposure or badge policy design.

Link company receiving accounts to Finance; seller payout accounts stay in their restricted seller/Finance workflow. Do not duplicate full account details into the team directory or general policy record. Credentials, bank passwords, PINs and OTPs never belong in these forms or notifications. Account-security controls remain in the account menu; System health owns operational diagnostics and recovery.

The policy register has one row per canonical policy family with: plain name/purpose, owner, authorized publisher, applicable staff/seller/customer audience, current version/effective time, scheduled successor, review task/due date and history. Distinguish Draft, Scheduled, Current, Superseded and Withdrawn as supported by the real policy lifecycle. A staff procedure is not an accepted seller contract; a read acknowledgment is not consent to a fee change.

Recommended ownership map:

| Policy/work family | Responsible coordinator | Actual editing/publication home |
|---|---|---|
| Company identity and operational service calendar | Super Admin / named business coordinator | Team & business policies, using the canonical protected settings/calendars. |
| Staff access and duties | Super Admin | People & access and Responsibilities; exact grants/roster history. |
| Seller verification, document changes and activation procedures | Seller operations; Super Admin final authority | Seller workspace and approved procedure record; no copied verification button in the register. |
| Product submission/review rules | Product lead | Product workspace and controlled form/policy editor; core requirements follow the approved form rules. |
| Fulfillment, cancellation, returns and care procedures | Orders/customer-care lead | Orders and protected procedure records; approved cutoffs/rights remain intact. |
| Payment, refund, payout and recovery procedures | Finance; Super Admin financial authority | Finance and applicable protected policy/settings records. |
| Commission, commercial programs and promotions | Super Admin; departmental recommendations | Fees, programs & promotions. Preserve full notice, exact consent and historical order terms. |
| Form Management, email recovery, incidents and technical procedures | Named authorized technical owner; Super Admin restricted controls | [System health & records](2026-10-31-system-health-records.md), approved for the active scope; the new backup program is deferred. Existing Form/Email policies remain approved. |

Policy owners keep evidence and propose improvements; ownership alone grants no native publication privilege. Super Admin sees the exact version and impact, uses the authorized editor and receives a saved outcome. Scheduled replacements, fees, consent and customer rights follow their approved rules; a generic policy Save must not bypass those flows. A review due date creates a task, never an automatic policy change or expiry that removes rights.

For staff procedures, use the approved version-specific acknowledgment when assigned to a duty or a materially changed procedure. Show Read / Not yet acknowledged separately from task completion. Acknowledgment does not verify documents, accept on behalf of a seller, reset any deadline or automatically block urgent customer care. The owner follows up on missing training/acknowledgment; any actual access restriction is a separate reasoned Super Admin action. Do not invent a blanket monthly legal-policy replacement schedule.

## 9. Notifications, security and resilient forms

Use the existing approved bell/dashboard/email plan. Work goes to the eligible current owner and relevant backup/escalation recipient, with Super Admin oversight of unassigned, overdue, sensitive and access/coverage issues. Do not send every routine event to every Admin. Show restricted links only to entitled people and recheck eligibility when opened and immediately before sending. Bank/identity evidence stays out of email previews.

Assignment changes update the same task, suppress queued former-owner reminders and create only the relevant handoff notice for the new owner. If one person is both owner and Super Admin, consolidate recipient delivery for the same event/milestone instead of sending duplicate copies for each role. A midpoint backup alert and later overdue escalation are distinct only while still relevant. Shared read status is not an acknowledgment of duty, and acknowledging a duty is not a completed decision. Automatic mail retries/recovery remain approved and never perform access or money mutations.

Use stable core access/coverage fields under Form Management. Only show extra grant/draft fields when the action needs them; optional context must not block saving. A missing cosmetic form configuration cannot create a privileged fallback. Existing core workflows may use only the approved validated fallback compatible with current server rules; preserve unsent input and show a specific recovery route when safe submission is unavailable. Repeated Save/invitation/handoff retries share one operation identity and current version.

Permission, policy, coverage and deadline changes have actor/time/reason/history. Reads of private evidence and exports stay purpose-limited. UI hiding, report filters, assignment, invite links and email addresses are not authorization checks. Revoking access must affect search, counts, APIs, evidence and old deep links, while keeping audit facts intact. Drafts/history from an unavailable person remain under authorized organizational handling; reassigning a duty does not expose that person's unrelated private account data.

## 10. Mapping and later verification

Map `/admin/team`, business settings, applicable governance tasks and legal-procedure links into this workspace without duplicate settings or a second review queue. `/security` remains in the account menu. Finance owns company-account and money records; Fees owns commercial terms; System health owns forms, mail, diagnostics and recovery. Preserve bookmarks/deep links and existing private-data boundaries. Unknown or mixed-scope routes need explicit task-level placement before removal.

Later implementation must verify: narrow invitation acceptance without transient broad access; pending/revoked/expired invitation races; legacy versus invalid profiles; explicit publication grant; standard entitlement versus actual bank approval; Finance-verifier boundaries; prohibited own-interest cases; sole-Super-Admin operation and absence; immediate revocation while old tabs remain open; last-admin recovery safeguards; concurrent claims/handoffs; uncovered queues; mixed department permissions; current owner/backup notification deduplication; continuous staffed/business-day calculations; future calendar versioning; existing due-time preservation; actual bank availability; daily queue/reconciliation checks; and form failure/input recovery. Use fictional identities/controlled clocks/simulated money only after work resumes. Do not alter the canonical local database to make checks pass.

Subsequent [D21 scope](2026-10-31-retail-categories-product-variants.md) adds category eligibility and relevant product review work for new retail/resale and real variants. Map actual eligible reviewers and any category specialty to the existing explicit capabilities/ownership rules; category assignment alone grants no new document, product-publication or Finance access.

D22 [optional intake/support and oversight](2026-10-31-optional-product-intake-support.md) keeps department ownership while requiring Super Admin email/dashboard notices for operational events. Map eligible assistance owners/backups; routing or forwarding cannot grant private-cost, bank/document or publication access. The one-service-business-day first assistance triage is now approved with D22, distinct from the existing complete-product review targets. In the current continuous calendar this is 24 elapsed hours; retain both assistance history and the first complete-review timestamp.

## 11. Approval status and decisions still open

- [x] Record the user's full-time coverage direction for now. Exact fixed working hours are explicitly deferred until later; no 10–6 schedule has been chosen.
- [x] Approve this five-tab workspace, department/permission templates, reserved authority, explicit grant lifecycle, privacy and policy ownership.
- [x] Approve one active owner, eligible backups, handoff rules, midpoint unclaimed-task alert and overdue escalation; name actual eligible member accounts/coverage before operating the workflow.
- [x] Approve the temporary continuous-clock interpretation: staffed hours count continuously; a new staff service business day is 24 hours, without changing saved contractual/bank calendars or existing deadlines.
- [x] Approve first new-product review within one service business day, daily 2 PM payout queue review, daily 6 PM reconciliation and 30-calendar-day access review. Existing approved target durations and single-Super-Admin authority are not reopened.
- [ ] Finalize named responsibilities, restricted-stage/on-call coverage and actual provider availability. The sole Super Admin can cover duties but cannot be their own independent absence backup.
- [x] Approve the paired seller/customer walkthrough for the [complete-version checklist](../plans/2026-10-31-complete-version-scope.md). D19 price/public-preview behavior is approved; all active work is required in this version. D9 standard payout purpose with an optional note is now approved. System health & records is approved with its new backup program deferred; QR/gateways, fixed working hours, new language/public-content policy and unsupported rider operations remain deferred/excluded.

Approval records a planning decision only; it does not invite staff, publish a calendar, send notices or resume implementation. All implementation and deployment remain on hold.
