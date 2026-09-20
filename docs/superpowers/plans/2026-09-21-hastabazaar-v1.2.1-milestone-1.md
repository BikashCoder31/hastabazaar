# Hastabazaar v1.2.1 Milestone 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an isolated local staging foundation, typed versioned super-admin configuration, controlled permissions, and shared Registered Seller/Managed Maker onboarding and profile foundations.

**Architecture:** Extend the existing D1-compatible repository boundary and MariaDB adapter with additive tables. Business settings are resolved through a typed registry; commercial model semantics remain code-defined capabilities. Existing seller/product/media/audit infrastructure is reused and historical snapshots are not rewritten.

**Tech Stack:** TypeScript 5.9, React 19, Vinext, Drizzle, D1-compatible SQL, MariaDB adapter, Node test runner, existing shadcn/Base UI components.

**Spec:** `docs/superpowers/specs/2026-09-21-hastabazaar-v1.2.1-staging-design.md`

## Global constraints

- Staging only; no production deployment, migration, settings, queues, messages, payments, or agreements.
- Use `Asia/Kathmandu` for business schedules.
- Managed sale-linked staging default is 9% platform retention and 91% maker entitlement, never “9% maker entitlement.”
- Independent-seller commission and managed commercial terms remain separate.
- Fixed supplier-price purchasing has no automatic 9% deduction.
- Company-registration fields remain unchanged and incomplete.
- All database changes are additive and D1/MariaDB compatible.
- All product code follows test-first RED→GREEN development.

## Review focus

- Environment spoofing must not unlock simulated fixtures or reset non-disposable data.
- Effective-date boundaries and concurrent publication must resolve one authoritative version.
- Managed and independent financial settings must never share a key or calculation path.
- Optional onboarding/profile fields must not become hidden submission requirements.
- Existing orders, agreements, balances, and settings must remain unchanged when new versions publish.

### Task 1: Baseline, staging guard, and configuration contracts

**Files:**
- Create: `lib/staging/environment.ts`
- Create: `lib/configuration/types.ts`
- Create: `lib/configuration/definitions.ts`
- Create: `tests/staging-environment.test.ts`
- Create: `tests/business-settings.test.ts`

- [ ] Write failing environment and typed-definition tests.
- [ ] Run the tests and verify failures identify the missing modules.
- [ ] Implement immutable environment classification, simulation labels, registered keys, and financial-key separation.
- [ ] Run focused tests and the full suite.
- [ ] Commit the task.

### Task 2: Additive versioned configuration persistence

**Files:**
- Create: `drizzle/0044_business_configuration.sql`
- Modify: `db/schema.ts`
- Create: `lib/db/repositories/business-settings.ts`
- Create: `tests/business-settings-repository.test.ts`
- Modify: `scripts/generate-mariadb-schema.mjs`

- [ ] Write failing repository tests for draft, publish, controlled approval, effective resolution, overlap prevention, history, and superseding reversal.
- [ ] Verify RED.
- [ ] Add the schema and minimal repository behavior.
- [ ] Verify D1 tests and generated MariaDB compatibility.
- [ ] Run the full suite and commit.

### Task 3: Permissions and controlled publication APIs

**Files:**
- Modify: `lib/marketplace/permissions.ts`
- Create: `app/api/admin/business-settings/route.ts`
- Create: `app/api/admin/business-settings/[key]/route.ts`
- Create: `app/api/admin/business-settings/changes/[id]/route.ts`
- Create: `tests/business-settings-permissions.test.ts`

- [ ] Write failing server-authorization, self-approval, stale-version, and unknown-key tests.
- [ ] Verify RED.
- [ ] Implement server-side guards and APIs.
- [ ] Verify GREEN, full suite, and commit.

### Task 4: Business Settings and Program Management UI

**Files:**
- Create: `app/admin/business-settings/page.tsx`
- Create: `app/admin/programs/page.tsx`
- Create: `components/admin/business-settings-manager.tsx`
- Create: `components/admin/program-management.tsx`
- Modify: `lib/admin/navigation.ts`
- Create: `tests/business-settings-presentation.test.ts`

- [ ] Write failing rendered-presentation tests for current/draft/scheduled values, preview, impact, history, Applications Only, and capability readiness.
- [ ] Verify RED.
- [ ] Implement accessible responsive pages using existing UI primitives.
- [ ] Verify server-side authorization remains authoritative.
- [ ] Run focused tests, full suite, build, and commit.

### Task 5: Shared onboarding and maker-profile foundation

**Files:**
- Create: `drizzle/0045_seller_participation_profiles.sql`
- Modify: `db/schema.ts`
- Modify: `lib/db/repositories/seller-applications.ts`
- Modify: `components/seller/seller-application-form.tsx`
- Create: `lib/sellers/participation.ts`
- Create: `tests/seller-participation.test.ts`
- Extend: seller/application admin pages and APIs as required by the tested interfaces

- [ ] Write failing tests for Yes/No route validation, PAN-only versus VAT evidence, Managed Maker submission without fake identifiers, shared maker profile, craft-specific experience, optional media/social fields, city-only public location, private operational addresses, and Applications Only behavior.
- [ ] Verify RED.
- [ ] Add the minimum additive schema and repository changes.
- [ ] Implement the shared UI and server validation without duplicating product-video infrastructure.
- [ ] Verify pending makers can maintain profiles and drafts but cannot publish or sell.
- [ ] Run focused tests, full suite, build, and commit.

### Task 6: Local staging package and Milestone 1 handoff

**Files:**
- Create: `scripts/staging/verify-environment.mjs`
- Create: `scripts/staging/reset-disposable-data.mjs`
- Create: `scripts/staging/seed-fictional-fixtures.mjs`
- Create: `docs/testing/milestone-1-self-test.md`
- Create: `tests/staging-reset-guard.test.ts`

- [ ] Write failing reset-guard and fictional-fixture tests.
- [ ] Verify RED.
- [ ] Implement fail-closed environment/database/media/recipient guards and mail-capture-only configuration.
- [ ] Create fictional requester/reviewer/customer/seller/maker/rider/finance fixtures without production identities.
- [ ] Document safe access, expected results, actual commands, limitations, and reset steps.
- [ ] Run focused tests, full suite, lint, typecheck/build, and Babal build compatibility checks.
- [ ] Produce the Milestone 1 verification report and commit.

