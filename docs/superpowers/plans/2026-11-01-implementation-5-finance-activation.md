# Complete version — Aftercare, payouts and activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Prepared 1 November 2026. Documentation only; implementation remains on hold until the user resumes it. This is part 5 of one release, not a separate release.

**Goal:** Complete the ordered tasks below against their approved source requirements.

**Architecture:** Extend the existing repositories, guards, feature-owned forms and shared projections. Use the [orchestration plan](2026-11-01-complete-version-implementation.md) for cross-task contracts and policy precedence.

**Tech Stack:** Existing React 19 / vinext / TypeScript application, Drizzle schema, D1/SQLite and native MariaDB adapter, Node test runner and approved browser tools.

**Spec:** [All 20 workstreams](2026-10-31-complete-version-scope.md); each task lists its canonical sources. The source requirements remain controlling when a short task summary omits detail.

## Global Constraints

Read the [orchestration constraints](2026-11-01-complete-version-implementation.md) and [new-chat handoff](2026-11-01-new-chat-handoff.md) first. No code, data, release or live record changes are performed by preparing this plan. During implementation preserve the canonical checkout and dirty checkpoint; do not seed/reset/migrate existing local data to pass startup. Update the [progress ledger](2026-11-01-implementation-progress.md) with evidence after each task. Planned filenames are exact intended locations; if an existing implementation already provides the responsibility, record that mapping and reuse it rather than duplicate it.

## Review Focus

Apply the five failure modes in the orchestration plan to the owning tasks below. Test actual state/transactions, not only source-text patterns. Existing targeted tests are starting coverage, not proof that the new cases are already implemented. New test files must be written before their related new behavior. Do not create artificial red tests for unchanged, already-proven behavior.

## T24. Complete returns, complaints, shipping responsibility and inspections

**Workstreams:** V10. **Depends on:** T20, T21, T23.

**Canonical requirements:** [2026-10-31-cancellation-return-rules](../specs/2026-10-31-cancellation-return-rules.md); [2026-10-30-orders-customer-care-workspace](../specs/2026-10-30-orders-customer-care-workspace.md).

**Files**

- Inspect/reuse; modify only where required: [lib/returns/validation.ts](../../../lib/returns/validation.ts); [lib/returns/presentation.ts](../../../lib/returns/presentation.ts); [lib/db/repositories/returns.ts](../../../lib/db/repositories/returns.ts); [components/admin/return-case-actions.tsx](../../../components/admin/return-case-actions.tsx); [app/seller/cases/returns/[id]/page.tsx](../../../app/seller/cases/returns/[id]/page.tsx).
- Create if not already supplied by a verified equivalent: `tests/return-policy-clock.test.ts`.
- Test: `tests/return-policy-clock.test.ts` (planned); [tests/returns-complaints.test.ts](../../../tests/returns-complaints.test.ts); [tests/return-case-presentation.test.ts](../../../tests/return-case-presentation.test.ts); [tests/return-evidence-download.test.ts](../../../tests/return-evidence-download.test.ts).

**Interfaces:** Consumes item delivery facts, saved terms, offer quantities and first-received case time. Produces owned return/complaint decisions, return-logistics responsibility and bounded Finance handoff.

**Behavior and acceptance cases**

- [ ] Day7/15 boundary respects Nepal dates and actual delivery; delayed staff entry retains timely first receipt.
- [ ] No-photo complaint remains possible; non-returnable flag cannot suppress defect/problem help.
- [ ] Duplicate return allocation cannot exceed originally delivered quantity.
- [ ] Carrier failure does not masquerade as customer non-response or restart case age; clarification and generic delay emails do not duplicate.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Apply 7-calendar-day baseline and 15 days for qualifying original sealed goods, delivery date day zero in Nepal. Preserve more favorable saved terms and continuing defect/safety/warranty rights; late damage report or missing photos/video is not automatic rejection.
- [ ] 4. Retain first received time across supported email/help intake and later staff entry. Accept item/quantity returns using historical offers; separate non-delivery from fabricated delivery dates.
- [ ] 5. Apply approved shipping-cost responsibility and company-funded approved return carriage without shifting an unsupported upfront burden to customers; preserve original delivery/benefit allocations.
- [ ] 6. Use 24h first review; clarification 48h with one 24h reminder; usable return instructions within 2 service days; handoff coordination5 calendar days; inspection/outcome within 3 service days from receipt or sufficient evidence earlier.
- [ ] 7. Show receipt, inspection, decision, authorized refund and actual refund separately; enforce promised customer update and owned exceptions.
- [ ] 8. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/return-policy-clock.test.ts tests/returns-complaints.test.ts tests/return-case-presentation.test.ts tests/return-evidence-download.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T24's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T25. Implement refund obligations, funding and uncertain execution

**Workstreams:** V13, V11. **Depends on:** T15, T21, T23, T24.

**Canonical requirements:** [2026-10-31-refunds-after-payout-recovery](../specs/2026-10-31-refunds-after-payout-recovery.md); [2026-10-31-manual-payment-rules](../specs/2026-10-31-manual-payment-rules.md); [2026-10-31-single-super-admin-finance-approval](../specs/2026-10-31-single-super-admin-finance-approval.md).

**Files**

- Inspect/reuse; modify only where required: [lib/managed-commerce/refund-readiness.ts](../../../lib/managed-commerce/refund-readiness.ts); [lib/db/repositories/returns.ts](../../../lib/db/repositories/returns.ts); [lib/db/repositories/platform-service-fee-refunds.ts](../../../lib/db/repositories/platform-service-fee-refunds.ts); [lib/cancellation/accounting.ts](../../../lib/cancellation/accounting.ts).
- Create if not already supplied by a verified equivalent: `lib/payments/refund-obligations.ts`; `components/admin/refund-funding-review.tsx`; `tests/refund-funding-idempotency.test.ts`.
- Test: `tests/refund-funding-idempotency.test.ts` (planned); [tests/promo-aftercare.test.ts](../../../tests/promo-aftercare.test.ts); [tests/commerce-financial-native.test.ts](../../../tests/commerce-financial-native.test.ts).

**Interfaces:** Consumes original tender/benefit/fee allocations and authorized case outcome. Produces one economic refund obligation with separate approved funding, reserved execution, confirmed transfer and reconciliation states.

**Behavior and acceptance cases**

- [ ] Concurrent refund routes cannot exceed original cash/credit or refund the same item twice.
- [ ] One eligible Super Admin completes permitted stages; another person is not mandatory.
- [ ] Unknown transfer cannot be resent as new money until reconciliation; actual confirmed transfer is not undone by UI retry.
- [ ] Post-payout refund can be funded independently while seller recovery remains open.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Calculate bounded refunds from actual paid allocations; restore credit through its actual route and refund cash through reviewed original-payer rules. No unpaid order cash refund or duplicate benefit reimbursement.
- [ ] 4. Finance prepares funding; one eligible Super Admin can approve and record execution, including high-value cases. Keep authority, evidence, conflict and version checks; external manual transfer is never triggered by approval.
- [ ] 5. Reserve pending/uncertain money until actual result reconciles. Distinguish initiated from confirmed/refunded; a bank receipt or email timeout does not establish transfer success/failure.
- [ ] 6. First Finance action within one service day of authorization; preserve saved-policy refund initiation target and any earlier binding due date, not new clocks at each handoff. Customer refund must not wait for seller recovery.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/refund-funding-idempotency.test.ts tests/promo-aftercare.test.ts tests/commerce-financial-native.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T25's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T26. Complete earnings, payout approval and manual transfer tracking

**Workstreams:** V12. **Depends on:** T08, T15, T21, T25.

**Canonical requirements:** [2026-10-30-finance-payments-workspace](../specs/2026-10-30-finance-payments-workspace.md); [2026-10-31-bank-identity-changes-payout-approval](../specs/2026-10-31-bank-identity-changes-payout-approval.md); [2026-10-31-single-super-admin-finance-approval](../specs/2026-10-31-single-super-admin-finance-approval.md).

**Files**

- Inspect/reuse; modify only where required: [lib/db/repositories/payouts.ts](../../../lib/db/repositories/payouts.ts); [lib/managed-commerce/payout-operations.ts](../../../lib/managed-commerce/payout-operations.ts); [lib/managed-commerce/settlement-readiness.ts](../../../lib/managed-commerce/settlement-readiness.ts); [lib/managed-makers/settlement.ts](../../../lib/managed-makers/settlement.ts); [components/seller/payout-request-form.tsx](../../../components/seller/payout-request-form.tsx); [components/admin/payout-actions.tsx](../../../components/admin/payout-actions.tsx); [app/seller/finance/page.tsx](../../../app/seller/finance/page.tsx).
- Create if not already supplied by a verified equivalent: `tests/payout-source-version.test.ts`.
- Test: `tests/payout-source-version.test.ts` (planned); [tests/managed-settlements.test.ts](../../../tests/managed-settlements.test.ts); [tests/registered-settlement-accrual.test.ts](../../../tests/registered-settlement-accrual.test.ts).

**Interfaces:** Consumes eligible reconciled earnings, reviewed beneficiary version, holds and actual model settlement terms. Produces request/prepare/approve/manual-execution/confirm workflow with one immutable payout packet and source reservations.

**Behavior and acceptance cases**

- [ ] Prepared packet cannot pay changed/unverified account or sources already reserved elsewhere.
- [ ] Double approval/recording does not duplicate debit or transferred amount.
- [ ] Confirmed paid versus uncertain transfer remains distinct; bank-only hold blocks payout without hiding order/dashboard.
- [ ] Registered, managed percentage and fixed-supplier routes preserve their own entitlement calculation.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Show earned, available, reserved, paid, held and recovery amounts separately; no promised available payout based only on gross sales.
- [ ] 4. Use the approved standard payout purpose with optional note up to 500 characters. Seller need not invent a justification; protected change reasons remain required.
- [ ] 5. Bind payout approval to exact beneficiary, earnings sources, deductions and bank/identity versions. Recheck before recording transfer; new holds or refund adjustments require fresh review for unpaid packets.
- [ ] 6. Allow the same eligible Super Admin to prepare/approve/record, preserve real conflict checks and actual evidence. Sent/uncertain money retains original facts; no automatic bank transfers.
- [ ] 7. First eligible payout review within one service day, approved daily2 PM queue/6 PM reconciliation in Nepal time; these are work checkpoints, not promised bank execution.
- [ ] 8. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/payout-source-version.test.ts tests/managed-settlements.test.ts tests/registered-settlement-accrual.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T26's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T27. Implement post-payout recovery, repayment and dispute follow-up

**Workstreams:** V13. **Depends on:** T25, T26.

**Canonical requirements:** [2026-10-31-refunds-after-payout-recovery](../specs/2026-10-31-refunds-after-payout-recovery.md); [2026-10-31-single-super-admin-finance-approval](../specs/2026-10-31-single-super-admin-finance-approval.md).

**Files**

- Inspect/reuse; modify only where required: [lib/managed-makers/settlement.ts](../../../lib/managed-makers/settlement.ts); [lib/db/repositories/managed-settlements.ts](../../../lib/db/repositories/managed-settlements.ts); [lib/db/repositories/payouts.ts](../../../lib/db/repositories/payouts.ts).
- Create if not already supplied by a verified equivalent: `lib/payments/seller-recovery.ts`; `components/admin/seller-recovery-review.tsx`; `tests/recovery-allocation-cap.test.ts`.
- Test: `tests/recovery-allocation-cap.test.ts` (planned); [tests/company-store-maker-settlements.test.ts](../../../tests/company-store-maker-settlements.test.ts).

**Interfaces:** Consumes confirmed refund responsibility, original payout/ledger effects and actual recoveries. Produces itemized recovery cases, bounded earnings netting/repayment allocations, disputes and audited reductions/write-offs.

**Behavior and acceptance cases**

- [ ] Two simultaneous recovery sources cannot exceed liability or consume earnings already reserved for payout.
- [ ] Unknown outgoing/incoming transfer cannot be treated as proven recovery; confirmed and provisional balances reconcile.
- [ ] One eligible Super Admin may approve write-off/arrangement; no fabricated second-person requirement.
- [ ] Stalled notice delivery creates owned contact work instead of falsely declaring seller late.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Keep customer refund, funding and seller recovery as linked distinct records. Avoid adding a second economic charge when a native ledger debit already represents the same liability.
- [ ] 4. Recover only permitted eligible future earnings or actually received seller repayment; no automatic bank debit or cross-seller/currency/model netting. Share one cap across cash, earnings, carrier reimbursement and returned payout funds.
- [ ] 5. Show provisional versus confirmed liability and negative balance honestly; support disputes, agreed installments and reasoned Super Admin company absorption/write-off.
- [ ] 6. Review complete recovery/dispute submission within one service day. Start seller7-calendar-day response window only after inbox plus successful email handoff or recorded actual contact; one reminder at day 3, day 7 staff follow-up due within one service day.
- [ ] 7. Suppress stale notices after response, dispute, repayment, supersession or active agreement; read status is not resolution.
- [ ] 8. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/recovery-allocation-cap.test.ts tests/company-store-maker-settlements.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T27's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T28. Implement evidence-based live activation across the real commerce paths

**Workstreams:** V04. **Depends on:** T10, T18, T21, T22, T24, T25, T26, T27.

**Canonical requirements:** [2026-10-30-seller-management-workspace](../specs/2026-10-30-seller-management-workspace.md); [2026-10-31-bank-identity-changes-payout-approval](../specs/2026-10-31-bank-identity-changes-payout-approval.md); [2026-10-31-complete-version-scope](2026-10-31-complete-version-scope.md).

**Files**

- Inspect/reuse; modify only where required: [lib/managed-commerce/activation.ts](../../../lib/managed-commerce/activation.ts); [lib/managed-commerce/maker-authority.ts](../../../lib/managed-commerce/maker-authority.ts); [lib/managed-commerce/settlement-readiness.ts](../../../lib/managed-commerce/settlement-readiness.ts); [lib/products/eligibility.ts](../../../lib/products/eligibility.ts); [lib/auth/managed-maker.ts](../../../lib/auth/managed-maker.ts); [components/admin/managed-maker-activation-form.tsx](../../../components/admin/managed-maker-activation-form.tsx); [db/schema.ts](../../../db/schema.ts); [deployment/babal/mariadb-schema.sql](../../../deployment/babal/mariadb-schema.sql).
- Create if not already supplied by a verified equivalent: `lib/managed-commerce/live-readiness.ts`; `tests/live-activation-evidence.test.ts`; `drizzle/0085_live_activation_evidence.sql`; `deployment/babal/mariadb-live-activation-evidence.sql`.
- Test: `tests/live-activation-evidence.test.ts` (planned); [tests/managed-commerce-activation.test.ts](../../../tests/managed-commerce-activation.test.ts); [tests/company-store-maker-lifecycle.test.ts](../../../tests/company-store-maker-lifecycle.test.ts).

**Interfaces:** Consumes getSellerReadiness, exact accepted agreement/company/model/evidence versions and proven order/settlement capabilities. Produces activateManagedMakerLive(db,ctx,input) and revocable scoped live eligibility; simulation API remains separate.

**Behavior and acceptance cases**

- [ ] Verified bank alone or approval note cannot turn Pending identity/clearance into active commercial selling.
- [ ] Application-approved seller can prepare/publish reviewed browse-only products before activation.
- [ ] Live activation fails on any stale/revoked prerequisite; removing one hold does not release another.
- [ ] After all fixture checks pass, selected approved in-stock offer can order, invoice, fulfill, refund and settle through the actual model without simulation references.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Do not remove simulationAllowed checks from the existing simulation function to create production activation. Add a separately guarded real path and evidence-bound readiness evaluator.
- [ ] 4. Require approved application, reviewed identity/PAN/beneficiary as applicable, valid accepted terms, configured actual legal seller/invoice model, genuine clearance and implemented order/refund/settlement routes.
- [ ] 5. Bind decision to exact source versions; stale evidence or newly imposed hold blocks activation/order acceptance. Separate product publication from new-order activation and payout availability.
- [ ] 6. Show actionable blockers and who must resolve them. Deployment enables the workflow, not automatic verification or activation of every existing seller.
- [ ] 7. Exercise all routes with fictional records; real seller activation remains a recorded authorized Super Admin action against actual evidence.
- [ ] 8. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/live-activation-evidence.test.ts tests/managed-commerce-activation.test.ts tests/company-store-maker-lifecycle.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T28's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T29. Finish automatic delivery, retry recovery and shared notification bell

**Workstreams:** V15. **Depends on:** T04, T14, T16, T17, T22, T24, T25, T26, T27, T28.

**Canonical requirements:** [2026-10-30-email-delivery-automation](../specs/2026-10-30-email-delivery-automation.md); [2026-10-31-system-health-records](../specs/2026-10-31-system-health-records.md).

**Files**

- Inspect/reuse; modify only where required: [lib/email/outbox-runner.ts](../../../lib/email/outbox-runner.ts); [lib/email/retry-policy.ts](../../../lib/email/retry-policy.ts); [lib/operations/business-notifications.ts](../../../lib/operations/business-notifications.ts); [lib/operations/email-queue.ts](../../../lib/operations/email-queue.ts); [app/api/jobs/order-emails/route.ts](../../../app/api/jobs/order-emails/route.ts); [app/api/notifications/[id]/read/route.ts](../../../app/api/notifications/[id]/read/route.ts); [app/admin/notifications/page.tsx](../../../app/admin/notifications/page.tsx); [app/seller/notifications/page.tsx](../../../app/seller/notifications/page.tsx).
- Create if not already supplied by a verified equivalent: `components/notifications/notification-bell.tsx`; `lib/operations/reminder-dispatch.ts`; `tests/automatic-delivery-recovery.test.ts`.
- Test: `tests/automatic-delivery-recovery.test.ts` (planned); [tests/business-notifications.test.ts](../../../tests/business-notifications.test.ts); [tests/order-email-history.test.ts](../../../tests/order-email-history.test.ts).

**Interfaces:** Consumes durable event catalog, due tasks and current source state. Produces leased scheduled dispatch, shared bell/inbox read state, truthful delivery states and one outage/recovery event per incident.

**Behavior and acceptance cases**

- [ ] Duplicate workers, restart and repeated job trigger yield one accepted message per event/recipient/channel.
- [ ] Resolution during backoff cancels pending reminder; already-accepted email is not resent.
- [ ] Known transient provider failures recover automatically on schedule; outage/recovery notices occur once each.
- [ ] Mandatory Super Admin copy includes actor-self; multiple roles do not duplicate.
- [ ] Unknown acceptance remains reconciliation-needed; no universal exactly-once delivery claim without provider evidence.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Implement one-minute automatic wakeup independent of signed-in admin/manual six-message button. Map actual host scheduler/provider capacity, secure job authentication, fair queue draining and heartbeat; do not claim live delivery from local capture.
- [ ] 4. Aim for first attempt in1–2 minutes; detect stopped sending after 5 minutes. Retry known temporary failure at 5/10/20/40/60 minutes then hourly; continue automatic recovery and notify Super Admin when sending stops and recovers.
- [ ] 5. Handle permanent failure versus uncertain provider acceptance separately; reconcile uncertainty rather than blind duplicate resend. Preserve accepted provider message identity and deduplicate workers/restarts/manual retry.
- [ ] 6. Recheck addressed/current/due/permission state immediately before send/retry. Stop stale order/terms/support/refund reminders and honor advisory price dismissal without treating bell-read as task completion.
- [ ] 7. Unify bell and dashboard inbox read state, direct relevant-section links and required Super Admin email+dashboard event copies. Configure independent outage detection so a broken sender is not its only alarm.
- [ ] 8. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/automatic-delivery-recovery.test.ts tests/business-notifications.test.ts tests/order-email-history.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T29's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.


