# Complete version — Seller records and review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Prepared 1 November 2026. Documentation only; implementation remains on hold until the user resumes it. This is part 2 of one release, not a separate release.

**Goal:** Complete the ordered tasks below against their approved source requirements.

**Architecture:** Extend the existing repositories, guards, feature-owned forms and shared projections. Use the [orchestration plan](2026-11-01-complete-version-implementation.md) for cross-task contracts and policy precedence.

**Tech Stack:** Existing React 19 / vinext / TypeScript application, Drizzle schema, D1/SQLite and native MariaDB adapter, Node test runner and approved browser tools.

**Spec:** [All 20 workstreams](2026-10-31-complete-version-scope.md); each task lists its canonical sources. The source requirements remain controlling when a short task summary omits detail.

## Global Constraints

Read the [orchestration constraints](2026-11-01-complete-version-implementation.md) and [new-chat handoff](2026-11-01-new-chat-handoff.md) first. No code, data, release or live record changes are performed by preparing this plan. During implementation preserve the canonical checkout and dirty checkpoint; do not seed/reset/migrate existing local data to pass startup. Update the [progress ledger](2026-11-01-implementation-progress.md) with evidence after each task. Planned filenames are exact intended locations; if an existing implementation already provides the responsibility, record that mapping and reuse it rather than duplicate it.

## Review Focus

Apply the five failure modes in the orchestration plan to the owning tasks below. Test actual state/transactions, not only source-text patterns. Existing targeted tests are starting coverage, not proof that the new cases are already implemented. New test files must be written before their related new behavior. Do not create artificial red tests for unchanged, already-proven behavior.

## T06. Complete simple registration, honest autosave and applicant access

**Workstreams:** V01, V02. **Depends on:** T03, T05.

**Canonical requirements:** [2026-10-30-seller-order-response](2026-10-30-seller-order-response.md); [2026-10-30-seller-center-workspace](../specs/2026-10-30-seller-center-workspace.md).

**Files**

- Inspect/reuse; modify only where required: [components/seller/seller-application-form.tsx](../../../components/seller/seller-application-form.tsx); [lib/sellers/registration-intake.ts](../../../lib/sellers/registration-intake.ts); [lib/sellers/draft-store.ts](../../../lib/sellers/draft-store.ts); [lib/sellers/contact-phone.ts](../../../lib/sellers/contact-phone.ts); [lib/db/repositories/seller-commercial-access.ts](../../../lib/db/repositories/seller-commercial-access.ts); [lib/auth/seller.ts](../../../lib/auth/seller.ts); [app/sell/apply/page.tsx](../../../app/sell/apply/page.tsx); [app/api/seller-applications/draft/route.ts](../../../app/api/seller-applications/draft/route.ts); [app/api/seller-applications/route.ts](../../../app/api/seller-applications/route.ts).
- Create if not already supplied by a verified equivalent: `tests/registration-resume-journey.test.ts`.
- Test: `tests/registration-resume-journey.test.ts` (planned); [tests/seller-optional-registration.test.ts](../../../tests/seller-optional-registration.test.ts); [tests/seller-draft.test.ts](../../../tests/seller-draft.test.ts); [tests/seller-registration-phone.test.ts](../../../tests/seller-registration-phone.test.ts); [tests/seller-access-denied-recovery.test.ts](../../../tests/seller-access-denied-recovery.test.ts).

**Interfaces:** Consumes stable core form, existing draft/intake repositories and owner session. Produces one resumable owner-bound application plus explicit saving/saved/failed states and a dashboard continuation.

**Behavior and acceptance cases**

- [ ] Blank optional sections and incomplete registration can submit; later correction updates the same application.
- [ ] Enter half a form, navigate away, return and verify durable saved values; failed/offline writes never show 'Saved'.
- [ ] Another signed-in user cannot restore the previous user's draft or uploads; concurrent tabs show recoverable conflict.
- [ ] Address copying is editable; repeated submission and an old config response do not create duplicate applications.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Keep initial fields optional and clean labels; remove Best time to contact you, bank, public profile and products from registration. Use Citizenship number, compact expandable agreement and copy-pickup-to-return/full-address actions.
- [ ] 4. Nepal is the initial phone country; accept valid 10-digit Nepal numbers without phone OTP. Preserve supported country formats rather than applying ten digits to every country; blank optional phone remains valid.
- [ ] 5. Save drafts through supported storage without silent data loss on back/navigation/reload, session expiry, multiple tabs, offline or slow saves. Protect private fields on shared accounts/devices and reconcile stale draft versions.
- [ ] 6. Submit incomplete intake exactly once, show the actual submission result, route missing details to dashboard and allow product preparation; do not fabricate agreement acceptance or verified email/phone.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/registration-resume-journey.test.ts tests/seller-optional-registration.test.ts tests/seller-draft.test.ts tests/seller-registration-phone.test.ts tests/seller-access-denied-recovery.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T06's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T07. Finish PAN/identity verification and protected document change requests

**Workstreams:** V04. **Depends on:** T03, T04, T06.

**Canonical requirements:** [2026-10-30-seller-management-workspace](../specs/2026-10-30-seller-management-workspace.md); [2026-10-31-bank-identity-changes-payout-approval](../specs/2026-10-31-bank-identity-changes-payout-approval.md).

**Files**

- Inspect/reuse; modify only where required: [lib/sellers/document-review.ts](../../../lib/sellers/document-review.ts); [app/api/admin/seller-documents/[id]/route.ts](../../../app/api/admin/seller-documents/[id]/route.ts); [app/api/seller-applications/document-change/route.ts](../../../app/api/seller-applications/document-change/route.ts); [app/api/admin/seller-document-change-requests/[id]/route.ts](../../../app/api/admin/seller-document-change-requests/[id]/route.ts); [app/admin/sellers/[id]/page.tsx](../../../app/admin/sellers/[id]/page.tsx); [components/admin/seller-document-review.tsx](../../../components/admin/seller-document-review.tsx).
- Create if not already supplied by a verified equivalent: `components/seller/document-change-request-form.tsx`; `tests/document-change-interface.test.ts`.
- Test: `tests/document-change-interface.test.ts` (planned); [tests/seller-document-review.test.ts](../../../tests/seller-document-review.test.ts); [tests/managed-documents-email.test.ts](../../../tests/managed-documents-email.test.ts).

**Interfaces:** Consumes existing verifySellerDocument, verifiedDocumentChangeGuards and versioned evidence records. Produces reviewed PAN/identity states, scoped reasoned requests and a complete replacement/reverification history.

**Behavior and acceptance cases**

- [ ] Verified file cannot be changed through direct endpoint or a concurrent upload that began before verification.
- [ ] Approved request for one PAN does not unlock identity/bank or a later different version; stale/foreign approvals fail.
- [ ] Replacing approved evidence creates pending review and retained history; no auto-verification or activation.
- [ ] Approve/reject/retry generates one auditable result and required notifications; missing reason is actionable inline.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Reconcile existing implemented endpoints first. Add view/verify/reject/request-correction controls with reason, exact document version, reviewer and time; separate bank confirmation from PAN/identity review.
- [ ] 4. Lock verified documents and associated protected facts against direct API/UI replacement. Seller supplies a real change reason; authorized review grants only the exact replacement scope, then replacement returns to pending verification.
- [ ] 5. Preserve original document/history and current protected evidence until a valid transition. Show pending/current/replacement side by side with precise seller next steps and a first-triage due time.
- [ ] 6. Wire source-linked events, seller dashboard request state and Super Admin notifications; owner/conflict and permission checks remain at commit.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/document-change-interface.test.ts tests/seller-document-review.test.ts tests/managed-documents-email.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T07's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T08. Implement bank and material-identity changes with independent holds

**Workstreams:** V04, V12. **Depends on:** T07.

**Canonical requirements:** [2026-10-31-bank-identity-changes-payout-approval](../specs/2026-10-31-bank-identity-changes-payout-approval.md); [2026-10-31-single-super-admin-finance-approval](../specs/2026-10-31-single-super-admin-finance-approval.md).

**Files**

- Inspect/reuse; modify only where required: [lib/sellers/bank-details.ts](../../../lib/sellers/bank-details.ts); [lib/db/repositories/managed-maker-details.ts](../../../lib/db/repositories/managed-maker-details.ts); [lib/db/repositories/seller-workspace.ts](../../../lib/db/repositories/seller-workspace.ts); [components/admin/seller-bank-review.tsx](../../../components/admin/seller-bank-review.tsx); [components/seller/bank-details-form.tsx](../../../components/seller/bank-details-form.tsx); [app/api/seller/bank-details/route.ts](../../../app/api/seller/bank-details/route.ts); [app/api/admin/seller-applications/[id]/bank-details/route.ts](../../../app/api/admin/seller-applications/[id]/bank-details/route.ts).
- Create if not already supplied by a verified equivalent: `lib/sellers/protected-change-policy.ts`; `tests/protected-change-holds.test.ts`.
- Test: `tests/protected-change-holds.test.ts` (planned); [tests/seller-bank-details.test.ts](../../../tests/seller-bank-details.test.ts); [tests/seller-deferred-bank.test.ts](../../../tests/seller-deferred-bank.test.ts).

**Interfaces:** Consumes exact identity/bank versions and protected change classification. Produces scoped payout/new-order holds with reason, evidence, owner, dueAt and explicit restoration decision.

**Behavior and acceptance cases**

- [ ] Bank-only correction does not unnecessarily stop new orders; material identity change enforces the approved scope.
- [ ] Pending payout cannot pay new unreviewed bank details; sent/uncertain transfers keep their original beneficiary.
- [ ] Clearing bank hold does not clear a separate terms or identity hold; old order/invoice/address snapshots stay unchanged.
- [ ] One eligible non-conflicted Super Admin can review; matching text alone does not fabricate beneficiary verification.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Expose authorized Super Admin comparison of seller registration, identity, PAN and beneficiary details; mask normal views and audit sensitive access. Prohibit unrelated third-party payout destinations.
- [ ] 4. Classify bank-only, material/unclassified identity and same-facts evidence refresh exactly as the approved matrix. Bank change blocks affected payouts; material/unclassified identity blocks the required new orders and finance paths without removing dashboard/existing obligations.
- [ ] 5. Invalidate affected prepared-but-unpaid payout packets when their reviewed source changes. Preserve sent and uncertain transfer destinations/reservations until reconciliation; never redirect already-sent money.
- [ ] 6. Restore only the resolved hold after reviewed replacement; overlapping commercial, terms, safety or payment holds remain. First triage is within one service day from initial complete request, not replacement upload.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/protected-change-holds.test.ts tests/seller-bank-details.test.ts tests/seller-deferred-bank.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T08's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T09. Implement public profile revision and the seven-day publication cooldown

**Workstreams:** V05, V02. **Depends on:** T05, T07.

**Canonical requirements:** [2026-10-31-public-profile-changes-cooldown](../specs/2026-10-31-public-profile-changes-cooldown.md).

**Files**

- Inspect/reuse; modify only where required: [lib/sellers/public-profile.ts](../../../lib/sellers/public-profile.ts); [lib/db/repositories/seller-profile.ts](../../../lib/db/repositories/seller-profile.ts); [components/seller/seller-profile-form.tsx](../../../components/seller/seller-profile-form.tsx); [app/api/seller/public-profile/route.ts](../../../app/api/seller/public-profile/route.ts); [app/seller/profile/page.tsx](../../../app/seller/profile/page.tsx); [db/schema.ts](../../../db/schema.ts); [deployment/babal/mariadb-schema.sql](../../../deployment/babal/mariadb-schema.sql).
- Create if not already supplied by a verified equivalent: `components/admin/public-profile-review.tsx`; `tests/profile-publication-cooldown.test.ts`; `drizzle/0080_profile_revision_review.sql`; `deployment/babal/mariadb-profile-revision-review.sql`.
- Test: `tests/profile-publication-cooldown.test.ts` (planned); [tests/seller-public-profile-cooldown.test.ts](../../../tests/seller-public-profile-cooldown.test.ts); [tests/seller-dashboard-records.test.ts](../../../tests/seller-dashboard-records.test.ts).

**Interfaces:** Consumes reviewed public-profile revisions and existing operational address records. Produces current/pending public versions, publicationAt/nextNormalEditAt and separate operational updates.

**Behavior and acceptance cases**

- [ ] Publish at T; normal edit is blocked before T+168h and allowed at the exact boundary.
- [ ] Correction/no-op/approval-only does not reset cooldown; concurrent publication yields one winning revision.
- [ ] Operational location change is usable where permitted and leaves an older order's address unchanged.
- [ ] Private registration, bank or PAN fields never appear in public profile/preview/metadata.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Build draft, preview, submit, correction, approve/publish and history. Keep current public profile visible while a candidate is reviewed; clear before/after comparison for Super Admin.
- [ ] 4. Start the 168-hour normal-edit cooldown only at actual normal publication. Drafting, approval without publication, a no-op or rejected revision cannot start/reset it; approved correction exceptions retain the original deadline.
- [ ] 5. Keep phone/support contacts and pickup/return location editing in their approved operational scope. Validate and copy addresses conveniently without changing historical order destinations.
- [ ] 6. Review target is one service business day; current/pending/cooldown displays use one authoritative timestamp and retain submitted answers on conflict.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/profile-publication-cooldown.test.ts tests/seller-public-profile-cooldown.test.ts tests/seller-dashboard-records.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T09's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T10. Complete the unified seller review and readiness screen

**Workstreams:** V03, V04. **Depends on:** T05, T07, T08, T09.

**Canonical requirements:** [2026-10-30-seller-management-workspace](../specs/2026-10-30-seller-management-workspace.md); [2026-10-30-super-admin-overview-review](../specs/2026-10-30-super-admin-overview-review.md).

**Files**

- Inspect/reuse; modify only where required: [app/admin/sellers/[id]/page.tsx](../../../app/admin/sellers/[id]/page.tsx); [components/admin/seller-review-actions.tsx](../../../components/admin/seller-review-actions.tsx); [lib/db/repositories/seller-workspace.ts](../../../lib/db/repositories/seller-workspace.ts); [lib/auth/seller-commercial-access.ts](../../../lib/auth/seller-commercial-access.ts).
- Create if not already supplied by a verified equivalent: `lib/sellers/readiness.ts`; `tests/seller-readiness-matrix.test.ts`.
- Test: `tests/seller-readiness-matrix.test.ts` (planned); [tests/company-store-maker-admin.test.ts](../../../tests/company-store-maker-admin.test.ts); [tests/company-store-maker-workspace.test.ts](../../../tests/company-store-maker-workspace.test.ts).

**Interfaces:** Consumes all seller/application/document/terms/hold versions. Produces getSellerReadiness(db,sellerId,now): Promise<SellerCapabilities> with action-specific blockers; live activation command is implemented in T28.

**Behavior and acceptance cases**

- [ ] An approved-for-activation maker can submit products even when orders are blocked by legitimate commercial checks.
- [ ] Pending PAN/identity and verified bank show independent truthful states; conflicting list/detail badges are eliminated.
- [ ] Dashboard access is retained while only a specific capability is held.
- [ ] One exact readiness source governs list, detail, seller Home, product eligibility and later checkout gates.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Unify record summary, evidence, registration, bank comparison, products, requests, orders/finance links and review history in one seller record.
- [ ] 4. Show Approved for activation separately from Can submit products, Public listings, Accepting orders and Payout eligible. Give the owning actor a direct link for each unresolved requirement.
- [ ] 5. Keep admin review retry/idempotency coherent: reveal the outcome of a prior attempt; do not ask for a new attempt when a known committed result can be loaded.
- [ ] 6. Do not approve real sellers or infer checks from an old note. Existing demo/simulation activation remains explicitly separate from live readiness.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/seller-readiness-matrix.test.ts tests/company-store-maker-admin.test.ts tests/company-store-maker-workspace.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T10's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T11. Manage company receiving accounts and payment instruction versions

**Workstreams:** V11, V03. **Depends on:** T02, T03, T04.

**Canonical requirements:** [2026-10-31-manual-payment-rules](../specs/2026-10-31-manual-payment-rules.md); [2026-10-30-finance-payments-workspace](../specs/2026-10-30-finance-payments-workspace.md).

**Files**

- Inspect/reuse; modify only where required: [app/admin/business-settings/page.tsx](../../../app/admin/business-settings/page.tsx); [components/admin/business-settings-manager.tsx](../../../components/admin/business-settings-manager.tsx); [lib/db/repositories/business-settings.ts](../../../lib/db/repositories/business-settings.ts); [db/schema.ts](../../../db/schema.ts); [deployment/babal/mariadb-schema.sql](../../../deployment/babal/mariadb-schema.sql).
- Create if not already supplied by a verified equivalent: `lib/payments/company-accounts.ts`; `components/admin/company-bank-accounts.tsx`; `tests/company-bank-instructions.test.ts`; `drizzle/0081_company_payment_accounts.sql`; `deployment/babal/mariadb-company-payment-accounts.sql`.
- Test: `tests/company-bank-instructions.test.ts` (planned); [tests/business-settings-permissions.test.ts](../../../tests/business-settings-permissions.test.ts).

**Interfaces:** Consumes approved company identity and verified account versions. Produces publishCompanyReceivingAccount(db,ctx,input) and immutable order payment-instruction snapshots; no bank API or transfer.

**Behavior and acceptance cases**

- [ ] New instructions use the published company account; existing instructions retain the original reviewed version.
- [ ] Wrong-role requests cannot publish or expose full bank evidence; seller bank changes cannot overwrite company receiving account.
- [ ] Retirement does not erase old payment/refund reconciliation links.
- [ ] Editing an account does not move money or mark an incoming payment verified.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Provide restricted add/review/publish/retire/history management, account ownership evidence and current instruction preview. User-provided HASTA BAZAAR PRIVATE LIMITED / Nabil Bank / Birgunj / account ending 3252 is supplied data, not proof of current ownership or bank confirmation.
- [ ] 4. Separate company customer-payment receiving accounts from private seller payout accounts. Do not put full banking data into logs, notifications, unrelated public profiles or test fixtures.
- [ ] 5. Bind each order's issued instructions to the company account version; handle retired/replaced accounts with an owned reconciliation path instead of silently changing old instructions.
- [ ] 6. Use synthetic fixtures now; real banking publication and credentials remain a separately authorized operational action.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/company-bank-instructions.test.ts tests/business-settings-permissions.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T11's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.


