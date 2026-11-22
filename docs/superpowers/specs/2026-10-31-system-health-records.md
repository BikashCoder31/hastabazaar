# System health & records — approved workspace; backup program deferred

Status: **approved for the work plan, 31 October 2026, with the backup program explicitly deferred**. The user approved System health & records, monitoring, incident response, service recovery, records and scoped diagnostic rules, while stating that the proposed backup setup is not needed until the wider setup is established. The daily/hourly/pre-deployment backup program, one-hour recovery-point objective, retention schedule, restore rehearsals and new restore interface/procedure are therefore deferred reference material, not current approved requirements or blockers to finish this planning phase. Existing Form Management, Email delivery, retry/recovery, notification and Team policies remain approved. **Implementation remains on hold** until planning is complete and the user explicitly resumes work. No code, configuration, data, backup, access, email or deployment was changed by this approval.

## 1. Purpose, approach and observed source

Give Super Admin and specifically authorized staff one place to answer: what is working, what is failing, who owns it, what users are affected, what happened and what is the next safe action? A healthy page response is not proof that a seller can save a form or that a scheduled email was sent.

Approved approach: **one health and incident workspace, linked to the existing form, delivery and record workflows**. Keeping separate disconnected screens makes it difficult to see shared failures. A single unrestricted console with raw logs, bulk retries and restore buttons would mix unrelated permissions and decisions. The approved workspace consolidates visibility while keeping each business record and protected action authoritative in its own workflow.

Read-only local source evidence, not a claim about deployed behavior:

- [Liveness](../../../app/health/live/route.ts) returns a basic response. [Readiness](../../../app/health/route.ts) calls [deployment readiness](../../../lib/operations/deployment-readiness.ts), which checks schema and applicable hosted security readiness. These do not prove every form, reminder producer, email transport or backup is working.
- [Form publication](../../../app/api/admin/forms/[formId]/publish/route.ts) uses a protected version/revision-aware workflow. Follow the [approved Form Management design](2026-10-30-form-management-reliability.md) and [field inventory](2026-10-30-form-management-field-inventory.md), rather than treating publication of arbitrary metadata as a repair.
- The [email runner](../../../lib/email/outbox-runner.ts) processes bounded business/order queues. The [manual business-email route](../../../app/api/admin/business-emails/route.ts) attempts up to six messages and uses a legacy broad access gate. Its existence is not evidence that a scheduler is installed, reminders are being created or narrower permissions exist.
- [Backup service](../../../lib/portability/service.ts) requires Super Admin and fresh account-security proof. It explicitly rejects browser data export on MariaDB hosts and calls for operator-managed native recovery. A readiness response marked authorization-only does not certify a complete backup. Preserve this distinction.
- [Parcel exception work](../../../lib/operations/exception-work.ts) already links follow-up to orders with ownership/history. System incidents must link to affected business cases rather than replace or duplicate those decisions.

Actual host capabilities, releases, production form contracts, mail configuration and permissions require later authorized mapping for the active scope. Mapping the new backup infrastructure, storage and recovery program is deferred with section 8. Do not infer deployed state from these source files or silently repair it during planning.

## 2. Screen layout

Header: environment, application release, last successful observation, overall attention summary, search and the shared notification bell. Display Nepal time with a precise timestamp; show the recorded timezone where an external provider differs. Environment is fixed to the current connection and prominent on every protected action and export.

| Tab | Main information and actions |
|---|---|
| **Health overview** | Services and essential workflows, fresh/stale evidence, last successful job, overdue eligible work, incident owner and next action. Drill into one affected area. |
| **Form Management** | Core forms grouped by journey, current/draft version, compatibility, progress protection, preview, publication history and relevant errors. Reuse the approved editor. |
| **Email delivery** | Waiting, sending, retrying, sent, uncertain, failed and no-longer-needed work; automatic processor/reminder health, next attempt, affected recipient and incident. |
| **Incidents** | One case per actual failure episode, severity, impact, owner/backup, next update, actions and recovery evidence. Link order/seller/payment follow-ups. |
| **Records & audit** | Searchable authorized action, form-version, delivery, review and incident histories. Open the canonical source record with its existing access checks. |
| **Backups & recovery — deferred** | Reserved for later, once the wider setup is established. The new inventory, schedules, retention, rehearsals and restore workflow are outside the current implementation scope; no new tab or backup controls need to be built now. Existing protected tools remain governed by their existing controls. |

Show a short prioritized action list above detailed metrics. Use plain labels such as **Product submissions need attention** and **Email sending interrupted**. Hide advanced diagnostics behind an expandable panel. Keep older bookmarks working through links/redirects after future route mapping; do not build duplicate editors or a second generic business-decision queue.

## 3. Health meanings, checks and targets

| State | Meaning |
|---|---|
| **Healthy** | Named checks succeeded recently within the stated scope. Show exactly what was checked and when. |
| **Degraded** | A supported path still works but retries, fallback, latency or partial failures need attention. |
| **Action needed** | A confirmed failure or missing required setup needs an owner. Identify affected actions, not just an error count. |
| **Unknown / check overdue** | Evidence is missing or stale. Never display green because no error was recorded. |
| **Planned maintenance** | A recorded bounded maintenance activity explains impact; it does not suppress security incidents, hide failures or stop customer deadlines. |
| **Not enabled** | An intentionally unused optional capability, such as a deferred gateway. This is distinct from required email configuration being missing. |

Track separately: application availability; database/schema/security readiness; essential form contracts and loading; private/public file access; actual background sender and reminder-evaluator runs; due backlog. New backup completeness/freshness monitoring belongs to the deferred program. Include notification processing and authorized access failures without exposing identities or sensitive contents in aggregate metrics. A technical restriction must not be presented as seller misconduct.

Approved starting monitoring rules, subject to measured host support:

- Check critical availability and essential read-only readiness every minute. Open an incident after two consecutive failed observations; a confirmed privacy, security or financial-integrity failure alerts immediately. Mark an absent monitor heartbeat overdue after five minutes. Bound checks so monitoring cannot overload the application.
- Use the approved one-minute processing cadence and one-to-two-minute first-attempt target under healthy load. Observe the **sender and due-reminder evaluator separately**. Five minutes without an expected successful heartbeat, or an eligible action message still awaiting its first attempt after five minutes, opens attention work. Expected scheduled waits, valid backoff and provider-accepted messages are not new overdue-first-attempt failures.
- A continuously independent monitor must detect when the application or its scheduler cannot report its own failure. Plan an external-to-the-application authenticated monitoring path and an independently reachable Super Admin/backup contact route. Choose the actual supported service and recipients during mapping. The application bell cannot be the only outage channel when the application is down; a failed email transport cannot be its sole alarm channel.
- Display business workflow evidence separately from process readiness. Safe read-only checks and non-committing validation may establish configuration compatibility, but must not be labelled a successful real submission. End-to-end save evidence comes from isolated authorized test journeys matching the release/configuration, or confirmed ordinary successful use. Do not insert fictional orders or payments into production for monitoring.

Repeated observations update the same incident. Monitoring does not approve sellers, publish products, change agreement versions, send expired codes or alter payment states. Temporary read-only checks may retry with bounded backoff; failed readiness never triggers automatic seeding, schema changes or resets.

## 4. Form Management — carry forward approved rules

Organize forms by **Seller setup & updates**, **Products**, **Orders & care**, **Finance**, **Staff reviews** and **Business settings**. Each entry shows what it is used for, its owner, required authority, current compatible version, draft changes and affected journeys. Give common forms priority; keep technical field identifiers out of the ordinary filling experience.

1. **Stable core, limited customization.** Feature-owned fields and action-specific rules remain defined by the application. Restrict customization to supported labels, helpful instructions and approved extra questions. Hide irrelevant fields and remove/archive already-approved unnecessary questions without erasing historical answers. One usable cover photo is sufficient for product review intake; gift occasions stay optional. Initial registration remains optional as approved; later activation or financial actions retain their own checks.
2. **Safe publication.** Draft → validate → preview the actual affected seller/admin states → impact review → authorized publication. Check field types, stable IDs, conditional visibility, dependencies, current server contracts and required versions together. Invalid drafts leave the valid live form intact. Cosmetic changes must not force everyone to refill or accept new commercial terms.
3. **Preserve work.** Show Saving, Saved, Not yet saved and a specific retry path. Retain typed answers and permitted uploaded-file references through safe reloads and compatible version changes. Reconcile autosave with final submission; retries use the same operation identity. Show an explicit comparison only when a consequential change really needs review. Do not silently clear answers or claim saved before persistence succeeds.
4. **Truthful recovery.** Use only a trusted, validated compatible core/last-known-good definition where the current server accepts it. A revoked agreement, incompatible required field, authorization failure or financial rule never falls back to weaker behavior. Preserve unsent input, identify the affected step and explain the next action when safe submission is unavailable.
5. **Useful errors.** Replace the undifferentiated “Form Configuration is unavailable” result with an appropriate message: unable to load, answers not yet saved, changed requirements to review, missing permission or temporarily unavailable. Include a non-sensitive support reference. Staff can use that reference to see the form, release, version and failure category without exposing full private answers in logs.
6. **Recover without rewriting history.** Reverting presentation/customization publishes an explicitly reviewed new compatible version. It does not overwrite old submissions or undo business approvals. Contract-incompatible recovery requires the release/change procedure and actual compatibility evidence. No edit to an approval/payment form can bypass its business decision controls.

The [approved release evidence](2026-10-30-form-management-reliability.md#required-release-evidence) remains mandatory for later implementation. A catalogue badge alone is insufficient. Form access/privileged action configuration failures remain fail-closed; “fallback” is not a broad access grant.

## 5. Email delivery — automatic work with understandable status

Use the [approved automatic Email delivery plan](2026-10-30-email-delivery-automation.md). Normal sending and due reminders continue without staff pressing “attempt six emails.” Scheduled order notices remain at **6 hours for the seller and 12 hours for admin**, measured from the approved original actionable time; commission-term reminders keep their already-approved schedule.

| User-facing state | Meaning and next action |
|---|---|
| **Scheduled / waiting** | Valid work has a future due time, or is queued for its first eligible attempt. Show which. |
| **Sending** | A worker holds a current claim; do not offer a competing send button. |
| **Retrying automatically** | Temporary failure; show the reason category, last attempt and next eligible attempt. |
| **Sent to mail service** | Provider acceptance is recorded. Do not claim inbox delivery or reading without corresponding evidence. |
| **Delivery confirmed / bounced** | Use only when supported, correlated provider evidence exists. A bounce still needs the appropriate recipient/action handling. |
| **Outcome uncertain** | Acceptance may have occurred but confirmation was lost. Reconcile supported provider evidence/idempotency; do not blindly resend. |
| **Needs intervention** | An invalid recipient, credentials, unsupported setup or other non-transient problem needs correction. Link to the authorized source editor. |
| **No longer needed** | The issue was resolved, the version superseded or the message expired; preserve its history and suppress it. |

Keep the approved temporary retry delays: **5, 10, 20, 40 and 60 minutes, then hourly** while still relevant and eligible. Respect provider limits, backoff and lease recovery. Correcting a verified setup/recipient problem lets still-valid work resume automatically; staff do not have to repeatedly restart batches. Expired security messages, superseded commission reminders and resolved order notices never resume.

Deduplicate by authoritative event/version, recipient, channel and milestone/incident episode. Recheck current source state and permission immediately before each attempt, including previously claimed work. Reading an alert is not resolution; completing the actual business task is. Once provider acceptance is known, retries and recovery do not send another copy. Handle uncertain outcomes explicitly rather than promising exactly-once inbox delivery.

For one sending outage, emit one outage alert and at most one distinct recovery alert per eligible recipient/channel. Repeated failures update the incident. Recovery automatically resumes valid queued work with fairness and normal limits; suppress obsolete milestones and avoid a burst of contradictory reminders. A technical recovery notice does not assert that every old recipient issue has been solved.

Restricted diagnostics may test a named authorized test recipient only through an explicit logged action during later operations, never real customer lists. The local environment continues to use captured mail and the permitted local recipient domain. Do not put credentials, OTPs, reset links, identity documents or bank evidence into email diagnostics or previews.

## 6. Incidents, ownership and follow-up

Each incident records environment, affected service/workflow, failure signature/episode, first and last seen times, severity, actual impact, related releases/configurations, one active owner, eligible backup, next action/update and linked source cases. A shared outage may affect many sellers but should have one technical incident and scoped links to their existing tasks. Distinct causes or independent business disputes remain distinct records.

Workflow: **Detected → Assigned → Working → Monitoring recovery → Resolved**. Assignment/acknowledgment and reading a bell notification never mean repaired. A confirmed recurrence after resolution starts a new linked episode; repeated observations during the same unresolved episode do not. Merge duplicate incident reports with traceable links, preserving original timestamps and histories.

Approved targets under approved temporary continuous coverage:

| Priority | Examples | Owner response and update target |
|---|---|---|
| **Critical** | Broad checkout/sign-in outage, widespread inability to complete essential actions, exposed private evidence, suspected duplicate money execution or data corruption. | Alert Super Admin and eligible responder immediately; acknowledge within **15 elapsed minutes**, record a containment/recovery plan within **1 hour**, and update at least **hourly** while unresolved. |
| **High** | A supported form journey blocked for a subset, interrupted business email processing, failure of an already-required operational backup or a growing actionable backlog. | Acknowledge within **1 elapsed hour**, record the next repair/workaround plan within **4 hours**, and update at least every **4 hours** while unresolved. |
| **Routine** | Non-blocking diagnostics, reporting or presentation defects with a working supported route. | First meaningful review within **1 service business day**; set an owner and explicit next update/due time. |

Measure incident response targets from first recorded detection, not from assignment, opening a notification or sending an email. These are response and communication targets, not guaranteed repair times. Severity follows actual impact; failure of an existing operational backup with no usable recovery copy may be critical. The deferred proposed schedules do not create overdue jobs, incidents or setup tasks merely because that program has not been enabled. Triage never delays earlier approved customer/refund/order obligations. Existing business clocks and notice periods do not silently stop because an incident exists.

Use approved Team assignment, eligible backups, midpoint unclaimed-task alerts and overdue Super Admin escalation. For incidents, apply the midpoint to the acknowledgment target, not separately to every progress update. A missed promised update creates an overdue task for the current owner/Super Admin; do not send repeated copies on each monitoring scan. Loss of eligibility immediately reroutes the same work without resetting its age.

Containment may temporarily restrict an affected unsafe action through its authorized control, with reason and impact shown. Technical ownership alone cannot suspend a seller, cancel an order, verify a document, transfer funds or change staff access. Public/seller messages describe the practical impact and supported next step; keep stack traces, disciplinary reasons and private evidence internal. Customer-specific updates remain attached to the original order/case with its approved notice rules.

## 7. Recovery rules and evidence

Automatic recovery is appropriate for bounded safe checks, eligible notification retries and abandoned worker-claim recovery. It must retain stable work identities and authoritative current-state checks. It is not automatic replay of payments, payouts, approvals, product publication, commission acceptance, inventory deductions or ambiguous submissions.

Approved technical recovery confirmation: **two consecutive successful observations at least one minute apart**, plus evidence appropriate to the failed function. For a job, require real successful runs and progressing or clear eligible backlog; a functioning scheduler invoking a broken worker is not recovery. For a form, require validated current compatibility and relevant save-flow evidence from ordinary use or an isolated matching journey. If an existing backup incident is being handled, require a complete verified usable replacement, not an authorization response; this does not activate the deferred backup program. A single green liveness response cannot close any of these incidents.

If only a workaround is verified, label the service Degraded and keep the remaining repair owned. If monitoring cannot observe sufficient evidence, keep Monitoring recovery/Unknown instead of inventing success. Residual recipient or individual-case problems remain separate linked work even after service recovery. An authorized technical responder may resolve an ordinary incident within their scope when this evidence exists. Privacy/security exposure and financial-integrity incidents require eligible Super Admin to confirm closure; one eligible Super Admin is sufficient. Raising severity is immediate, while lowering it requires Super Admin and a recorded impact-based reason. Closure never releases a business hold through an unrelated technical permission. Close the incident with a cause or explicitly unknown cause, actions, scope, verification evidence and any follow-up prevention task.

Code/configuration rollback needs an identified target, current release/configuration comparison, data compatibility check, authorized operator and recorded outcome. A previous release may not understand newer data. Preserve immutable order prices/rates, accepted terms, document versions, reviews and financial records. A restore cannot undo money already moved at a bank or emails already accepted by a provider; reconcile external outcomes before resuming those queues.

Account recovery remains in the existing protected account-security process. System incidents do not create a credential bypass, grant emergency Super Admin to another staff member or weaken the last-admin protections approved in Team policy.

## 8. Backups and controlled restore — deferred

**User decision, 31 October 2026: defer this entire proposed backup program until the wider setup is established.** The reference below is retained for later reconsideration, not approved for current implementation or required to finish the current plan. Do not create the new schedules, checkpoint/retention targets, monitoring alerts, backup tab, restore rehearsals or live-restore workflow now. Revisit the scope and actual capabilities when the user chooses to resume this future phase. This deferral does not change existing recovery/access restrictions or authorize deleting backups, disabling existing protections or restoring data.

Deferred recommendation: **a daily complete native recovery set at 2 AM Nepal time, hourly recoverable checkpoints, and a fresh recovery set before a deployment or destructive data operation**. This is proposed future protection, not a statement that hosting currently provides it. Aim to limit recoverable-data loss to **one hour under normal operation**; prove that the host supports consistent native snapshots/logs and required media/key recovery before claiming that target. If it cannot, show the capability gap and return for an explicit protection-target decision rather than silently downgrading it. Measure restore duration in rehearsals before offering a restoration-time promise.

Each recovery set must identify its source environment, application release, database engine/schema and consistent recovery time; include all required public/private media and metadata and references to the correct separately encrypted key recovery. Protect the encryption recovery material separately; a complete database dump without required files or usable keys is not a complete recovery set. Use an authorized encrypted copy outside the same failure boundary as the hosting server. Map the actual storage destination, access, capacity and cost before enabling it.

Show separate evidence for **Created**, **Integrity checked**, **Independent copy confirmed** and **Restore rehearsed**. A checksum checks integrity, not completeness or successful recovery. A failed/newer backup never overwrites the last known usable copy. Alert immediately on a failed scheduled attempt; a scheduled checkpoint missing after a proposed 15-minute completion grace period opens an incident. Any missed hourly objective is visible even during that grace period. Use measured capacity to validate scheduling and time budgets.

Proposed rolling backup retention: **7 daily, 4 weekly and 3 monthly complete recovery sets**, retaining hourly checkpoints needed for at least the latest seven days. Keep each retained set's entire dependency chain and pin the last successfully rehearsed usable set plus any incident/legal hold. Cleanup must not strand an incremental snapshot or delete the only usable recovery material. This is backup-copy retention only: it does not authorize deleting source orders, financial records, evidence or audit history, whose existing retention obligations remain separate. Rehearse an isolated restore **monthly** and after material changes to the database/storage/security/recovery procedure.

Deferred restore-workflow proposal for later reconsideration and separately authorized operations:

1. Identify the incident, owner, exact source set, exact destination, target release/engine, recovery time, expected missing/newer data and affected integrations. Inspect integrity, completeness, key availability, private-media classification and compatibility before proposing the change.
2. Rehearse on a specifically owned isolated destination using captured mail, simulated payments and no customer-facing integrations. Do not overwrite the canonical local checkout/database or launch a historical recovery archive to run this rehearsal. Follow the active project's launch and data-mutation restrictions.
3. Produce a concrete preview: what would be replaced, the current-state safety copy, necessary write containment, expected interruption/data-loss exposure, rollback path and verification plan. Eligible Super Admin authorizes that identified live operation through the protected procedure; technical task assignment and planning approval are not authorization for an arbitrary restore. No second Super Admin is compulsory.
4. An authorized operator executes the host-native procedure, records results and validates schema, forms, access, private files and business record consistency before reopening affected writes. Keep outbound email, payment execution and other external side effects disabled until reconciliation is complete.
5. Reconcile transactions and authoritative events after the chosen recovery point: bank movements, provider-accepted/uncertain mail, processed webhooks, inventory/orders and reserved payout/refund allocations. Preserve known deduplication evidence. Do not auto-replay work with uncertain external results or assert that a rollback recovered missing transactions.
6. Validate access against post-backup revocations, changes and current security state. Do not revive removed staff sessions or old credentials; revoke/invalidate restored sessions as appropriate and use the established secure sign-in/recovery path. Record any unresolved discrepancy as owned work before enabling the affected action.
7. Resume only verified eligible processing, observe recovery, and record the restore evidence and follow-up. Keep original business deadlines and histories; a restore date is not a new commission-consent or order-response start date.

MariaDB production recovery remains operator-managed; do not add a browser “restore everything” shortcut that bypasses its native recovery restrictions. SQLite portability, where supported, remains limited to its prepared compatible destination rules. The current canonical local database must never be seeded, reset, migrated or restored merely to clear a failed startup/health check.

## 9. Records, privacy and permissions

Record searches support reference, record type, actor, date, environment, status and action. Show a concise timeline with the version actually used, reason, owner, request/correlation reference and authorized before/after differences. Correct mistakes by an attributable amendment; do not silently rewrite or delete a historical approval or audit action. Link to the source record, not a second editable copy of private answers.

| Capability group | Approved boundary |
|---|---|
| **Super Admin** | Overall health and permitted histories; protected form/configuration publication, mail setup and existing protected backup/restore access through its current security controls. New backup/restore UI and workflows remain deferred. Single-person authority remains sufficient where approved. |
| **Specifically authorized technical responder** | Sanitized service/job health, assigned incident acknowledgment/actions, approved read-only diagnostics and scoped prevention work. No implicit staff invitations, raw secret access, financial execution, full private evidence, live restore or reserved publication authority. |
| **Department staff** | Status and incident links relevant to their authorized work, scoped delivery history and their existing business histories. Owning a task does not grant additional record access. |
| **Seller/customer** | Relevant saved-progress, delivery/task or outage information and permitted own-record history only; no internal incident console, private other-party evidence or infrastructure diagnostics. |

Map explicit capabilities across page, API, source record, private-file read, export and background action. Do not reuse the old email screen's invitation permission as a convenience grant. Aggregate counts and search previews must respect scope; restricted records must not leak through filenames, reasons, identifiers, exports or notification snippets. Recheck revoked access on each operation, including open tabs and downloadable artifacts.

Use structured redacted diagnostics: no passwords, authentication tokens/codes, raw form answers, full bank numbers, PAN/citizenship evidence or whole private attachments in technical logs. A support reference resolves to restricted details only for an entitled actor. Exports are separately authorized, minimal, access-controlled and recorded; a complete backup is not a routine CSV report. External monitoring receives only the necessary health signal.

Retain business/audit histories under their applicable existing retention and hold rules. Approved routine technical-diagnostic retention is **30 days**, with explicitly selected incident evidence retained with its case under the applicable policy. Do not introduce an automatic purge of security incidents or business records through this setting. Actual retention obligations and existing records must be mapped before enabling cleanup.

Subsequent [D21 category/variant scope](2026-10-31-retail-categories-product-variants.md) extends readiness coverage to category contracts, selected-offer availability and end-to-end variant consumers. Metadata/template publication alone is not proof of functioning stock, cart, order or aftercare. This scope does not resume implementation or the deferred backup program.

D22 [Super Admin oversight](2026-10-31-optional-product-intake-support.md) makes missing/failed Super Admin email an actionable delivery/setup condition while dashboard/bell notices remain independent. Preserve automatic retry, uncertainty handling, protected payloads and an independent outage route; do not report mail delivered from an in-app notice or claim inbox delivery merely from provider acceptance.

## 10. Mapping, verification and approval status

Before later implementation/release of the active scope, map actual forms and server contracts; production/local engine and release differences; scheduler/hosting limits; sender/reminder producers; provider acknowledgement/reconciliation support; independent outage contact; authorization and audit boundaries; and applicable diagnostic retention/hold requirements. New native-backup infrastructure, hourly recovery capability, dedicated storage/cost and restore-program mapping are deferred with section 8 and are not new prerequisites to finish this planning phase. Existing operation-specific safety and release controls remain applicable. A mapping gap cannot be marked implemented from an attractive screen.

Later verification of the active scope must cover: stale/false-green health; independent scheduler/application failure detection; form drafting/publication and edits in progress; preserved answers and exact version/permissions; one cover photo/no gift occasion review intake; role revocation and private files; temporary/permanent/uncertain email outcomes; concurrent claims/retries and issue resolution races; no obsolete/duplicate reminders; correct outage/recovery episodes; incident ownership and clock targets; current host/recovery restrictions and no automatic destructive recovery; and the end-to-end seller/admin/customer journeys affected by a repair. Complete recovery-set evidence, encrypted isolated restores, restored access and external-event reconciliation tests for the new backup program are deferred with section 8. Planning-only checks do not establish that these scenarios pass.

- [x] Carry forward approved Form Management, field cleanup, Email delivery, retry/recovery, notification and Team policies unchanged.
- [x] Approve the workspace, status meanings and scoped diagnostic/record permissions; reserve Backups & recovery for the later deferred phase.
- [x] Approve monitoring cadence, evidence-based service recovery and Critical/High/Routine incident response/update targets.
- [x] Approve 30-day routine technical-diagnostic retention, preserving applicable business/audit retention and incident holds; no cleanup runs during planning.
- [x] Record the user-directed deferral of the new backup/checkpoint/pre-deployment program, recovery-point target, rolling backup-copy retention, restore rehearsals and new restore workflow until the wider setup is established. Deferral is recorded, not implementation completion.
- [ ] Map actual eligible responders and host/email/monitoring capabilities for the active scope. New backup infrastructure and recovery destinations belong to the deferred phase.
- [x] Approve the final paired seller/customer walkthrough on 1 November 2026; D20 rules with the no-expiry correction and D19 price/public-preview behavior remain approved; the [complete-version checklist](../plans/2026-10-31-complete-version-scope.md) now records all active work for this version. D9 standard payout purpose with an optional note is now approved. Fixed working hours, QR/gateways and excluded language policy remain deferred as previously recorded.

This approved active-scope design, its explicitly deferred backup reference and the linked [remaining-decision register](../plans/2026-10-30-planning-readiness-review.md#51-remaining-decisions-and-mapping) are planning documents only. Implementation and deployment remain on hold.
