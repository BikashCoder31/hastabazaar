# Unilateral Super Admin Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one active, authorized Super Admin complete every existing Super Admin-controlled approval workflow without a second Super Admin identity, while preserving explicit workflow stages and audit evidence.

**Architecture:** Remove only actor-inequality enforcement from the canonical schemas, repository guards, presentation helpers, and UI. Keep role/capability checks, state transitions, validation, effective dates, idempotency, and audit fields unchanged; the same user ID may be recorded at both preparation and approval stages. Pass the authenticated staff role into Business Settings so ordinary Admins see the required-approval notice while Super Admins do not.

**Tech Stack:** TypeScript 5.9, React 19, vinext/Next-compatible server components, Cloudflare D1/SQLite, MariaDB 10.11, Node test runner, Drizzle schema definitions.

**Spec:** `docs/superpowers/specs/2026-09-21-unilateral-super-admin-approval-design.md`

## Global Constraints

- Work only in `codex/hastabazaar-v1-2-1-staging`; do not deploy production.
- Preserve the existing multi-stage workflows; approval remains an explicit action.
- Mutations remain server-authorized by active role and required permission.
- Do not relax seller, rider, customer, self-deletion, status, amount, scheduling, simulation, or real-payment safeguards.
- Preserve all existing rows and immutable audit/history records.
- Keep additional Super Admin invitations and accounts supported.
- Ordinary Admins see `Super Admin approval required`; Super Admins do not see that warning.
- Use test-driven development and observe every new regression test fail before implementation.

## Review Focus

- An actor with an `admin` role but a similarly named permission must still receive a server-side denial for reserved approval actions.
- A Super Admin approving their own prepared item must leave both preparation and decision audit identities intact, even when equal.
- A migration applied to populated tables must preserve row counts, foreign keys, indexes, and immutable-history triggers.
- Reapplying the MariaDB migration must be safe when the named or generated inequality constraint is already absent.
- Dual-role users must not gain the ability to verify their own rider remittance or remove their own critical access.

---

### Task 1: Versioned schema support for equal approval actors

**Files:**
- Modify: `db/schema.ts`
- Create: `drizzle/0056_unilateral_super_admin_approval.sql`
- Create: `deployment/babal/mariadb-unilateral-super-admin-approval.sql`
- Modify: `deployment/babal/mariadb-schema.sql`
- Modify: `deployment/babal/mariadb-reset-empty-import.sql`
- Modify: `scripts/generate-mariadb-schema.mjs`
- Modify: `scripts/generate-release-manifest.mjs`
- Modify: `deployment/babal/release-manifest.json`
- Create: `tests/unilateral-super-admin-schema.test.ts`

**Interfaces:**
- Consumes: existing actor columns such as `prepared_by`, `approved_by`, `created_by`, `decided_by`, `proposed_by`, and `high_value_approved_by`.
- Produces: schemas in which those columns retain foreign keys and audit meaning but no longer require distinct identities for Super Admin-controlled decisions.

- [ ] **Step 1: Write failing schema regression tests**

Create tests that load the canonical schema and new migration path, assert the seven second-actor checks are absent, apply the SQLite migration to populated synthetic affected tables, and verify preserved rows plus equal actor updates. The core assertions are:

```ts
for (const forbidden of [
  'payouts_maker_checker',
  'promotions_maker_checker',
  'staff_permission_maker_checker',
  'managed_payout_maker_checker',
  'refunds_high_value_maker_checker',
  'decided_by<>created_by',
  'approved_by<>prepared_by',
]) assert.doesNotMatch(canonicalSchema, new RegExp(forbidden, 'i'));

assert.doesNotThrow(() =>
  sqlite.prepare("UPDATE payouts SET approved_by=prepared_by WHERE id='p1'").run(),
);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM payouts").get().n, 1);
```

- [ ] **Step 2: Run the schema test and verify RED**

Run: `npx tsx --test tests/unilateral-super-admin-schema.test.ts`

Expected: FAIL because the inequality checks and migration still exist.

- [ ] **Step 3: Implement the SQLite and MariaDB migrations**

Remove the inequality `check(...)` declarations from `db/schema.ts`. Add an atomic SQLite table-rebuild migration for affected tables that copies every column, recreates all non-inequality checks/indexes/triggers, validates row counts, and re-enables foreign keys. Add a repeatable MariaDB migration that discovers and drops only CHECK constraints whose clauses compare the relevant actor columns; do not drop any status, amount, date, or integrity check.

Register `mariadb-unilateral-super-admin-approval.sql` after the hero migration in the schema generator and release manifest generator, then regenerate checked-in MariaDB schema/reset/manifest artifacts.

- [ ] **Step 4: Run schema verification and verify GREEN**

Run: `npx tsx --test tests/unilateral-super-admin-schema.test.ts tests/node-hosting.test.ts`

Expected: PASS with preserved synthetic records, equal actor IDs accepted, and no unrelated constraint removed.

- [ ] **Step 5: Commit**

```bash
git add db/schema.ts drizzle/0056_unilateral_super_admin_approval.sql deployment/babal/mariadb-unilateral-super-admin-approval.sql deployment/babal/mariadb-schema.sql deployment/babal/mariadb-reset-empty-import.sql scripts/generate-mariadb-schema.mjs scripts/generate-release-manifest.mjs deployment/babal/release-manifest.json tests/unilateral-super-admin-schema.test.ts
git commit -m "feat: support unilateral super admin audit actors"
```

### Task 2: Controlled Business Settings self-approval and role-aware notice

**Files:**
- Modify: `tests/business-settings-permissions.test.ts`
- Modify: `tests/business-settings-repository.test.ts`
- Modify: `tests/business-settings-presentation.test.ts`
- Modify: `lib/configuration/authorization.ts`
- Modify: `lib/db/repositories/business-settings.ts`
- Modify: `components/admin/business-settings-manager.tsx`
- Modify: `app/admin/business-settings/page.tsx`
- Modify: `lib/marketplace/permissions.ts`

**Interfaces:**
- Consumes: `StaffUser.role`, `authorizeBusinessSettingAction(actor, action, context)`, and the current version state machine.
- Produces: `BusinessSettingsManager({ initialSettings, asOf, actorRole })`, where `actorRole` is `'admin' | 'super_admin'`.

- [ ] **Step 1: Change tests to require unilateral approval**

Add a repository test in which one `super-a` actor creates, submits, and approves a controlled setting. Assert the version becomes `published`, `submittedBy === 'super-a'`, `approvedBy === 'super-a'`, and the audit trail retains separate submit and approve events. Add authorization denial for an ordinary Admin.

Add two render cases:

```ts
const adminHtml = renderToStaticMarkup(createElement(BusinessSettingsManager, {
  actorRole: 'admin', asOf: 2_000, initialSettings,
}));
assert.match(adminHtml, /Super Admin approval required/i);

const superHtml = renderToStaticMarkup(createElement(BusinessSettingsManager, {
  actorRole: 'super_admin', asOf: 2_000, initialSettings,
}));
assert.doesNotMatch(superHtml, /Super Admin approval required/i);
assert.doesNotMatch(superHtml, /Different Super Admin/i);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx tsx --test tests/business-settings-permissions.test.ts tests/business-settings-repository.test.ts tests/business-settings-presentation.test.ts`

Expected: FAIL on self-approval and the missing `actorRole` presentation behavior.

- [ ] **Step 3: Remove only different-identity guards**

Keep permission checks in `authorizeBusinessSettingAction`, but delete the `proposedBy === actor.id` rejection. In the repository, retain `status`, revision, submission-presence, publication-readiness, notice-period, and effective-date guards while removing only `submittedBy === actorId` and `submitted_by <> ?` conditions for approve/reject.

Capture `const staff = await requireStaffPage(...)` in the page, pass `actorRole={staff.role}`, and render the warning badge only for `actorRole === 'admin'`. Update page and registry copy so no Super Admin is instructed to find a different Super Admin.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx tsx --test tests/business-settings-permissions.test.ts tests/business-settings-repository.test.ts tests/business-settings-presentation.test.ts`

Expected: PASS, including ordinary Admin denial and preserved scheduling/history assertions.

- [ ] **Step 5: Commit**

```bash
git add tests/business-settings-permissions.test.ts tests/business-settings-repository.test.ts tests/business-settings-presentation.test.ts lib/configuration/authorization.ts lib/db/repositories/business-settings.ts components/admin/business-settings-manager.tsx app/admin/business-settings/page.tsx lib/marketplace/permissions.ts
git commit -m "feat: allow unilateral business setting approval"
```

### Task 3: Marketplace financial, promotion, and staff decisions

**Files:**
- Modify: `tests/admin-presentation.test.ts`
- Modify: `tests/staff-permissions.test.ts`
- Modify: `tests/returns-complaints.test.ts`
- Modify: `lib/admin/payout-actions.ts`
- Modify: `lib/db/repositories/payouts.ts`
- Modify: `lib/db/repositories/returns.ts`
- Modify: `lib/db/repositories/operations.ts`
- Modify: `lib/db/repositories/staff-permissions.ts`
- Modify: `components/admin/payout-actions.tsx`
- Modify: `components/admin/return-case-actions.tsx`
- Modify: `components/admin/governance-console.tsx`
- Modify: `components/admin/staff-permission-manager.tsx`
- Modify: `components/seller/payout-request-form.tsx`
- Modify: `app/admin/payouts/page.tsx`
- Modify: `app/admin/payouts/[id]/page.tsx`
- Modify: `app/admin/cases/returns/[id]/page.tsx`
- Modify: `app/api/admin/staff-permissions/route.ts`

**Interfaces:**
- Consumes: existing `staffMutationGuard`, action permissions, state transitions, request IDs, and audit writers.
- Produces: presentation and repositories that allow the same authorized Super Admin to prepare and decide while denying ordinary Admins without the reserved permission.

- [ ] **Step 1: Write failing behavioral tests**

Change payout, refund, promotion, and staff-permission tests so one Super Admin performs both stages successfully. Assert status, equal actor IDs, unchanged amount/schedule data, and exactly one audit event per request ID. Preserve tests proving an ordinary Admin cannot perform reserved approval actions and that a user cannot change their own account/critical access.

Update presentation expectations:

```ts
assert.deepEqual(
  availablePayoutActions('prepared', {
    canApprove: true, canProcess: true, isPreparer: true,
  }),
  ['approve', 'reject'],
);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx tsx --test tests/admin-presentation.test.ts tests/staff-permissions.test.ts tests/returns-complaints.test.ts`

Expected: FAIL at each current self-approval guard or hidden action.

- [ ] **Step 3: Implement minimal repository and UI changes**

Remove only comparisons between the decision actor and the preparation actor. Keep `staffMutationGuard`, role checks, request ownership checks, target-user checks, state requirements, amount thresholds, transaction guards, and audit writes.

Expose approval buttons to an authorized Super Admin even when `isPreparer` is true. Replace all “different Super Admin” and “maker-checker” user-facing text with neutral explicit-approval language. Do not claim money is sent when recording simulated or administrative status changes.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx tsx --test tests/admin-presentation.test.ts tests/staff-permissions.test.ts tests/returns-complaints.test.ts`

Expected: PASS with same-actor approvals and all authorization/ownership negatives intact.

- [ ] **Step 5: Commit**

```bash
git add tests/admin-presentation.test.ts tests/staff-permissions.test.ts tests/returns-complaints.test.ts lib/admin/payout-actions.ts lib/db/repositories/payouts.ts lib/db/repositories/returns.ts lib/db/repositories/operations.ts lib/db/repositories/staff-permissions.ts components/admin/payout-actions.tsx components/admin/return-case-actions.tsx components/admin/governance-console.tsx components/admin/staff-permission-manager.tsx components/seller/payout-request-form.tsx app/admin/payouts/page.tsx app/admin/payouts/[id]/page.tsx app/admin/cases/returns/[id]/page.tsx app/api/admin/staff-permissions/route.ts
git commit -m "feat: allow unilateral super admin decisions"
```

### Task 4: Managed-program decisions and payments

**Files:**
- Modify: `tests/managed-settlements.test.ts`
- Modify: `tests/managed-fixed-supply.test.ts`
- Modify: `lib/db/repositories/managed-settlements.ts`
- Modify: `lib/managed-commerce/fixed-supply.ts`
- Modify: `components/admin/managed-program-review.tsx`

**Interfaces:**
- Consumes: active Super Admin database checks and simulation-only environment guards.
- Produces: same-actor managed supply decisions and simulated payout approvals, with unchanged state and simulation restrictions.

- [ ] **Step 1: Write failing managed-workflow tests**

Replace self-approval rejection expectations with success cases:

```ts
await transitionFixedSupplierPayment(database, {
  paymentId, actorId: 'super-1', action: 'approve',
  requestId: 'same-super-approve', now: 400, environment,
});
assert.equal(paymentRow.approvedBy, 'super-1');
```

Do the same for managed payout approval and fixed-supply proposal decisions. Retain tests for inactive/non-Super-Admin denial, wrong status, duplicate request idempotency, and production simulation rejection.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx tsx --test tests/managed-settlements.test.ts tests/managed-fixed-supply.test.ts`

Expected: FAIL on current `preparedBy === actorId` and `createdBy === actorId` guards.

- [ ] **Step 3: Remove only second-identity enforcement**

Keep active-Super-Admin database authorization and `assertSimulationAllowed`. Remove the self-approval comparisons, retain the exact status preconditions, and change audit/UI wording from “different reviewer” to “Super Admin”.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx tsx --test tests/managed-settlements.test.ts tests/managed-fixed-supply.test.ts`

Expected: PASS with simulation and unauthorized-actor failures unchanged.

- [ ] **Step 5: Commit**

```bash
git add tests/managed-settlements.test.ts tests/managed-fixed-supply.test.ts lib/db/repositories/managed-settlements.ts lib/managed-commerce/fixed-supply.ts components/admin/managed-program-review.tsx
git commit -m "feat: allow unilateral managed program approvals"
```

### Task 5: Cross-cutting regression, local browser QA, and handoff evidence

**Files:**
- Modify if generated by existing workflow: `deployment/babal/release-manifest.json`
- Create: `outputs/unilateral-super-admin-approval-2026-09-21/verification.md`
- Create: `outputs/unilateral-super-admin-approval-2026-09-21/browser-qa.md`

**Interfaces:**
- Consumes: all earlier task behavior and schemas.
- Produces: complete staging verification evidence and a reviewable branch commit; no production mutation.

- [ ] **Step 1: Add cross-cutting source regression**

Add an assertion to `tests/unilateral-super-admin-schema.test.ts` that executable/UI source no longer contains `Different Super Admin`, `different active Super Admin`, `different authorized reviewer`, or actor-inequality guards in the approved in-scope files, while retained rider/seller/self-access guards remain present.

- [ ] **Step 2: Run all automated verification**

Run:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run build:babal
```

Expected: all tests pass, TypeScript exits 0, lint exits 0, both builds exit 0, and the manifest contains the versioned MariaDB migration.

- [ ] **Step 3: Perform local browser QA**

Using fictional staging identities, verify at desktop and mobile widths:

- Admin view shows `Super Admin approval required` and cannot approve.
- Super Admin view omits the warning and can submit then approve the same Business Settings version.
- Super Admin can approve their own prepared payout, promotion, staff-permission request, high-value refund, and simulated managed payment where fixtures exist.
- Additional Super Admin remains available in the invitation role selector.
- No console errors, failed requests, overflow, or clipped controls occur.

- [ ] **Step 4: Record evidence and commit**

Write exact commands, pass counts, browser widths, identities, workflow results, and the staging-only/production-unverified limitation into the two output files.

```bash
git add tests/unilateral-super-admin-schema.test.ts outputs/unilateral-super-admin-approval-2026-09-21 deployment/babal/release-manifest.json
git commit -m "test: verify unilateral super admin approvals"
```

- [ ] **Step 5: Final whole-branch review**

Create the executing-plans review package from the pre-feature merge base through HEAD. Review specifically for authorization widening, lost audit evidence, migration data loss, stale UI blocking, and bypassed simulation restrictions. Fix every Critical or Important finding with a RED-to-GREEN test and rerun the full suite before handoff.
