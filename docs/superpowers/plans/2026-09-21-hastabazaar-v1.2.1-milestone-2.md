# Hastabazaar v1.2.1 Milestone 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one disposable local-staging journey from Managed Maker application through reviewed product, customer order, rider handover, cash reconciliation, immutable maker entitlement, simulated payout, captured email, and issuer-grouped sample invoice records.

**Architecture:** Reuse the existing seller/product, checkout, parcel, rider proof, cash-remittance, document, and outbox paths. Add a Managed Maker commercial snapshot at order-item formation and an append-only Managed Maker settlement ledger. Customer payment, rider-held cash, company remittance, maker earning, eligibility, and payout remain distinct states. Simulation activation is fail-closed to the disposable local-staging environment and cannot weaken production readiness.

**Tech Stack:** TypeScript 5.9, React 19, Vinext, Drizzle, D1-compatible SQL, MariaDB adapter, Node test runner, existing shadcn/Base UI components.

**Spec:** `docs/superpowers/specs/2026-09-21-hastabazaar-v1.2.1-staging-design.md`

## Global constraints

- Staging only; use fictional issuer/agreement/account references, captured mail, and simulated payments.
- Managed sale-linked demonstration means 9% platform retention and the exact reconciled 91% maker entitlement.
- Independent-seller commission and Managed Maker settlement remain separate code, settings, snapshots, and ledgers.
- Fixed supplier-price purchasing never receives an automatic percentage deduction.
- Expected entitlement may be calculated at order formation; it becomes earned only on approved delivered-and-paid conditions.
- Rider remittance remains independently reconciled and cannot indefinitely prevent maker entitlement.
- Existing orders, invoices, agreements, cash records, balances, and commercial terms are never rewritten by later configuration changes.
- All database changes are additive and D1/MariaDB compatible; all product code follows RED→GREEN development.

## Review focus

- Exact paisa reconciliation and half-up rounding, including refund reversals without accumulated rounding drift.
- Idempotency for delivery, refund, remittance, reconciliation, entitlement, and payout requests.
- Maker-checker separation for cash approval and payout approval.
- No production resource can be reached by local fixtures, mail capture, simulated issuer data, or reset tooling.
- Whole-parcel inspection and handover are recorded separately from customer payment and later complaint rights.

### Task 1: Managed commercial snapshots and monetary rules

**Files:**
- Create: `drizzle/0046_managed_commerce.sql`
- Modify: `db/schema.ts`
- Create: `lib/managed-commerce/calculation.ts`
- Create: `lib/managed-commerce/types.ts`
- Create: `tests/managed-commerce-calculation.test.ts`
- Modify: `scripts/generate-mariadb-schema.mjs`

- [ ] Write failing tests for NPR 1,000 → NPR 90 retained → NPR 910 entitlement, half-up allocation, seller/maker-funded versus platform-funded discounts, and fixed-price no-deduction behavior.
- [ ] Verify RED.
- [ ] Add additive immutable snapshot, entitlement, adjustment, payout, and invoice-group tables.
- [ ] Implement exact integer monetary calculations and invariants.
- [ ] Verify D1 tests, generated MariaDB schema, full suite, and commit.

### Task 2: Simulation-only activation, product approval, and checkout snapshotting

**Files:**
- Modify: `lib/configuration/capabilities.ts`
- Extend: seller/application/product admin APIs and repositories
- Extend: checkout order-creation repository
- Create: `lib/managed-commerce/activation.ts`
- Create: `lib/managed-commerce/snapshots.ts`
- Create: `tests/managed-commerce-activation.test.ts`
- Create: `tests/managed-commerce-checkout.test.ts`

- [ ] Write failing tests for program, maker, and product readiness; unauthorized/self activation; local-staging simulation gates; and immutable checkout snapshots.
- [ ] Verify RED.
- [ ] Implement a clearly simulated activation path that cannot be selected for production.
- [ ] Allow reviewed Managed Maker products to publish only after all three readiness layers pass.
- [ ] Snapshot route, model, issuer, legal seller, beneficiary, agreement, prices, discounts, retention, entitlement, and setting-version references when the order is formed.
- [ ] Verify old open orders remain unchanged when configuration changes and commit.

### Task 3: Parcel inspection, recipient authorization, customer payment, and cash lifecycle

**Files:**
- Extend: `lib/riders/repository.ts`
- Extend: `lib/operations/parcels.ts`
- Extend: rider/customer/admin APIs and components
- Extend: configuration definitions for implemented delivery controls where required
- Create: `tests/managed-delivery-journey.test.ts`

- [ ] Write failing tests for clay open-box eligibility, whole-parcel outcomes, purchaser/recipient email authorization, expired/reused/limited OTPs, COD payment prerequisite, duplicate delivery, partial remittance, and separate finance approval.
- [ ] Verify RED.
- [ ] Implement parcel-specific single-use email authorization without granting recipient account or invoice access.
- [ ] Keep inspection, payment, handover, rider-held cash, remittance, and reconciliation as separate facts.
- [ ] Preserve later defect/wrong-item review despite accepted inspection.
- [ ] Verify failure cases and commit.

### Task 4: Managed entitlement, adjustments, and simulated payouts

**Files:**
- Create: `lib/db/repositories/managed-settlements.ts`
- Extend: refund/dispute integration points
- Create/extend: maker finance and admin settlement pages/APIs
- Create: `tests/managed-settlements.test.ts`

- [ ] Write failing tests for calculated/earned/held/eligible/paid states, delivery hold and weekly schedule, remittance independence, partial/full refunds, post-payout disputes/refunds, duplicate requests, and maker-checker approval.
- [ ] Verify RED.
- [ ] Implement append-only linked adjustments and compensating balances; never overwrite original entries or deduct twice.
- [ ] Show the actual expected payout date in Asia/Kathmandu with Wednesday processing and Tuesday 17:00 cutoff defaults.
- [ ] Implement simulated payout preparation/approval/completion using fictional destinations only.
- [ ] Verify tests and commit.

### Task 5: Issuer-grouped simulated invoices and coordinated mail capture

**Files:**
- Extend: order document repository and views
- Extend: existing notification outbox processor
- Create: issuer-grouped sample invoice snapshot/presentation support
- Create: local mail-capture adapter or durable capture records
- Create: `tests/managed-documents-email.test.ts`

- [ ] Write failing tests for issuer grouping, simulation labels, immutable invoice data, barcode/QR payloads, single coordinated message claiming, expired OTP suppression, retries, and obsolete-event suppression.
- [ ] Verify RED.
- [ ] Generate sample invoice records per issuer group without presenting a mixed order summary as a single tax invoice.
- [ ] Queue and capture the approved journey emails without SMTP or real recipients.
- [ ] Verify duplicate processors cannot send the same claimed message and commit.

### Task 6: End-to-end fixture, R01–R15 traceability, and Milestone 2 handoff

**Files:**
- Extend: `scripts/staging/seed-fictional-fixtures.mjs`
- Create: `scripts/staging/run-managed-maker-demo.mjs`
- Create: `docs/testing/milestone-2-self-test.md`
- Create/modify: requirement traceability document
- Create: `tests/milestone-2-staging-journey.test.ts`

- [ ] Write the failing end-to-end test and reset/isolation assertions.
- [ ] Verify RED.
- [ ] Implement a deterministic fictional application → review → product → order → rider → inspection → OTP → payment → delivery → remittance → reconciliation → settlement demonstration.
- [ ] Document customer/admin/rider/maker self-test steps, expected results, failure cases, actual commands, limitations, and safe disposable reset.
- [ ] Map every R01–R15 requirement to its milestone and acceptance tests; mark ordinary unfinished work as development work, not a production dependency.
- [ ] Run focused tests, full suite, lint, typecheck, builds, schema generation, guarded seed/demo/reset, and commit the Milestone 2 checkpoint.
