# Live Managed Maker Activation Implementation Plan

> **Planning precedence — 31 October 2026:** This document is historical design/execution context for the paused work. **Implementation remains on hold.** Do not execute its task instructions as the current full-version plan. The latest [approved/proposed decision register](2026-10-30-planning-readiness-review.md) and [all-20-workstream scope](2026-10-31-complete-version-scope.md) govern fee transitions, optional intake, Approve & publish, sole-Super-Admin finance, notifications and release preferences where they supersede older text. Preserve historical agreements/orders/evidence; reconcile the actual implemented/deployed checkpoint and write the integrated execution checklist before resuming. Staging deployment remains held; no release is authorized here.

> For the implementer: execute the tasks in order using superpowers:executing-plans and test-driven development. Keep live ordering blocked until the final readiness gates pass.

**Goal:** Enable independently reviewed identity evidence and evidence-bound live Managed Maker activation, without simulating real financial records.

**Architecture:** Add separately audited document reviews and a clearance record bound to current seller evidence and accepted terms. Implement live sale-linked order and settlement handling before enabling a transactional Super Admin activation. Continue to distinguish product publication from purchase eligibility.

**Tech stack:** Next.js, TypeScript, D1-compatible database access, MariaDB native deployment, React, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-30-live-maker-activation-design.md`.

## Global constraints

- Use the authoritative checkout and checked local launcher. Do not reset, seed, migrate, or restore its active local database.
- Preserve historical seller records, consent, financial snapshots, simulation guards and separate payout controls. Do not activate real sellers or invent clearance and consent.
- Only the existing sale-linked model is in scope for live readiness; retain the fixed supplier-price model as simulation-only.
- Build D1 and MariaDB-compatible schema changes with isolated tests and reviewed hosted rollout; do not change production data as a testing shortcut.

## Review focus

- A reviewer cannot verify their own or another seller's evidence, or an obsolete/replaced document.
- Changed agreement, beneficiary, legal clearance, restriction or product eligibility invalidates activation readiness even in concurrent requests.
- Retried requests cannot duplicate audit, orders, entitlements, refunds or payout reservations.
- Order, invoice and settlement records are correctly identified as live or simulated and preserve accepted terms.
- Existing registered sellers, browse-only makers and makers without applicable PAN keep their intended access and privacy.

## Task 1: Independent identity and PAN document review

**Files:** `app/admin/sellers/[id]/page.tsx`, `components/admin/seller-bank-review.tsx` (pattern), `lib/sellers/bank-details.ts` (pattern), `app/api/admin/seller-documents/[id]/route.ts`, new focused review component, route and repository; `tests/seller-bank-details.test.ts` and new document-review tests.

- [ ] Write failing isolated database and API tests for independent active Super Admin verification of the exact current identity or PAN document, audit reason/time/actor, and visible status.
- [ ] Add negative tests for seller ownership, wrong document kind, self-review, non-admin or revoked reviewer, rejected/obsolete evidence, concurrent replacement and repeat requests.
- [ ] Implement an atomic review transaction using the existing staff mutation guard, private document access, transaction guards and audit patterns. Add an accessible review action alongside each eligible document. Keep bank verification separate.
- [ ] Lock verified identity, PAN and bank evidence against replacement. Let the seller submit a change request with a meaningful reason; require independent Super Admin review before any replacement is applied. Preserve prior evidence and audit history, and require fresh verification of replacement evidence. Recheck downstream clearance and payout eligibility when a change is approved.
- [ ] Run focused tests and verify status after a real successful review in a disposable fixture.

## Task 2: Clearance and readiness records

**Files:** `lib/managed-commerce/activation.ts`, `lib/managed-commerce/program-management.ts`, `lib/managed-commerce/accepted-terms.ts`, `app/admin/programs/page.tsx`, `app/admin/sellers/[id]/page.tsx`, schema/migration files, and focused activation/readiness tests.

- [ ] Write failing tests for independent evidence-bound clearance: legal/accounting, supplier/tax, company/invoice identity and bank beneficiary reference, with no sensitive evidence exposed publicly.
- [ ] Add versioned clearance records and history with reviewer, scope, references and evidence/terms snapshots. Add an independent Super Admin form and checklist identifying outstanding conditions.
- [ ] Test stale, missing, replaced or revoked evidence, changed agreement/model/company identity, seller restrictions and simultaneous review. Ensure invalid clearance never authorizes activation.
- [ ] Exercise migrations on disposable SQLite and native MariaDB fixtures, without modifying the active local database.

## Task 3: Live order and financial readiness

**Files:** `lib/managed-commerce/snapshots.ts`, `lib/managed-commerce/settlement-readiness.ts`, `lib/managed-commerce/refund-readiness.ts`, `lib/managed-commerce/payout-operations.ts`, order and invoice repositories/routes, `app/api/checkout/route.ts`, `tests/managed-settlements.test.ts`, `tests/managed-documents-email.test.ts`, checkout and refund tests.

- [ ] Trace every live sale-linked order, invoice, entitlement, cancellation, refund and settlement path; document missing capabilities and required operational configuration before enabling the model.
- [ ] Write failing tests using actual accepted seller agreement snapshots: company as legal seller and invoice issuer, accepted 9%/91% only when recorded, immutable historical terms and correct live versus simulation labeling.
- [ ] Implement the missing live lifecycle, reconciliation and financial protections, including concurrent refund versus payout reservation and duplicate request handling. Keep actual transfer/paid recording separately authorized and evidence-based.
- [ ] Run isolated end-to-end and native database tests covering unpaid, undelivered, delivered/paid, refunded, disputed and concurrent transactions. Preserve existing registered-seller behavior. Leave the live model unavailable if any required live dependency is unresolved.

## Task 4: Atomic production activation and purchase eligibility

**Files:** `lib/managed-commerce/activation.ts`, `lib/configuration/capabilities.ts`, `app/api/admin/managed-makers/[id]/activate/route.ts`, seller/admin readiness components, cart and checkout eligibility code, `tests/managed-commerce-activation.test.ts`, `tests/managed-maker-public-listings.test.ts`.

- [ ] Write failing tests proving public products remain non-orderable before activation and become orderable only after every current document, clearance, agreement, program, seller and approved-product check succeeds.
- [ ] Implement a separate live activation operation with independent Super Admin authorization, transaction-time rechecks, idempotency, before/after audit and current versioned commercial settings. Keep the simulation path distinct.
- [ ] Enable the sale-linked capability only when Task 3 is demonstrated ready; confirm stale clearance, changes, restrictions and unsupported models fail closed in both cart and checkout.
- [ ] Verify product publication, customer browsing, and registered seller regression behavior.

## Task 5: Complete verification and staged release

- [ ] Run focused suites, full `npm test`, `npm run lint`, `npm run typecheck`, a release build and native schema compatibility checks. Record any failures rather than treating partial results as passing.
- [ ] Browser-test the end-to-end flow using fictional staging identities and products, including pending/verified documents, clearance, activation, checkout, refund and settlement. Check privacy and access boundaries.
- [ ] Prepare and review the exact migration, backup, restore and release artifacts. Deploy to staging, verify the live-mode workflow and rollback against disposable data, then deploy production only after checks pass and required external clearance exists.
- [ ] Report what is deployed, what remains blocked and how the Super Admin can review Thagu Kala's actual documents and activate her after the recorded checks. Do not claim an actual seller's checks or orders were verified unless independently observed.
