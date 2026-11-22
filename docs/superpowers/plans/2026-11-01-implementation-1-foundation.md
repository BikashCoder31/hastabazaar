# Complete version — Foundation and safe checkpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Prepared 1 November 2026. Documentation only; implementation remains on hold until the user resumes it. This is part 1 of one release, not a separate release.

**Goal:** Complete the ordered tasks below against their approved source requirements.

**Architecture:** Extend the existing repositories, guards, feature-owned forms and shared projections. Use the [orchestration plan](2026-11-01-complete-version-implementation.md) for cross-task contracts and policy precedence.

**Tech Stack:** Existing React 19 / vinext / TypeScript application, Drizzle schema, D1/SQLite and native MariaDB adapter, Node test runner and approved browser tools.

**Spec:** [All 20 workstreams](2026-10-31-complete-version-scope.md); each task lists its canonical sources. The source requirements remain controlling when a short task summary omits detail.

## Global Constraints

Read the [orchestration constraints](2026-11-01-complete-version-implementation.md) and [new-chat handoff](2026-11-01-new-chat-handoff.md) first. No code, data, release or live record changes are performed by preparing this plan. During implementation preserve the canonical checkout and dirty checkpoint; do not seed/reset/migrate existing local data to pass startup. Update the [progress ledger](2026-11-01-implementation-progress.md) with evidence after each task. Planned filenames are exact intended locations; if an existing implementation already provides the responsibility, record that mapping and reuse it rather than duplicate it.

## Review Focus

Apply the five failure modes in the orchestration plan to the owning tasks below. Test actual state/transactions, not only source-text patterns. Existing targeted tests are starting coverage, not proof that the new cases are already implemented. New test files must be written before their related new behavior. Do not create artificial red tests for unchanged, already-proven behavior.

## T00. Reconcile the paused checkout and establish the baseline

**Workstreams:** V19. **Depends on:** None — first execution task.

**Canonical requirements:** [2026-10-31-complete-version-scope](2026-10-31-complete-version-scope.md); [2026-10-31-complete-plan-review](2026-10-31-complete-plan-review.md); [2026-10-30-planning-readiness-review](2026-10-30-planning-readiness-review.md).

**Files**

- Inspect only: [AGENTS.md](../../../AGENTS.md); [LOCAL-START.md](../../../LOCAL-START.md); [scripts/start-local.mjs](../../../scripts/start-local.mjs); [package.json](../../../package.json); [lib/managed-commerce/activation.ts](../../../lib/managed-commerce/activation.ts); [lib/sellers/document-review.ts](../../../lib/sellers/document-review.ts).
- Test: [tests/seller-document-review.test.ts](../../../tests/seller-document-review.test.ts); [tests/managed-commerce-activation.test.ts](../../../tests/managed-commerce-activation.test.ts).

**Interfaces:** Consumes: canonical checkout, saved checkpoint manifest, approved V01–V20 scope. Produces: checkpoint classification and baseline evidence in the progress ledger; no application change.

**Behavior and acceptance cases**

- [ ] Root must resolve to C:/Users/abinash/Desktop/HastaBazaar and baseline d9056dc10fee13dc11d15f24a14f63b003befe0b must remain an ancestor.
- [ ] Preflight must show the existing database and complete form/sign-in readiness; no server or data mutation.
- [ ] Baseline test failures or unavailable native/browser environments remain explicit, not silently counted as passed.

**Implementation steps**

- [ ] 1. Compare HEAD, Git root/settings and per-file hashes against the supplied checkpoint. Inventory existing modified/untracked source as verified reusable, partial, unverified, or unrelated. Do not revert, stash, bulk-stage or overwrite it; preserve the user's paused changes.
- [ ] 2. Run npm run local:check using the authorized launcher. Keep existing local_staging/development, mail capture, simulated payments and .staging data. If readiness fails, record the exact failure and stop dependent runtime work; do not repair by seeding/migrating/restoring/resetting the canonical database.
- [ ] 3. Inspect the existing test fixtures before running targeted baseline tests. Record failures as pre-existing or introduced, with command/output and fixture target. Inventory the deployed revision and repository visibility only through authorized read access when available; local HEAD is not production evidence.
- [ ] 4. Map old activation/document-change work and media assets to the new tasks. Do not execute the historical activation/release plans as the current checklist.
- [ ] 5. Run the targeted baseline command below after fixture inspection. Record actual results without changing application behavior.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/seller-document-review.test.ts tests/managed-commerce-activation.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T00's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T01. Establish shared contracts, preservation fixtures and additive schema

**Workstreams:** V19, V04, V20, V15. **Depends on:** T00.

**Canonical requirements:** [2026-10-31-complete-version-scope](2026-10-31-complete-version-scope.md); [2026-10-31-system-health-records](../specs/2026-10-31-system-health-records.md).

**Files**

- Inspect/reuse; modify only where required: [db/schema.ts](../../../db/schema.ts); [lib/runtime/node-bindings.ts](../../../lib/runtime/node-bindings.ts); [tests/helpers/company-store-maker-fixture.ts](../../../tests/helpers/company-store-maker-fixture.ts); [deployment/babal/mariadb-schema.sql](../../../deployment/babal/mariadb-schema.sql).
- Create if not already supplied by a verified equivalent: `lib/workflows/contracts.ts`; `tests/helpers/complete-version-fixture.ts`; `tests/complete-version-contracts.test.ts`; `drizzle/0079_complete_version_foundation.sql`; `deployment/babal/mariadb-complete-version-foundation.sql`.
- Test: `tests/complete-version-contracts.test.ts` (planned); [tests/company-store-native-schema.test.ts](../../../tests/company-store-native-schema.test.ts).

**Interfaces:** Consumes existing guarded repositories, D1 adapter and native transactions. Produces CommandContext, OfferSnapshot, SellerCapabilities and OperationalEvent contracts defined in the orchestration plan; a disposable fixture and additive workflow/audit/outbox constraints.

**Behavior and acceptance cases**

- [ ] Same request and same content yields one result/audit/event; a changed payload with the same key is rejected.
- [ ] Two writers against one revision cannot both commit; transaction failure leaves no partial money, evidence or notification.
- [ ] Legacy rows retain amounts, identifiers and access; fixtures cannot bind the canonical .staging DB or production credentials.
- [ ] Run real database assertions on SQLite and later isolated MariaDB; source-text matches alone do not prove transaction safety.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Identify existing audit, version, request and notification tables before adding anything. Reuse working transaction guards; introduce no parallel generic workflow engine or duplicate ledger.
- [ ] 4. Create an isolated fixture with applicant, registered seller, Managed Maker, one eligible Super Admin, delegated staff, customer and foreign accounts; include legacy orders, drafts, documents, holds, payouts and scheduled terms.
- [ ] 5. Design additive nullable/backfill-safe fields and unique replay/event constraints. Preserve owner IDs, money, evidence versions and old free-text variants. Prepare SQL plus native equivalent and regeneration changes; apply only to a proven disposable fixture.
- [ ] 6. Record schema before/after assertions and stop conditions. Reserve migration identifiers only after confirming no collision; if another change has taken them, renumber new unpublished files and update this ledger, never overwrite applied history.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/complete-version-contracts.test.ts tests/company-store-native-schema.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T01's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T02. Implement authority, task ownership and continuous service clocks

**Workstreams:** V17, V03. **Depends on:** T01.

**Canonical requirements:** [2026-10-31-team-business-policies](../specs/2026-10-31-team-business-policies.md); [2026-10-31-single-super-admin-finance-approval](../specs/2026-10-31-single-super-admin-finance-approval.md); [2026-10-30-super-admin-overview-review](../specs/2026-10-30-super-admin-overview-review.md).

**Files**

- Inspect/reuse; modify only where required: [lib/marketplace/permissions.ts](../../../lib/marketplace/permissions.ts); [lib/auth/staff.ts](../../../lib/auth/staff.ts); [lib/db/repositories/staff-permissions.ts](../../../lib/db/repositories/staff-permissions.ts).
- Create if not already supplied by a verified equivalent: `lib/workflows/service-clock.ts`; `lib/workflows/review-tasks.ts`; `tests/workflow-authority-clock.test.ts`.
- Test: `tests/workflow-authority-clock.test.ts` (planned); [tests/business-settings-permissions.test.ts](../../../tests/business-settings-permissions.test.ts).

**Interfaces:** Consumes CommandContext and existing permission grants. Produces calculateServiceDueAt({startedAt,amount,unit,calendarVersion}) and owned review tasks with stable source, responsible role/user, backup, dueAt and resolution.

**Behavior and acceptance cases**

- [ ] One eligible Super Admin can prepare and approve a fictional refund/payout without a second-person deadlock.
- [ ] Foreign seller, revoked staff and conflicted actor cannot mutate or view protected evidence.
- [ ] 1/2/3 service days yield 24/48/72 hours; future calendar changes do not rewrite saved deadlines.
- [ ] Reassignment/read status does not reset due time or mark the underlying task complete.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Implement server-side capability checks, current role recheck at commit, scoped assignment/handoff and explicit backup handling. One eligible Super Admin may perform all approved finance stages; personal-beneficiary conflicts still block self-review.
- [ ] 4. Version the approved temporary continuous calendar: 1 service business day = 24 elapsed hours; staffed hours run continuously. Display Nepal time while retaining absolute timestamps and source calendar.
- [ ] 5. Preserve original receipt/actionable times through reassignment, resubmission and outages; distinguish first-response targets from guaranteed resolution.
- [ ] 6. Provide a permission and responsibility matrix for real account mapping later; do not invent people or set live staff permissions now.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/workflow-authority-clock.test.ts tests/business-settings-permissions.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T02's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T03. Replace fragile form dependency with stable core forms

**Workstreams:** V16. **Depends on:** T01, T02.

**Canonical requirements:** [2026-10-30-form-management-reliability](../specs/2026-10-30-form-management-reliability.md); [2026-10-30-form-management-field-inventory](../specs/2026-10-30-form-management-field-inventory.md).

**Files**

- Inspect/reuse; modify only where required: [lib/forms/runtime.ts](../../../lib/forms/runtime.ts); [lib/forms/submission.ts](../../../lib/forms/submission.ts); [lib/forms/registry.ts](../../../lib/forms/registry.ts); [lib/forms/validation.ts](../../../lib/forms/validation.ts); [lib/forms/catalog-changes.ts](../../../lib/forms/catalog-changes.ts); [lib/db/repositories/form-catalog.ts](../../../lib/db/repositories/form-catalog.ts); [components/forms/form-config-client.tsx](../../../components/forms/form-config-client.tsx); [components/forms/configured-fields.tsx](../../../components/forms/configured-fields.tsx); [app/api/forms/[formId]/route.ts](../../../app/api/forms/[formId]/route.ts); [app/admin/forms/page.tsx](../../../app/admin/forms/page.tsx); [app/admin/forms/[formId]/page.tsx](../../../app/admin/forms/[formId]/page.tsx).
- Create if not already supplied by a verified equivalent: `tests/form-management-core-recovery.test.ts`.
- Test: `tests/form-management-core-recovery.test.ts` (planned); [tests/form-catalog-deferred-retry.test.ts](../../../tests/form-catalog-deferred-retry.test.ts); [tests/form-catalog-feature-bootstrap.test.ts](../../../tests/form-catalog-feature-bootstrap.test.ts); [tests/form-catalog-schema.test.ts](../../../tests/form-catalog-schema.test.ts).

**Interfaces:** Consumes FORM_REGISTRY, resolvePublishedForm and validateSubmittedForm. Produces feature-owned core field definitions plus bounded optional metadata and an explicit compatible/stale/protected-action result, retaining server domain validation.

**Behavior and acceptance cases**

- [ ] Missing product/profile configuration no longer strands supported core intake behind 'Form configuration unavailable'; missing protected rules still block the specific action with saved answers.
- [ ] Label-only publication during entry retains answers and succeeds; incompatible required business changes show exactly what needs review.
- [ ] Upload and extra-field ownership/privacy survives save, publish, rollback and native schema differences.
- [ ] Application, product and staff money actions work with their real validators, not just a published metadata row.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Map every field and consumer in the approved inventory, including native-host definitions, answer snapshots and uploads. Retain IDs/values and link old Form catalogue routes to Form Management.
- [ ] 4. Separate indispensable business validation from editable labels/help/optional fields. Recover core intake when optional metadata is absent or temporarily unreadable; preserve security, money, agreement and approval checks.
- [ ] 5. Classify compatible cosmetic changes versus semantic changes. Keep entered answers and request identity, refresh affected facts only, show field-level correction and a useful retry outcome.
- [ ] 6. Make preview/publish/restore test actual affected journeys. Prevent customization from creating compulsory optional intake or bypassing protected consent; do not silently seed missing data.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/form-management-core-recovery.test.ts tests/form-catalog-deferred-retry.test.ts tests/form-catalog-feature-bootstrap.test.ts tests/form-catalog-schema.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T03's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T04. Create durable operational events and recipient mapping

**Workstreams:** V15, V03. **Depends on:** T01, T02.

**Canonical requirements:** [2026-10-30-email-delivery-automation](../specs/2026-10-30-email-delivery-automation.md); [2026-10-31-optional-product-intake-support](../specs/2026-10-31-optional-product-intake-support.md).

**Files**

- Inspect/reuse; modify only where required: [lib/operations/business-notifications.ts](../../../lib/operations/business-notifications.ts); [lib/operations/notification-links.ts](../../../lib/operations/notification-links.ts); [lib/operations/email-queue.ts](../../../lib/operations/email-queue.ts); [lib/email/outbox-runner.ts](../../../lib/email/outbox-runner.ts).
- Create if not already supplied by a verified equivalent: `lib/operations/event-catalog.ts`; `tests/operational-event-dedup.test.ts`.
- Test: `tests/operational-event-dedup.test.ts` (planned); [tests/business-notifications.test.ts](../../../tests/business-notifications.test.ts).

**Interfaces:** Consumes OperationalEvent and committed source transitions. Produces event-to-audience/channel catalog and atomic businessNotificationStatements-compatible outbox/inbox inserts; source jobs never send mail inside a database transaction.

**Behavior and acceptance cases**

- [ ] Replayed submission creates one seller notification and one Super Admin notification per channel, even if that Super Admin performed the action.
- [ ] Role overlap and two workers do not duplicate an event; separate meaningful version changes still notify.
- [ ] Reading a bell item does not complete approval or acceptance; resolved source work cancels stale attention messages.
- [ ] Unauthorized/deleted destinations show a safe explanation and never leak another seller's record.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Inventory every operational producer from the approved email map: seller/application/doc/change, product/support/profile, fees, payment/order/case, payout/refund/recovery, staff and system events.
- [ ] 4. Require Super Admin email and dashboard/bell for each genuine operational event, including actor-self actions, plus eligible responsible staff and affected users. Deduplicate a person with multiple roles.
- [ ] 5. Use stable event+source-version+recipient+channel keys and current authorization for deep links; redact full PAN, bank numbers, documents and private cost inputs from notifications.
- [ ] 6. Integrate this contract into every following producer task. Retain authentication/OTP/security transport separation; capture all development delivery locally.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/operational-event-dedup.test.ts tests/business-notifications.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T04's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T05. Build the shared Seller Center and Super Admin workspace shells

**Workstreams:** V02, V03. **Depends on:** T02, T03, T04.

**Canonical requirements:** [2026-10-30-seller-center-workspace](../specs/2026-10-30-seller-center-workspace.md); [2026-10-30-super-admin-overview-review](../specs/2026-10-30-super-admin-overview-review.md); [2026-10-31-seller-customer-screen-walkthrough](../specs/2026-10-31-seller-customer-screen-walkthrough.md).

**Files**

- Inspect/reuse; modify only where required: [app/seller/layout.tsx](../../../app/seller/layout.tsx); [app/seller/page.tsx](../../../app/seller/page.tsx); [components/seller/seller-navigation.tsx](../../../components/seller/seller-navigation.tsx); [app/admin/layout.tsx](../../../app/admin/layout.tsx); [lib/admin/navigation.ts](../../../lib/admin/navigation.ts).
- Create if not already supplied by a verified equivalent: `components/seller/seller-task-summary.tsx`; `components/admin/review-workspace.tsx`; `tests/workspace-navigation.test.ts`.
- Test: `tests/workspace-navigation.test.ts` (planned); [tests/seller-dashboard-experience.test.ts](../../../tests/seller-dashboard-experience.test.ts).

**Interfaces:** Consumes SellerCapabilities and owned review tasks. Produces seven seller sections, eight admin areas, consistent source-linked status/owner/next-action cards and preserved historical URLs.

**Behavior and acceptance cases**

- [ ] Applicant can enter registration corrections and product draft without 'approved seller access required' loop.
- [ ] Mobile Home/Products/Orders/More and desktop seven sections lead to the same records; all eight admin areas are reachable by eligible staff.
- [ ] Keyboard focus and loading/error/empty states work; old seller/product/case links retain their destination.
- [ ] An order hold does not remove dashboard access or conceal existing fulfillment responsibilities.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Implement the exact approved navigation, responsive grouping, sticky record identity and task summary. Reuse existing route entry points and redirect/map legacy links without losing record or draft context.
- [ ] 4. Distinguish application approval, document verification, publication, order eligibility and payout eligibility; never collapse them into an ambiguous Active/Verified badge.
- [ ] 5. Build common before/after review, evidence access, reason, outcome and history layout. Guard actions by current permissions and version; disabled actions explain the specific prerequisite.
- [ ] 6. Keep applicant correction, product preparation, existing order support and earnings history accessible according to capabilities; finish area content in the owning tasks.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/workspace-navigation.test.ts tests/seller-dashboard-experience.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T05's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.


