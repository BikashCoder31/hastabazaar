# Staff Access Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. The user requested Astra with extra-high reasoning for subagents.

**Goal:** Make Staff access clear in simple English, with allowed and blocked work areas, job templates, useful change history, and enforced permissions.

**Architecture:** Build on the nine existing configurable Admin rights and existing versioned, audited save API. Templates are copies of supported permissions. Read change history from saved audit snapshots. Preserve the private workspace hydration fix and existing form version, retry and confirmation behavior.

**Tech Stack:** React, TypeScript, existing UI components, D1/SQLite repositories, existing Node/Chrome tests.

**Spec:** User-approved recommendations in this chat. This iteration covers allowed/blocked sections, job templates, clear history and permission checks. Fine-grained rights, temporary grants, monetary limits and work-progress tracking require separate server contracts and are not represented by inactive or misleading controls.

## Global Constraints

- Simple English only in the interface.
- Do not introduce grantable rights that the server does not support.
- Super Admin-only rights, own-access protection, current-role checks and version checks remain enforced on the server.
- Preserve existing staff permissions until an explicit confirmed save.
- No external invitations, notifications or live account changes during verification.

## Review Focus

- A saved template containing invalid or reserved rights must never grant access.
- Switching staff must not carry another person's unsaved changes or reason.
- Rejected or incomplete historical records must not be presented as applied changes.
- Missing or stale form configuration and uncertain replies must preserve the existing retry safeguards.
- Chrome autofill must remain compatible; narrow screens must not hide controls or require horizontal scrolling.

## Task 1: Shared access model and protected history

- [x] Add `lib/staff/access.ts` with plain descriptions for the nine existing configurable rights, safe built-in job templates, saved-template validation and change comparisons. Keep the current role defaults unchanged.
- [x] Templates: Orders assistant (order.manage), Customer support (support.manage), Product reviewer (product.review), Product publisher (product.review and product.publish), Seller reviewer (seller.application.review), Finance assistant (payout.prepare), Reports only (audit_log.view), Work access off (empty). Explain each actual bundle honestly; reports does not grant all-module read access and access off retains account access.
- [x] Add a separate `lib/db/repositories/staff-access-history.ts` reader that requires an active Super Admin. Use actual audit snapshots for staff.permissions.applied, .approved and .rejected. Include staff/actor names, reason and time; cap at the latest 100 entries. Distinguish applied, rejected and incomplete records. A rejected request never claims its requested rights were granted. Invalid snapshots are unknown, never fabricated as empty access. Preserve correct form-history request IDs.
- [x] Tests first for invalid/reserved templates and snapshots, denied history reads and real saved/approved/rejected audit records. Run existing relevant authorization tests for reserved rights, self-editing, stale versions and unchanged data after rejected operations. Avoid migrations or changes to existing listStaffPermissionChanges fixtures.
- [x] No new live grants or real notifications during verification. Run focused tests, self-review, commit only task files and write a report with red/green test evidence.

## Task 2: Clear Staff access editor and history

- [x] Use Task 1's model and reader in `components/admin/staff-permission-manager.tsx` and `app/admin/team/page.tsx`. New focused components under components/admin may separate the access editor and history to avoid a single large file.
- [x] Show a staff summary, built-in job templates and validated saved templates. Templates change the draft only. Invalid saved templates must never crash or grant rights.
- [x] Add search and access filters with explicit Allowed and Blocked sections, clear descriptions of each supported work area and locked Super Admin actions. Show draft state honestly. Keep keyboard focus stable when changing access, accessible labels, useful empty states and narrow-screen layout.
- [x] Show added/removed rights before confirmation. Retain required reason, optional saved template, the Save permissions button, review confirmation, form-version validation and all retry/uncertain-response protection.
- [x] Switching staff with unsaved edits requires an explicit discard choice; switching safely clears the previous person's reason, template and pending review state. Cannot edit own access or a missing member. Preserve current permissions until confirmed save.
- [x] Add readable filterable change history with names, time, reason and real before/after changes. Clearly separate rejected requests, pending decisions and unavailable older snapshots. Preserve existing form-history links and legacy pending approval/rejection behavior. No unsupported fine-grained switches, temporary grants or work-progress controls.
- [x] Add mounted interaction and rendering tests before implementation, preserve existing tests/selectors where possible, and retain the Chrome autofill hydration boundary. Run focused tests, self-review, commit only task files and write report with red/green evidence.

## Task 3: Final integration and verification

- [x] Verify template selection, allowed/blocked edits, staff switching, confirmation, history, invalid data, retries, denied access and Chrome autofill using the existing isolated browser fixture approach. Check desktop and narrow layout. The browser tool previously blocked localhost; do not bypass that restriction to inspect the user's browser.
- [x] Run appropriate focused authorization/form tests, typecheck, lint and build. Do not run the entire 65-minute repository test suite without a new reason.
- [x] Verify local form readiness with the documented read-only command, preserve local data and keep the preview available on port 3018. Do not send invitations or change real permissions during verification.
- [x] Complete a fresh independent final review, address material findings, and record commands/results here. Keep the work local; no push, merge or deployment.


## Completed on 15 October 2026

Implemented in the existing local branch codex/plain-english-forms:

- 59b304f: shared nine-area access model, eight safe job templates, protected audit history and regression tests.
- 08cef8f: real authentication/route/repository permission boundary tests with disposable SQLite.
- ff81516: Staff access summary, Allowed/Blocked lists, search, templates, safe draft switching, confirmed saves and readable history.
- e9bd474: final review correction so only rejected requests say their requested access was not applied.

Validation:

- Combined focused run: 69 tests passed, zero failures/skips. Files: staff-access, staff-access-history, staff-access-security, staff-access-ui, staff-permissions, direct-super-admin-governance, form-catalog-finance-access, form-catalog-finance-retry, form-catalog-governance, admin-autofill-hydration, form-preview-readiness and staff-access-denied.
- After the final history fix: mounted UI regression 8/8 passed, including actual direct-save, approval, rejection and incomplete-history shapes. The misleading text was reproduced before the fix.
- Final npm run typecheck and npm run lint passed after the fix.
- Final DEPLOY_TARGET=babal npm run build passed after the fix; standalone output generated. Build printed plugin timing notices only.
- Read-only npm run staging:forms:check: 85/85 required forms ready, zero mutations.
- Independent Astra reviews approved the model/history, UI, security tests and final correction; no open findings.
- Real compiled CSS checked in isolated Chrome fixtures at 1280x900 and 390x844, with no horizontal overflow or console/runtime errors. Normal Chrome hydration, injected autofill markup and genuine error reporting are covered by regression tests. The user's own Chrome profile was not controlled; localhost browser automation had previously been blocked and was not bypassed.
- The full repository suite was not rerun; it previously took about 65 minutes. Focused checks cover the changed behavior and its existing contracts.

The preview remains at http://localhost:3018/admin/team. The local data and existing account grants were preserved. No live permission changes, invitations, external notifications, push, merge or deployment were performed during verification. The worktree is kept for local checking.
