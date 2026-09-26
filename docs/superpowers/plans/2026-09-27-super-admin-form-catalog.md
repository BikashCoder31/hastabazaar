# Super Admin Form Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Super Admin a versioned editor for every Hastabazaar form, with protected system fields, server-enforced custom fields, and retained historical answers.

**Architecture:** A code-owned registry gives each form a stable ID and a server adapter. Published configuration resolves against that registry; a shared renderer and validator apply it to each existing form. Versioned answer sets attach to the owning record, while query forms use explicit filter adapters and do not store answers.

**Tech Stack:** React 19, Next-style Vinext routes, TypeScript 5.9, Cloudflare D1, Drizzle schema, maintained MariaDB deployment schema, node:test/tsx, local Chromium.

**Spec:** `docs/superpowers/specs/2026-09-27-super-admin-form-catalog-design.md`

## Global Constraints

- Work only in `C:\Users\abinash\.codex\worktrees\hastabazaar-v1-2-1-staging\Hatskala` on `codex/hastabazaar-v1-2-1-staging`; preserve all current unrelated and uncommitted responsive-media changes.
- No production access, deployment, configuration edit, or migration. Apply new migrations only to a verified disposable local-staging database during execution.
- Keep existing authorization, same-origin checks, rate limits, bounded request bodies, idempotency, upload validation/storage/privacy, and operational state machines.
- Credentials, OTPs, tokens, payment secrets, and anti-abuse values never enter form-answer or audit JSON.
- Archived fields remain readable on historical records subject to authorized privacy deletion and legal retention.
- Every current form and future form must be registered; no new custom query criterion may publish without a real query adapter.
- Node >=22.13.0; use existing dependencies. Use TDD and make only task-specific commits after each green review. Do not use `git add .` in this dirty worktree.

## Review Focus

These likely failures are assigned concrete tests below:

1. **Old tab after publication:** Task 3 rejects an obsolete version with a field-specific refresh response; Task 6 preserves entered text when practical.
2. **Retry of a successful action:** Task 4 and each integration family verify that `(form_id, request_id)` yields one answer set and one domain action.
3. **Cross-role or cross-record read:** Task 9 tests denied access to another customer/seller/rider's answers and unauthorized staff answers.
4. **Configuration read failure:** Task 3 fails closed with a retryable response, without falling back to unconfigured validation.
5. **Archived/changed choice label:** Task 4 and Task 9 read the original field/value snapshot from an old submission after a later edit.

---

## File map and execution order

Tasks 1–7 build the shared registry, storage, API, editor, and renderer. Task 8 proves one complete account flow. Task 9 adds answer visibility/privacy. Tasks 10–21 integrate the remaining form families. Task 22 closes the inventory and browser matrix. One plan is appropriate because every family consumes the same version and answer interfaces; each family task is independently testable and reviewable after the foundation.

Shared files have one responsibility each: `lib/forms/registry.ts` owns IDs/capabilities; `lib/forms/validation.ts` owns definition and answer validation; `lib/forms/runtime.ts` resolves the current version; `lib/db/repositories/form-catalog.ts` owns versions/audit; `lib/db/repositories/form-answers.ts` owns snapshots/lookup; `components/forms/configured-fields.tsx` renders custom fields; `components/forms/form-config-client.tsx` loads config for client forms. Route adapters remain beside their existing APIs. `tests/helpers/form-policy.ts` scans TSX source; its frozen pre-existing-form ledger shrinks as tasks integrate and must be empty in Task 22.

The integration ledger below counts **69 `<form>` source elements in 51 files**, not DOM instances. Some components render multiple forms or repeat one form for records. Every listed render site gets a stable `data-form-id`; the registry maps each ID to its receiving route/action and capability reason. Task 1 also audits form-like controls without `<form>` and adds any true data-entry surfaces to this ledger before Task 22 closes it.

## Tasks

### Task 1: Stable inventory and future-form policy

**Files:** Create `lib/forms/types.ts`, `lib/forms/registry.ts`, `tests/helpers/form-policy.ts`, `tests/form-catalog-policy.test.ts`; use the 51-file coverage ledger in Tasks 8–21.

**Interfaces:** Produce `FORM_REGISTRY: Readonly<Record<FormId, FormDefinition>>`, `FormId`, `FormConfigDraft`, `PublishedFormConfig`, `FormAnswerSnapshot`, and `scanFormSites(root): Promise<FormPolicyViolation[]>`. Each definition contains `id`, `audience`, `mode: 'collection'|'transaction'|'identity'|'operation'|'query'|'system'`, `route`, `baseFields`, `capabilities`, and `adapterId`. Preserve an exact, frozen baseline of current unintegrated source sites; a newly added site cannot use that baseline.

- [ ] Add a test that counts the current 69 sites, fails on an unregistered new `<form>`, and rejects a registry entry without an adapter/capability explanation.
- [ ] Run `npx tsx --test tests/form-catalog-policy.test.ts`; observe RED on the unregistered fixture/current sites.
- [ ] Implement the registry, AST scanner, and frozen baseline; inventory programmatic form-like surfaces separately, including `components/seller/case-response-form.tsx`.
- [ ] Rerun the focused test to GREEN; confirm adding a synthetic future form fails it.
- [ ] Commit only these four files (`feat: register form surfaces and enforce policy`).

### Task 2: Append-only D1 and MariaDB schema

**Files:** Modify `db/schema.ts`, `scripts/generate-mariadb-schema.mjs`; create `drizzle/0056_form_catalog.sql`, `deployment/babal/mariadb-form-catalog.sql`, `tests/form-catalog-schema.test.ts`.

**Interfaces:** Produce `form_config_versions` (form/version/revision/status/config JSON/actor/reason/timestamps, unique form+version) and `form_answer_sets` (unique form+request, version FK, subject type/ID, actor, bounded answer snapshot JSON, timestamp, owner lookup index). Highest published version is current; published configs are immutable. Follow the repository's later hand-maintained migration pattern rather than assuming the older Drizzle journal includes `0055`.

- [ ] Add an in-memory SQLite migration test for constraints, indexes, answer uniqueness, and old-answer retention.
- [ ] Run `npx tsx --test tests/form-catalog-schema.test.ts`; observe RED before the new schema exists.
- [ ] Add both schema variants and the MariaDB generator inclusion without editing prior migrations.
- [ ] Rerun the focused test and `npm run schema:babal` in a disposable review copy or verify generated diff before keeping generated output; confirm GREEN and no unrelated schema rewrite.
- [ ] Commit only schema, migration, generator, and test files (`feat: persist versioned form configs and answers`).

### Task 3: Definition and answer validation

**Files:** Create `lib/forms/validation.ts`, `lib/forms/runtime.ts`, `tests/form-catalog-validation.test.ts`.

**Interfaces:** Produce `validateFormDraft(formId: FormId, candidate: unknown): FormConfigDraft`, `resolvePublishedForm(db: D1Database, formId: FormId): Promise<PublishedFormConfig>`, and `validateSubmittedForm(db, formId, version, raw): Promise<FormAnswerSnapshot>`. Validate immutable custom keys, known field types, choices, length/quantity limits, collision with protected names, and adapter-granted built-in edits. Missing store/read failure is retryable and fails closed; stale version is a typed conflict.

- [ ] Add table-driven tests for all safe field types, missing required answers, optional empty answers, duplicate/unknown fields, protected-field edits, stale version, malformed draft, and config read failure.
- [ ] Run `npx tsx --test tests/form-catalog-validation.test.ts`; observe RED.
- [ ] Implement the three interfaces using the registry and schema from Tasks 1–2.
- [ ] Rerun the focused test to GREEN; run `npx tsc --noEmit --incremental false`.
- [ ] Commit only validator/runtime/test files (`feat: validate published form fields server side`).

### Task 4: Version publisher, audit, and answer repository

**Files:** Create `lib/db/repositories/form-catalog.ts`, `lib/db/repositories/form-answers.ts`, `tests/form-catalog-repository.test.ts`.

**Interfaces:** Produce `saveFormDraft(db: D1Database, input: {formId:FormId; draftId?:string; actorId:string; actorRole:'super_admin'; expectedDraftRevision?:number; expectedPublishedVersion:number; config:FormConfigDraft; reason:string; requestId:string; now:number}): Promise<FormConfigVersion>`, `publishFormDraft(db, input: {formId:FormId; draftId:string; actorId:string; actorRole:'super_admin'; expectedDraftRevision:number; expectedPublishedVersion:number; reason:string; requestId:string; now:number}): Promise<FormConfigVersion>`, `restoreFormVersion(db, input: {formId:FormId; sourceVersion:number; actorId:string; actorRole:'super_admin'; expectedPublishedVersion:number; reason:string; requestId:string; now:number}): Promise<FormConfigVersion>`, `buildFormAnswerInsert(db, {formId, requestId, versionId, subjectType, subjectId, actorId, answers, now}): D1PreparedStatement`, and `listFormAnswersForSubject(db, subjectType, subjectId)`. `FormConfigVersion` is defined here; publisher operations recheck an active Super Admin in the database. Existing domain repositories may batch the prepared insert with the parent action, or use an idempotent post-success link.

- [ ] Test two competing draft edits/revisions and publishers, unauthorized actor at repository boundary, audit actor/reason, rollback as a new version, duplicate request IDs, and old choice labels after archival.
- [ ] Run `npx tsx --test tests/form-catalog-repository.test.ts`; observe RED.
- [ ] Implement version and answer repositories, with parameterized SQL and immutable published rows.
- [ ] Rerun focused test to GREEN and inspect D1 batch behavior for atomic parent/answer writes.
- [ ] Commit only repository/test files (`feat: publish audited form versions and snapshots`).

### Task 5: Super Admin routes and read boundaries

**Files:** Create `app/api/forms/[formId]/route.ts`, `app/api/admin/forms/route.ts`, `app/api/admin/forms/[formId]/route.ts`, `app/api/admin/forms/[formId]/draft/route.ts`, `app/api/admin/forms/[formId]/publish/route.ts`, `app/api/admin/forms/[formId]/restore/route.ts`, `tests/form-catalog-routes.test.ts`.

**Interfaces:** `GET /api/forms/:id` returns only an audience-authorized published config with `Cache-Control: no-store`; Super Admin routes list/read/create draft/publish/restore. Every mutation checks origin, active Super Admin role on the server, bounded JSON, request ID, expected version, and reason. Protected form IDs do not leak through public GET.

- [ ] Add route tests for guest/Customer/Admin denial, active Super Admin success, stale 409, malformed 400/oversize 413, private config read denial, and audit preservation.
- [ ] Run `npx tsx --test tests/form-catalog-routes.test.ts`; observe RED.
- [ ] Implement the routes using Tasks 3–4 without weakening existing staff authorization.
- [ ] Rerun focused test to GREEN and `npx tsc --noEmit --incremental false`.
- [ ] Commit only route/test files (`feat: expose guarded form catalog routes`).

### Task 6: Shared rendering and submission helpers

**Files:** Create `components/forms/configured-fields.tsx`, `components/forms/form-config-client.tsx`, `lib/forms/submission.ts`, `tests/form-catalog-renderer.test.ts`.

**Interfaces:** Produce `<ConfiguredFields config={config} />`, `usePublishedFormConfig(formId)` for client forms, `readConfiguredSubmission(form: HTMLFormElement, config): {version:number; answers:Record<string,unknown>}`, and `fieldDisplay(config, baseKey)` for built-ins. Native POSTs send `formVersion` plus namespaced `custom.*` fields. JSON forms send `{formVersion, customAnswers}`. A form cannot submit while its config is unavailable; on 409 it retains entered text where practical.

- [ ] Test labels, required cues, choice changes, archived fields absent, long-label layout, missing-config disabled submit, and obsolete version feedback.
- [ ] Run `npx tsx --test tests/form-catalog-renderer.test.ts`; observe RED.
- [ ] Implement renderer/helpers using Task 3 validation types.
- [ ] Rerun focused test to GREEN and inspect a small/large rendered fixture.
- [ ] Commit only renderer/helper/test files (`feat: render configured fields consistently`).

### Task 7: Super Admin catalog and editor

**Files:** Create `app/admin/forms/page.tsx`, `app/admin/forms/[formId]/page.tsx`, `components/admin/form-catalog-editor.tsx`, `components/admin/form-catalog-preview.tsx`, `tests/form-catalog-admin-ui.test.ts`; modify `lib/admin/navigation.ts`, `components/admin/admin-navigation.tsx`.

**Interfaces:** Pages require `staff.role === 'super_admin'`; editor consumes Task 5 routes and Task 6 renderer. Controls expose field lock reason, add/edit/order/archive, required toggle where allowed, draft/version history, preview at phone/desktop, publish reason, conflict reload, and restore.

- [ ] Add UI/route-boundary tests for Super Admin navigation, ordinary Admin absence/direct denial, protected toggle disabled with explanation, draft conflict, and publish confirmation.
- [ ] Run `npx tsx --test tests/form-catalog-admin-ui.test.ts`; observe RED.
- [ ] Build pages/editor with existing accessible UI components and guarded APIs.
- [ ] Rerun focused test to GREEN; verify keyboard focus and errors in local browser at 390px and 1440px.
- [ ] Commit only listed UI/navigation/test files (`feat: add Super Admin form editor`).

### Task 8: First end-to-end account profile form

**Files:** Modify `components/account/profile-form.tsx`, `app/account/profile/page.tsx`, `app/api/account/profile/route.ts`, `lib/db/repositories/customers.ts`, `lib/forms/registry.ts`; create `tests/form-catalog-profile.test.ts`.

**Interfaces:** Register `account.profile`; render Task 6 fields; validate current config in the PATCH route; batch its answer insert with the profile update and existing audit event. Remove this site from Task 1's frozen baseline.

- [ ] Test add-required-submit-read-archive-read-old-answer; test missing required, stale version, failed write, and duplicate request ID.
- [ ] Run `npx tsx --test tests/form-catalog-profile.test.ts`; observe RED.
- [ ] Wire profile form, route, repository, and registry to Tasks 3–6 without weakening current name/phone validation.
- [ ] Rerun focused test to GREEN and edit a fictional local-staging account profile in the browser.
- [ ] Commit only profile form/page/route/repository, registry, ledger, and test (`feat: configure account profile end to end`).

### Task 9: Answer visibility and privacy boundary

**Files:** Create `lib/forms/access.ts`, `lib/forms/privacy.ts`, `components/forms/answer-details.tsx`, `app/api/forms/answers/[id]/route.ts`, `tests/form-catalog-access.test.ts`; modify `lib/db/repositories/form-answers.ts`, `app/account/profile/page.tsx`, `lib/db/repositories/operations.ts` where data-rights requests are handled.

**Interfaces:** Produce `authorizeFormAnswerRead(db, viewer, answerSet): Promise<boolean>`, `collectFormAnswersForPrivacy(db, userId)`, and `eraseFormAnswersForPrivacy(db, {userId, requestId, actorId})`; the erasure helper checks the legal hold in stored state rather than trusting caller input. Render snapshot labels/values and historical markers. Customer sees own profile answers; staff reads only subjects within existing permission/ownership rules. Privacy access/deletion workflows include these answers, but changing a request status alone never asserts that an export or deletion occurred.

- [ ] Test same-owner read, other-owner denial, seller/rider/staff boundary denial, archived historical labels, access export inclusion, and deletion blocked by legal hold.
- [ ] Run `npx tsx --test tests/form-catalog-access.test.ts`; observe RED.
- [ ] Implement guarded lookup, display, and privacy helpers using Task 4 snapshots.
- [ ] Rerun focused test to GREEN and confirm response bodies exclude credentials/tokens.
- [ ] Commit only access/privacy/view/test files (`feat: show and govern historical form answers`).

### Task 10: Remaining account forms

**Files:** Modify `components/account/address-manager.tsx`, `components/account/privacy-request-form.tsx`, `components/account/review-form.tsx`, `app/api/account/addresses/route.ts`, `app/api/account/addresses/[id]/route.ts`, `app/api/account/privacy/route.ts`, `app/api/products/[id]/reviews/route.ts`, `lib/db/repositories/customers.ts`, `lib/db/repositories/operations.ts`, `lib/forms/registry.ts`; create `tests/form-catalog-account.test.ts`.

**Interfaces:** Register account address, privacy request, and product review IDs; preserve address ownership, privacy request type, review purchase eligibility, and photo validation. Link answers to the address/request/review. Reuse Task 9 viewer in account and authorized staff detail screens.

- [ ] Test making optional address landmark required then optional again, archived fields, review upload protection, cross-customer denial, duplicate requests, and server validation for all three forms.
- [ ] Run `npx tsx --test tests/form-catalog-account.test.ts`; observe RED.
- [ ] Wire the three render sites and their route/repository paths; remove three frozen-ledger sites.
- [ ] Rerun focused tests and existing `tests/review-uploads.test.ts`/customer tests to GREEN.
- [ ] Commit only listed account files, registry/ledger, and tests (`feat: configure account collection forms`).

### Task 11: Public contact and feedback submissions

**Files:** Modify `components/layout/customer-contact-form.tsx`, `components/layout/footer-feedback-form.tsx`, `app/api/feedback/route.ts`, `lib/email/customer-feedback.ts`, `lib/forms/registry.ts`, `db/schema.ts`, `scripts/generate-mariadb-schema.mjs`; create `lib/db/repositories/feedback-submissions.ts`, `drizzle/0057_feedback_delivery_jobs.sql`, `deployment/babal/mariadb-feedback-delivery-jobs.sql`, `tests/form-catalog-feedback.test.ts`.

**Interfaces:** Register both source sites (two IDs if their contracts differ). The current endpoint sends email and has no saved feedback record. Add a dedicated feedback delivery job keyed by request ID; create it atomically with the validated answer set, then deliver/capture mail with lease/retry semantics and no duplicate success response. Honeypot submissions keep their neutral response but store no answer set or mail. The restricted viewer from Task 9 reads successful submissions.

- [ ] Test successful send once, retry once, email failure without false success, honeypot non-storage, rate-limit retention, required custom answer, and archived historical answer.
- [ ] Run `npx tsx --test tests/form-catalog-feedback.test.ts`; observe RED.
- [ ] Add the submission/idempotency adapter and wire both forms without changing current same-origin/body/rate-limit checks.
- [ ] Rerun focused test to GREEN; exercise fictional feedback locally with capture-only mail.
- [ ] Commit only feedback files/migration, registry/ledger, and test (`feat: configure public feedback forms`).

### Task 12: Seller onboarding and product data

**Files:** Modify `components/seller/seller-application-form.tsx`, `components/seller/maker-application-profile-form.tsx`, `components/seller/seller-profile-form.tsx`, `components/seller/product-submission-form.tsx`, `components/seller/inventory-editor.tsx`; corresponding routes `app/api/seller-applications/route.ts`, `app/api/seller-applications/profile/route.ts`, `app/api/seller/profile/route.ts`, `app/api/seller/products/route.ts`, `app/api/seller/products/[id]/route.ts`, `app/api/seller/products/[id]/inventory/route.ts`; modify `lib/forms/registry.ts`; create `tests/form-catalog-seller-data.test.ts`.

**Interfaces:** Five form sites get stable IDs. Existing required legal/seller identity, SKU/price/inventory constraints, upload validation, draft/publish workflow, and private media rules remain protected. Successful answers link to seller application, seller profile, or product version, never to a different seller.

- [ ] Test each ID's required field and record link; test foreign seller denial, malicious custom upload/unknown field, draft versus publish, and idempotent retry.
- [ ] Run `npx tsx --test tests/form-catalog-seller-data.test.ts`; observe RED.
- [ ] Wire renderers/routes and batch answer insert at the domain write boundary; remove five frozen-ledger sites.
- [ ] Rerun focused seller tests plus product/media security tests to GREEN.
- [ ] Commit only listed seller files, registry/ledger, and tests (`feat: configure seller data forms`).

### Task 13: Seller operations

**Files:** Modify `components/seller/shipping-workspace.tsx`, `components/seller/managed-program-workspace.tsx`, `components/seller/payout-request-form.tsx`, `components/seller/review-reply-form.tsx`; routes `app/api/seller/shipping/route.ts`, `app/api/seller/shipping/[id]/route.ts`, `app/api/seller/managed-program/route.ts`, `app/api/seller/payout-requests/route.ts`, `app/api/seller/reviews/[id]/reply/route.ts`; modify `lib/forms/registry.ts`; create `tests/form-catalog-seller-operations.test.ts`.

**Interfaces:** Six form sites cover two shipping actions, two managed-program actions, payout request, and review reply. Decision/action names, financial amounts, evidence, seller ownership, and state transitions remain protected; custom context answers link to the exact resulting action.

- [ ] Test every site ID, record link, seller isolation, state/amount protection, duplicate action ID, and archived-answer visibility.
- [ ] Run `npx tsx --test tests/form-catalog-seller-operations.test.ts`; observe RED.
- [ ] Wire action adapters and remove six frozen-ledger sites.
- [ ] Rerun focused test and existing seller/governance/settlement tests to GREEN.
- [ ] Commit only seller-operation files, registry/ledger, and tests (`feat: configure seller operation forms`).

### Task 14: Rider, delivery, and shipping console forms

**Files:** Modify `components/rider/rider-forms.tsx`, `components/rider/rider-code.tsx`, `components/delivery/delivery-assignment.tsx`, `components/shipping-console.tsx`; routes `app/api/rider/application/route.ts`, `app/api/rider/reports/route.ts`, `app/api/rider/remittances/route.ts`, `app/api/rider/verify-code/route.ts`, `app/api/admin/orders/[id]/delivery/route.ts`, `app/api/seller/shipping/route.ts`, `app/api/seller/shipping/[id]/route.ts`, `app/api/admin/shipping/[id]/route.ts`; modify `lib/forms/registry.ts`; create `tests/form-catalog-rider-shipping.test.ts`.

**Interfaces:** Seven source sites cover three rider forms, verification code, delivery assignment, and two shipping-console actions. Identity evidence, delivery ownership, verification code, remittance amount, and private-media access remain protected. `ShippingConsole` chooses distinct IDs for seller and staff action modes where permissions/semantics differ.

- [ ] Test all seven render sites and distinct staff/seller modes, protected code/evidence, actor isolation, and one answer per successful action.
- [ ] Run `npx tsx --test tests/form-catalog-rider-shipping.test.ts`; observe RED.
- [ ] Wire adapters without changing rider evidence validation or parcel state transitions; remove seven frozen-ledger sites.
- [ ] Rerun focused test and existing rider-media/rider-code/shipping tests to GREEN.
- [ ] Commit only rider/delivery/shipping files, registry/ledger, and tests (`feat: configure rider and shipping forms`).

### Task 15: Commerce and aftercare forms

**Files:** Modify `components/commerce/checkout-form.tsx`, `components/commerce/customer-aftercare.tsx`, `components/commerce/gift-card-form.tsx`; routes `app/api/checkout/route.ts`, `app/orders/[orderNumber]/returns/route.ts`, `app/orders/[orderNumber]/complaints/route.ts`, `app/api/account/gift-cards/route.ts`, `app/api/admin/gift-cards/route.ts`; modify `lib/checkout/validation.ts`, `lib/db/repositories/orders.ts`, `lib/forms/registry.ts`; create `tests/form-catalog-commerce.test.ts`.

**Interfaces:** Four source sites cover checkout, return, complaint, and gift card (customer/admin modes get distinct IDs). Orders and case records capture answer snapshots with their idempotent domain writes. Contact/address, prices, discounts, consent, return windows, evidence validation, and payment simulation remain protected.

- [ ] Test both gift-card modes, checkout/return/complaint required fields, empty cart, expired window, duplicate checkout, stale form, and no answer on failed transaction.
- [ ] Run `npx tsx --test tests/form-catalog-commerce.test.ts`; observe RED.
- [ ] Wire four render sites and five routes, preserving existing validation and batch/idempotency boundaries; remove four frozen-ledger sites.
- [ ] Rerun focused test and `tests/checkout-recipient.test.ts`/`tests/returns-complaints.test.ts` to GREEN.
- [ ] Commit only commerce files, registry/ledger, and tests (`feat: configure commerce forms`).

### Task 16: Authentication and recovery forms

**Files:** Modify `app/login/page.tsx`, `app/login/code/page.tsx`, `app/register/page.tsx`, `app/forgot-password/page.tsx`, `app/forgot-password/reset/page.tsx`; routes `app/api/auth/login/route.ts`, `app/api/auth/email-code/request/route.ts`, `app/api/auth/email-code/verify/route.ts`, `app/api/auth/register/route.ts`, `app/api/auth/password-reset/request/route.ts`, `app/api/auth/password-reset/complete/route.ts`; modify `lib/forms/registry.ts`; create `tests/form-catalog-identity.test.ts`.

**Interfaces:** Six source sites: login password and email-code request, code verify, registration, reset request, reset completion. Password/code/token/rate-limit fields are locked. An answer set is created only after a successful identity operation and contains no credential material. Anonymous flows use a restricted submission subject and existing request ID/rate-limit protections.

- [ ] Test all six IDs, failed-login non-storage, protected credential fields, successful registration linkage, rate limits, password reset secrecy, and duplicate request IDs.
- [ ] Run `npx tsx --test tests/form-catalog-identity.test.ts`; observe RED.
- [ ] Wire server-rendered form config and POST adapters; remove six frozen-ledger sites.
- [ ] Rerun focused test plus auth/security tests to GREEN and inspect response headers for secret leakage.
- [ ] Commit only identity files, registry/ledger, and tests (`feat: configure identity forms safely`).

### Task 17: Staff marketplace and operations forms

**Files:** Modify `components/admin/catalog-manager.tsx`, `components/admin/exception-work-form.tsx`, `components/admin/invoice-adjustment-form.tsx`, `components/admin/managed-maker-activation-form.tsx`, `components/admin/parcel-controls.tsx`, `components/admin/payout-request-actions.tsx`, `components/admin/privacy-actions.tsx`, `components/admin/product-classification-form.tsx`, `components/admin/rider-controls.tsx`; matching routes `app/api/admin/catalog/route.ts`, `app/api/admin/exception-work/route.ts`, `app/api/admin/invoices/[id]/adjustments/route.ts`, `app/api/admin/managed-makers/[id]/activate/route.ts`, `app/api/admin/orders/[id]/parcels/route.ts`, `app/api/admin/payout-requests/[id]/route.ts`, `app/api/admin/privacy/[id]/route.ts`, `app/api/admin/products/[id]/classification/route.ts`, `app/api/admin/riders/route.ts`; modify `lib/forms/registry.ts`; create `tests/form-catalog-staff-operations.test.ts`.

**Interfaces:** Ten source sites (two rider-control forms) get explicit IDs and contextual answers linked to their existing audit/domain subjects. Admin/Super Admin permissions, seller/rider ownership, money, evidence, and final decision rules stay in current server guards.

- [ ] Test each source site's ID and published field, unauthorized staff denial, protected amount/decision fields, failed action non-storage, and one answer per idempotent successful action.
- [ ] Run `npx tsx --test tests/form-catalog-staff-operations.test.ts`; observe RED.
- [ ] Wire the nine components, matching routes, answer links, and registry; remove ten frozen-ledger sites.
- [ ] Rerun focused test and existing staff/finance/rider operation tests to GREEN.
- [ ] Commit only listed staff-operation files, registry/ledger, and tests (`feat: configure staff operation forms`).

### Task 18: Governance console forms

**Files:** Modify `components/admin/governance-console.tsx`, `app/api/admin/governance/route.ts`, `lib/forms/registry.ts`; create `tests/form-catalog-governance.test.ts`.

**Interfaces:** Five source forms cover distinct governance actions. Their custom answers attach to the resulting audit/domain subject; action codes, required reasons, permissions, and immutable audit fields are protected.

- [ ] Test all five IDs and conditional branches, ordinary Admin versus Super Admin authority, protected action fields, failed decision non-storage, and duplicate request ID.
- [ ] Run `npx tsx --test tests/form-catalog-governance.test.ts`; observe RED.
- [ ] Wire console and route; remove five frozen-ledger sites.
- [ ] Rerun focused test and existing governance tests to GREEN.
- [ ] Commit only console/route, registry/ledger, and tests (`feat: configure governance forms`).

### Task 19: Managed-program decision forms

**Files:** Modify `components/admin/managed-program-review.tsx`, `app/api/admin/managed-program/[id]/route.ts`, `lib/forms/registry.ts`; create `tests/form-catalog-managed-program.test.ts`.

**Interfaces:** Five conditional form sites correspond to supply decision, adjustment, payment preparation, payment approval/marking, and transition decision. Existing state, quantity, money, possession/evidence, and Super Admin approval rules remain protected.

- [ ] Test each branch's ID and answer subject, unsupported state denial, required evidence, actor authorization, amount protection, and duplicate request.
- [ ] Run `npx tsx --test tests/form-catalog-managed-program.test.ts`; observe RED.
- [ ] Wire review UI and route; remove five frozen-ledger sites.
- [ ] Rerun focused test and existing managed-program/settlement tests to GREEN.
- [ ] Commit only managed-program files, registry/ledger, and tests (`feat: configure managed-program forms`).

### Task 20: Finance and staff access forms

**Files:** Modify `components/admin/payout-actions.tsx`, `components/admin/delivery-rate-settings.tsx`, `components/admin/referral-settings.tsx`, `components/admin/staff-invitation-manager.tsx`, `components/admin/staff-permission-manager.tsx`; routes `app/api/admin/payouts/route.ts`, `app/api/admin/payouts/[id]/route.ts`, `app/api/admin/delivery-rates/route.ts`, `app/api/admin/referrals/route.ts`, `app/api/admin/staff-invitations/route.ts`, `app/api/admin/staff-permissions/route.ts`; modify `lib/forms/registry.ts`; create `tests/form-catalog-finance-access.test.ts`.

**Interfaces:** Seven source forms include two payout and two staff-permission forms. Custom answers add context only; amount calculations, permission grants, version checks, payout state transitions, and existing audit remain protected.

- [ ] Test seven IDs, Admin/Super Admin boundaries, protected money and permission fields, same-actor rules already approved elsewhere, duplicate request, and old-answer snapshot.
- [ ] Run `npx tsx --test tests/form-catalog-finance-access.test.ts`; observe RED.
- [ ] Wire five components and six routes; remove seven frozen-ledger sites.
- [ ] Rerun focused test and existing business-settings/payout/staff-permissions tests to GREEN.
- [ ] Commit only listed finance/access files, registry/ledger, and tests (`feat: configure finance and staff forms`).

### Task 21: Search, filter, tracking, and staging-only controls

**Files:** Modify `components/layout/site-header.tsx`, `components/catalog/catalog-filters.tsx`, `components/commerce/order-tracker.tsx`, `app/shop/page.tsx`, `app/seller/products/page.tsx`, `app/admin/homepage/page.tsx`, `app/admin/activity/page.tsx`, `components/admin/recorded-progress.tsx`, `app/local-testing/page.tsx`, `lib/db/repositories/products.ts`; receiving handlers `app/api/orders/track/route.ts`, `app/api/local-testing/session/route.ts`, and the server page query parsers used by the GET forms; modify `lib/forms/registry.ts`; create `tests/form-catalog-query.test.ts`.

**Interfaces:** Eight source sites receive stable IDs. Search and filter forms expose safe built-in presentation settings; a custom criterion is publishable only with a named query adapter that changes results. The first supported criterion is `minimum_price_npr` on `/shop`, converted to integer paisa and applied consistently to count and list SQL. Tracking lookup remains protected against unauthorized order disclosure. `/local-testing` is marked staging-only system control; its role switch fields cannot be published as editable production fields. Query submissions do not create answer sets.

- [ ] Test all eight IDs, the `/shop` minimum-price result/count change and invalid numeric bounds, rejected unsupported criterion, private tracking denial, and local-testing production disablement.
- [ ] Run `npx tsx --test tests/form-catalog-query.test.ts`; observe RED.
- [ ] Wire the eight render sites/query adapters and remove the final eight frozen-ledger sites.
- [ ] Rerun focused test; assert `tests/form-catalog-policy.test.ts` passes with an empty exception baseline and still rejects a synthetic future unregistered form.
- [ ] Commit only query/system files, registry/ledger, and tests (`feat: register and configure query forms`).

### Task 22: Complete integration and browser QA

**Files:** Modify `docs/testing/site-wide-responsive-media-self-test.md` only if shared-layout regressions require a correction; create `docs/testing/super-admin-form-catalog-self-test.md`, `scripts/form-catalog-browser-check.mjs`, `tests/form-catalog-coverage.test.ts`.

**Interfaces:** Coverage test enumerates every current `<form>` source site and any audited form-like controls, asserts stable IDs and server adapters, and compares against the Task 1 frozen baseline, which must be empty. Browser script targets loopback only and uses fictional local-staging records.

- [ ] Add a failing coverage test for any remaining pending site or missing answer/query behavior; include privacy, protected upload, and local-only guards.
- [ ] Run `npx tsx --test tests/form-catalog-coverage.test.ts`; observe RED until all 69 source sites and discovered form-like controls are accounted for.
- [ ] Finish remaining adapter/answer-view links, remove all pending exceptions, and document exact coverage and limitations.
- [ ] Run `npx tsx --test tests/form-catalog-coverage.test.ts`, `npm test`, `npx tsc --noEmit --incremental false`, `npm run lint`, `npm run build`, `npx tsx --test tests/form-catalog-schema.test.ts tests/form-catalog-feedback.test.ts`, and `git diff --check`; verify all outputs before claiming completion.
- [ ] Run browser QA at 232/390/722/1024/1440/1920px for customer/account/seller/rider/staff/Super Admin/auth/checkout forms, including add→require→submit→archive→historical read, keyboard/error behavior, and no page-level overflow; commit only QA/coverage fixes and evidence (`test: verify complete form catalog rollout`).

## Execution boundary

Do not run production migrations or deploy. At each task, inspect the current dirty worktree and stage only that task's files. A complete result means the Task 22 inventory is closed and every form family has server-side behavior, history, and access checks; a visible field alone is not completion. Stop at the plan-review gate before writing implementation code.
