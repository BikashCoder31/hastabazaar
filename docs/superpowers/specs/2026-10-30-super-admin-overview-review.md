# Super Admin Overview and shared review workflow

Status: Overview and shared review workflow approved by the user on 30 October 2026. Approval covers the described Overview layout, work queue, shared review steps, scoped decisions, saved outcomes and notification/resolution behavior. The separately listed unresolved business policies are not silently decided by this approval. Implementation remains on hold until planning is complete and the user explicitly resumes work. No implementation or deployment is claimed.

Latest [D22 requirement](2026-10-31-optional-product-intake-support.md): every operational notification appears for Super Admin by email and shared dashboard/bell, including new seller applications, products needing review and product-support requests. The Overview links the same task; read status is shared, resolution remains separate, delivery retries are automatic, and source-event/recipient/channel deduplication prevents repeat role copies.

Scope clarification: the user removed item 7, Language and public content, from the earlier decision list. Products may use product-specific content and will often be English. This phase does not change product-language requirements, translation fallbacks, public contact-detail policy or verification-badge meanings. The earlier eight-area admin navigation proposal remains intact; this clarification does not approve merging Fees, programs & promotions into Finance or reducing navigation to seven areas. It refers to the decision-list item, not an existing Language admin section.

Related: [master work plan](../plans/2026-10-30-seller-order-response.md), [planning review](../plans/2026-10-30-planning-readiness-review.md), [Seller Management](2026-10-30-seller-management-workspace.md), [Seller Center](2026-10-30-seller-center-workspace.md), [Form Management](2026-10-30-form-management-reliability.md) and [Email delivery](2026-10-30-email-delivery-automation.md).

The [approved Team & business policies design](2026-10-31-team-business-policies.md) settles staff capabilities, ownership, backups, policy responsibilities and temporary continuous service clocks. Full-time coverage and operating rules are approved; exact fixed hours are deferred. The [approved System health & records design](2026-10-31-system-health-records.md) extends shared review to technical incidents without broadening business approval rights; its new backup program is deferred until the wider setup is established.

## 1. Purpose and existing foundation

Overview should answer: What needs attention? Who should handle it? What is the next action? A shared queue opens the appropriate seller, product, order, payment or system task. A seller's embedded task list and a global queue use the same work item, decision and history.

Local source already provides permission-filtered queue summaries and operational/account statistics in `app/admin/page.tsx`; this design builds on that foundation. It does not claim a new unified review flow is present or verified in production. Preserve useful reports under an explicit reporting period while putting actionable work first.

Approved approach: a compact Overview with a shared work queue, opening a full-width record workspace. A narrow drawer is suitable for a quick summary but not the whole private document comparison and decision flow. Do not put every form on the home page or duplicate financial/review records for each route.

## 2. Overview layout, from top to bottom

| Area | Contents and behavior |
|---|---|
| Header | Overview title, permitted search, notification bell, account menu and Last updated time. Search sellers/products/orders by suitable name or friendly reference; no broad search of private bank/identity numbers. |
| Urgent issues | A compact strip only when actionable incidents exist: stalled email, unavailable core forms, genuine critical order/payment issues. Each shows the problem, owner, current recovery state and Open issue. Missing health data displays Unknown/unavailable rather than All clear. |
| Work summaries | Five focused cards: Seller & document reviews, Product reviews, Order follow-up, Payment & payout reviews, and System issues. Each gives a clearly labelled task/incident count and opens its matching filtered queue. Show unassigned and overdue subsets only when their meanings are established. |
| Main work queue | Default Needs attention view, with Assigned to me, Unassigned, Waiting and Completed views. Type, department, owner, priority and date filters. Retain selected filters and scroll position on return. |
| Recent decisions | A short list of actual saved outcomes, actor and time, linking to the affected record. Full history is separate. Do not confuse notifications sent or drafts saved with completed reviews. |
| Operational summaries | Secondary or collapsed sales/order/account totals with an explicit time period and accurate labels. Financial summaries show the actual basis and currency; sales do not imply available payout money. |

The five work-summary cards are views of permitted tasks, not a sum of unique sellers. One seller may have several distinct pending tasks. Use one canonical task ID and count each task once within a defined count; explain overlapping filters. Do not calculate All pending by adding overlapping card subsets. A failed count request must not become zero.

Desktop uses a compact summary strip and readable table with a focused record view. Mobile stacks the same summaries and uses task cards. Keep search, filter state, next action and access to all permitted tasks available without relying on wide horizontal scrolling. Use clear text, visible focus and status icons as well as color.

## 3. Work queue and priority

Each queue row/card contains:

| Field | Meaning |
|---|---|
| Priority / due state | Urgent, Overdue, Due soon or routine only when backed by a defined policy; do not invent a review deadline. |
| Task | A specific action such as Review PAN document, Review product correction or Follow up on order response. |
| Record | Shop/product/order name and friendly reference, with only necessary permitted identity information. |
| Next action / responsible party | What is needed and whether staff, seller, customer or a system recovery process acts next. |
| Owner | Eligible assigned staff member, responsible department or visibly Unassigned. Assignment is not new permission. |
| Age and deadline | Submission/update time and the applicable due time in Nepal time. If no deadline is agreed, show age without labelling it overdue. |
| Status | The shared task state, not an ambiguous account-wide Active/Verified badge. |
| Action | Open review or the appropriate specific work action. No blind Approve button in the list. |

Approved ordering: confirmed urgent safety/access/financial incidents and core service outages first; then overdue actionable orders and cases; then overdue reviews; then oldest waiting-for-staff tasks. Use category filters and a stable time tie-breaker. Display the reason for priority rather than a hidden score. Queue order does not cancel orders, release payouts or activate sellers.

Order follow-up preserves the approved seller reminder after 6 hours and admin escalation after 12 hours, from the same actionable time for that seller's eligible portion, using elapsed hours displayed in Nepal time. Payment/COD holds must not start preparation reminders early. The user also approved staff follow-up within 2 hours after escalation, a 24-hour Super Admin checkpoint and return/clarification target durations; the elapsed return/clarification convention is also approved in the cancellation/return supplement; map named coverage before enabling them. Commission-term deadlines and the approved automatic email retry policy are separate and unchanged.

Assignment/reassignment records who changed the owner and when. Recommend a reason for reassignment of an in-progress sensitive review. Staff may claim only eligible tasks; two reviewers cannot silently take ownership or overwrite a later decision. Assignment helps coordinate work but does not substitute for transaction-time authorization and version checks. Bulk assignment may be considered; bulk evidence verification, activation and financial approval remain excluded.

## 4. Shared task statuses

| Status | Display and next step |
|---|---|
| Awaiting review | Submitted and awaiting authorized staff action; distinguish Unassigned from assigned. |
| In review | A reviewer has started; show owner and last activity. This is not verification or approval. |
| Waiting for seller/customer | A specific correction/information request was saved and the next action belongs to that party. Preserve the reviewer and task history. |
| Waiting for prerequisite | A dependency is missing; identify it and its owner. Distinguish automated recovery from an actual staff correction. |
| Completed | This task's specific decision/action is saved. Show Verified, Changes rejected, Published or the precise outcome as appropriate; do not imply unrelated checks passed. |
| No longer needed | Resolved elsewhere, superseded, withdrawn or cancelled with an actual source-state reason. Retain history. |

Notification unread/read status, email delivery, task state, application approval, document verification, product publication, ordering and payout eligibility remain separate. Completing one task may create or unblock another. For example, granting document-replacement permission ends that permission decision but leaves a visible replacement/verification step; it never marks the replacement verified.

Opening a task, adding a note or reading an alert cannot complete it. A manual Mark addressed action must not bypass required evidence, acceptance or financial decisions; derive completion from the authoritative workflow outcome. Newly submitted revisions preserve the version chain and return only the relevant work to review. Retain original submission and follow-up times so resubmission does not hide overdue work without an explicit policy.

## 5. Open review: one place for evidence and decisions

The reviewer follows: **Open task → inspect current details and evidence → choose the permitted decision → confirm its effect → see the saved result → open the next task.**

Use a full-width workspace with a persistent header: record name/reference, task type, owner, current version, status and Back to results. On desktop, show submitted information and previous verified values beside the relevant evidence viewer. On mobile, stack the same sections with clear navigation. Keep the decision area reachable without covering evidence.

The review workspace contains:

1. **Summary and next action:** exact scope of this review, who submitted it, when, and what remains unresolved.
2. **Current and proposed values:** highlight changed fields; identify the effective version and the proposal separately. Do not overwrite verified records before review.
3. **Evidence:** exact document/media identity, kind, version, submitted date, recorded status and permitted reviewer/time. Show a load failure honestly and offer a permitted retry/viewer route; do not pretend an unavailable file was inspected.
4. **Readiness and dependencies:** the relevant remaining checks with links. A company-owned prerequisite says Waiting for Hastabazaar, rather than asking the seller to edit company settings.
5. **Decision:** only actions permitted for this task and current staff authority, a meaningful reason and any required evidence reference. Keep the private internal note distinct from feedback explicitly labelled Visible to seller/customer.
6. **History:** prior submissions, scoped change permissions, evidence versions and decisions with actor/time/reason. Long history is expandable. Do not expose internal notes or other parties' private evidence through notification/public previews.

Existing current verified evidence stays read-only unless the permitted change workflow grants the specific replacement scope. Opening a file never verifies it. Decision notes can be protected drafts with truthful Saved/Unsaved feedback; autosave never submits the decision. Preserve notes on validation, network and version conflicts without storing confidential drafts indefinitely in unprotected browser storage.

## 6. Decision controls by task

| Task | Appropriate controls and boundary |
|---|---|
| Seller application | Existing review decisions with reasons; approval for activation remains distinct from order acceptance and payout permission. |
| Identity / PAN | Independent authorized Super Admin verifies the exact current evidence or requests correction/rejects that document. Verification does not approve the whole seller automatically. |
| Verified-document change | Approve or reject the reasoned replacement scope. A permitted new upload then enters fresh verification; preserve old evidence/history and unrelated locks. |
| Bank beneficiary | Eligible independent Super Admin compares account evidence with reviewed seller identity and records verification reference/outcome. Do not infer ownership from matching names. Use the approved D4/D13 pending-payout policy and single-Super-Admin financial amendment. |
| Product | Review content/media and request changes, approve or reject where allowed. Publication remains a distinct operation until the separate Approve & publish decision is settled. Show real public visibility and orderability after any saved action. |
| Manual customer payment | Authorized reviewer matches actual bank evidence and allocation, then records confirmation or requests clarification. Receipt upload is not proof of cleared funds; ordinary incoming confirmation by a specifically designated Finance verifier or eligible Super Admin follows approved D7; exceptions remain restricted. |
| Payout / refund | Preserve preparation, approval and actual payment confirmation as separate stages. Approval does not send money or display Paid/Refund completed. |
| Live seller activation | Explicit Enable order acceptance only when all current authoritative checks and actual live dependencies pass. No Approve everything shortcut or fabricated clearance. |
| Terms follow-up | Staff can guide, assign and record contact; only the seller's valid acceptance resolves the terms hold. Other blockers remain separate. |
| Email/form incident | Open the relevant health view, show current automated recovery and genuine correction needed. Acknowledging the incident does not stop retries or claim recovery. |

The common interface does not create new staff powers. Preserve existing role checks and independent review on both reads and decisions, including evidence download, counts and search. Super Admin oversight does not authorize self-verification of an owned seller or bypass another required independent check.

## 7. Save a decision and continue work

Before confirmation, show the affected record/version, decision, reason, any seller/customer-visible feedback and the actual consequence. Sensitive actions require explicit record-specific confirmation. Do not ask the reviewer to re-enter details already known from the task. Avoid repetitive generic confirmation dialogs for ordinary navigation or draft saves.

On submit, recheck current permissions, evidence/version, prerequisite state and any competing decision. If another reviewer has already acted or evidence changed, show the current outcome and the changed information while retaining the unsent note; require a fresh decision against the right version. Do not silently apply a stale decision to a replacement file.

Use the same request identity for a retry after an uncertain response. Look up the recorded outcome before creating another decision. Repeated clicks, concurrent staff submissions and retrying requests must not duplicate verification, history events, payment allocation, activation or notification work.

After successful recording:

- Show the precise saved outcome with actor/time and record reference.
- Refresh the canonical record, queue count, owner/next action and readiness summaries. Move it to Completed only if this task is complete; otherwise show the remaining dependency or next party.
- Create only the permitted notification event after the business decision succeeds. Show Notification queued / Retry scheduled separately if delivery is pending; an email failure must not turn a saved review into a fake failed review.
- Stop obsolete reminders for the resolved underlying issue. Recheck state immediately before sending, deduplicate retries and do not resend already accepted notices. Distinct genuine follow-up tasks or new versions may notify separately under the approved policy.
- Offer Back to results and Next eligible task, preserving the previous queue context. Do not skip an unresolved sensitive step merely to keep the queue moving.

For outage handling, keep one continuing incident with one outage notice and one recovery notice per recipient/channel and episode. The approved automatic retry/recovery continues without a manual batch click. A lost provider acknowledgement is reconciled rather than blindly resent; an email already handed off cannot be recalled after resolution.

## 8. Example walkthroughs for the planned interface

| Scenario | Expected sequence/result |
|---|---|
| PAN review | Overview → seller's PAN task → compare exact evidence/details → Verify with reason → PAN shows Verified. Any pending bank or activation check stays visible. |
| Unclear identity document | Review → Request clearer image with specific feedback → Waiting for seller → seller returns through the direct correction link → current replacement reviewed. Opening the feedback is not completion. |
| Verified bank needs changing | Reasoned request → scoped permission/required review → replacement evidence → independent verification. New beneficiary is never used while unverified; payout handling follows the approved D4/D13 policy. |
| Product approved, publication or ordering pending | Review shows each stage separately. The saved result says what became approved/public and what still blocks ordering; no premature Live or Available claim. |
| Seller responds before a reminder sends | The authoritative order progress resolves that response task, pending reminder is suppressed and queue counts update. A later unrelated order still creates its own task. |
| Email sender stops and recovers | Super Admin sees an incident and automatic next retry/check. No repeated manual processing is needed; confirmed recovery creates one recovery notification with remaining backlog truthfully shown. |
| Concurrent reviewers | Second stale submission sees the saved first decision or current version, retains its note and produces no duplicate decision/email. |
| Departmental reviewer lacks bank access | General permitted task is usable; private bank evidence, counts/previews and direct links stay protected. Assignment never grants that access. |

## 9. Design and verification acceptance criteria

- Overview makes the next action and owner clear without opening several unrelated forms. Counts and missing-data states are truthful; filters and return position persist.
- Shared queue and seller/global views show the same task and saved outcome. Unread, waiting, completed and sent are not conflated.
- Document comparison, product feedback, payment evidence and activation checks are reachable within the relevant record; no private evidence appears on a public/customer page.
- Permission loss, stale evidence, concurrent decisions, session expiry and interrupted saves retain permitted draft work and never grant a hidden bypass.
- Confirmed decisions notify the correct audience once; resolved issues stop pending reminders and cannot be recreated by later scans. Recovery notifications do not repeat on each healthy check.
- A form-configuration failure has a useful recovery path and staff diagnostic reference. It does not falsely approve the task or erase progress. Notification failures do not stop independent review work.
- Mobile, keyboard, visible focus, readable status text, evidence loading and supported viewer fallback work across empty, busy, waiting and failure states. Preserve existing product-specific language/content behavior.
- Tests use fictional identities/evidence and simulated money movement when implementation resumes. The canonical local database must not be reset, seeded or migrated as a shortcut.

These are later acceptance checks, not claims that the interface is implemented or tested today.

## 10. Remaining planning decisions

The user approved Overview/shared review, Sellers, Products & storefront and Orders & customer care on 30 October, then Finance & payments/targets, Fees/programs/promotions, D16/D17, D4/D13, D15, D7, the single-Super-Admin finance amendment and D2 product-edit rules/one-business-day revision-review target on 31 October. The user also approved D3 [approved public-profile and cooldown rules](2026-10-31-public-profile-changes-cooldown.md) and first routine profile review within 1 business day on 31 October. D6/D11/D12 cancellation/return rules and timings are also approved. Team & business policies and its operating rules are now approved. System health & records and incident/service-recovery rules are now approved, with the new backup program deferred. Named coverage, actual capability mappings and final walkthrough and implementation mapping stay in the decision register. Do not reopen settled authority, targets or the excluded language/public-content topic. Implementation remains on hold.

The [paired seller dashboard/customer walkthrough](2026-10-31-seller-customer-screen-walkthrough.md) is now approved on 1 November 2026, alongside D9 standard payout purpose with an optional note. Remaining preparation is actual checkpoint/source/operational mapping and the full implementation checklist. System health approval and the backup-program deferral remain intact. All active work-plan items are now required in this version; D19 is now approved; actual implementation/operational mapping remains in the readiness register; implementation remains on hold.
