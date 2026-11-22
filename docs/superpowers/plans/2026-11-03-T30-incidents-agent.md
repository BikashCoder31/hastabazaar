# T30 incident governance implementation evidence

Date: 2026-11-03. Checkout: `C:/Users/abinash/Desktop/HastaBazaar`.

## Delivered behavior

`0150_incident_governance.sql` extends the existing `service_health_incidents` identity with impact, owner/backup, original response targets, acknowledgment, containment plan, promised update, closure authorization, actual recovery observation references, revisioned native history, protected source links and immutable legacy mappings. It does not replace the T29 health store or mutate retained legacy incidents. Root owns ORM/Maria generation and shared deployment validation. This source migration was never applied to the canonical local database by this agent.

Critical acknowledgment/plan/update allowances are 15 minutes/1 hour/hourly; High allowances are 1 hour/4 hours; Routine meaningful review is due within 24 hours. Assignment, acknowledgment, reassignment, severity changes and access corrections retain the original first-seen clock. Lowering severity or removing a sensitive classification requires current Super Admin authority and a recorded reason. Acknowledgment and reading a notification do not constitute recovery.

`incident-review.ts` exposes protected creation, current-version/idempotent commands, scoped lists/detail, legacy mapping, prepared native owner changes, bounded ownership reconciliation, review-task source facts, operational notice source predicates and detector transition statements. The source adapter preserves an empty economic-conflict owner and exports actual assigned `allowedStaffIds`. Root/Team own common task and reminder wiring. Follow-up facts preserve original acknowledgment midpoint/overdue and plan targets and expose promised update identity independently of routine health scans.

Current owners/eligible backups act within their assigned incident; current Super Admin can oversee/reassign. Eligible available responders can explicitly claim unassigned work. A technical reporter's new record explicitly claims that work without granting global read authority. `system.incidents.manage` alone permits assigned-case reads/actions; `system.health.view` permits the global sanitized view. Assignment never grants a permission. Selected responders and acting non-Super-Admin responders have current authority/availability checks and native commit-clock fences. Ownership races, revoked grants and unavailable actors abort whole batches.

Read DTOs are constructed before a final single SQL proof of active role, exact permission-profile snapshot, environment, source/governance version and assigned scope. Revocation or reassignment during asynchronous history/projection queries rejects the result. Fair ownership scans use the existing `operational_reminder_cursors` table with an environment-specific keyset cursor and expiring lease, so valid older owners cannot indefinitely hide a later revoked owner. SQL quotes Maria's reserved `cursor` identifier consistently.

Manual/sensitive incidents remain open for authorized governance closure. Resolution requires two actual consecutive, current matching-scope functional observations from distinct runs at least 60 seconds apart plus clear/progressing work. A different release/configuration cannot be combined into recovery. Forms use the current published form version in their evidence scope. Privacy/security/financial-integrity closure requires Super Admin. Stored closure references point to real immutable observations. Duplicate mapping must retain the oldest canonical episode with matching impact and sufficient severity/response targets; it retains both original clocks and traceable reciprocal links rather than certifying repair.

Ordinary automatically detected email incidents retain T29's proven automatic recovery behavior (`closure_required=0`). Email detection/recovery now gains real governance/ownership/native events while preserving existing incident IDs and the original `system.email_health` notification family. Manual email resolution also uses that recovery family. There is no duplicate `system.incident` outage/recovery family for the same email transition, and accepted historical notification identities are not rewritten or replayed. Named current technical owners/backups receive safe notices without a global email-delivery grant; current source/recipient checks include actual authority and availability. Root owns protected destination resolution.

The protected workspace is `/admin/system-health/incidents`; its API uses actual registered `staff.incident-review` form validation and same-batch answer evidence. Legacy incident actions in the old repository/API cannot silently resolve a governed case and provide the new destination. Other legacy governance behavior is retained. Publication races, stale versions, cross-site submissions and forged client environment fields are rejected.

## Browser retry and client boundary corrections

The actual workspace retains the exact submitted payload after an uncertain response, including its absolute promised update timestamp. Unchanged retries use the same payload/request identity; field/action/source edits or explicit refresh invalidate that snapshot safely. Failed requests retain entered text. Mobile incident tables scroll in their own focusable region rather than splitting headings into individual letters.

The actual form hook initially failed browser bundling because a client import reached server form-health instrumentation and Node-only image/provider dependencies. The approved integration correction extracts exact pure key/parser/WebCrypto digest behavior into `field-keys.ts` and `client-submission.ts`. All 62 actual client helper importers use the browser-safe module. `FormRuntimeError` has one shared constructor in `runtime-error.ts` with the original server re-export, preserving `instanceof` behavior. Server submission retains authoritative validation, current publication checks, permissions, database receipts/replay and recovery logic, and re-exports the original public helper API. No Node builtin or actual form hook was stubbed to hide this boundary.

## Verification performed

All database fixtures below were explicitly inspected isolated `:memory:` SQLite fixtures. Provider/mail/network behavior was fake or intercepted. No canonical database, configured provider, production credentials, install, deployment or real payment/mail operation was used.

| Evidence | Result |
| --- | --- |
| `incidents-memory.tap`: ownership, health classifier/repository/notifier and actual monitor API | 41/41, exit 0, 18.50 seconds |
| `incidents-legacy-governance.tap`: retained legacy governance/permission regression | 1/1, exit 0, 10.66 seconds |
| `incident-browser-red.tap`: committed plan response lost; clock advances before unchanged retry | Failed to recover before payload correction, as expected |
| `incident-browser-green.tap`: actual component + incident API + actual staff form route | 1/1, exit 0, 13.90 seconds |
| `form-client-regression.tap`: all-client bundle boundary plus existing validation, seller submission and core recovery tests | 464/464, exit 0, 164.13 seconds |
| `form-client-bundles.json` | 62 actual client entrypoints, 2,260 inputs; no server runtime/provider graph or Node builtin shims |

The browser fixture uses bundled Playwright because the Browser plugin is unavailable. Every request is intercepted, including the actual staff form GET and incident POST; all source migrations run only in an in-memory fixture. The journey proves byte-identical replay after a lost committed response, one plan event, a fresh request after edited input, acknowledgment without resolution, and current-grant rejection of an old tab while preserving text. Page identity, meaningful rendering, absence of framework overlays, no unexpected console/page errors and no page-wide overflow at 390×844 were checked. Expected fictional 503/403 resource errors are intentional test evidence.

Screenshots were inspected: `.test-artifacts/t30/incident-plan-recovered.png` (1200×900 desktop fixture) and `.test-artifacts/t30/incident-revoked-tab-mobile.png` (390×844). Chromium/context close and SQLite disposal run in `finally`; no fixture server was launched. The final browser process closed cleanly before releasing the serialized slot.

Root owns final global typecheck/native/browser/Maria checks. This note does not claim canonical runtime readiness, real external watchdog/contact configuration, provider delivery, production recovery or deployment. Backup sections remain deferred; this slice adds no backup program or business hold/payment release.
