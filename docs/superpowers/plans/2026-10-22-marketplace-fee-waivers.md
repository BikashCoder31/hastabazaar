# Marketplace Fee Waivers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Let Super Admin manage multiple global marketplace fee-waiver campaigns while preserving visible standard fees and correct historical accounting.

**Architecture:** Dedicated versioned fee campaigns and immutable order-line fee evidence sit beside existing commission terms. Order creation selects one eligible campaign and writes standard fee, full waiver, and net fee atomically. Existing financial consumers continue to receive the recorded net commission; presentation reads separate standard-fee evidence.

**Tech Stack:** TypeScript, React, existing D1/SQLite and native MariaDB adapters, Node test runner and Playwright. No new package dependency.

**Spec:** [Approved design](../specs/2026-10-22-marketplace-fee-waiver-design.md), approved 2026-10-22. Approved 2026-10-22 for subagent implementation with review after every task.

## Global Constraints

- Multiple campaigns may exist and overlap. A fee can only be waived once.
- Start is inclusive and end exclusive. Display Nepal time; store UTC instants.
- Use existing accepted seller commission terms and rate versions; never change the standard setting to zero.
- Company-store/Managed Maker retention and other charges are separate contractual amounts and are not marketplace commission.
- Existing orders are not repriced. Campaign changes affect only future committed orders.
- The canonical local database must not be migrated, seeded, restored, or reset during development.
- User subsequently authorized production upload after successful local, staging, recovery and acceptance checks; report and resolve blockers before deployment.
- Preserve the current checkout, local Git settings, existing index and uncommitted user work. Snapshot only reviewed source into the authorized non-main candidate using a separate Git index.

## Review Focus

1. A scheduled boundary passes between quote and order write: Task 2 pins evaluation to the server order-placement instant and rejects a changed campaign selection.
2. A paused campaign overlaps another active campaign: Task 1 proves the other still applies; Task 4 makes that visible.
3. Zero commission produces no ledger entry: Task 3 must not mark it as missing revenue or fabricate a commission charge.
4. A partially returned historical order has no new sidecar row: Task 3 uses the original commission and preserves existing rounding.
5. Backup or restore encounters the new tables: Task 5 verifies portable inventory and native recovery include all campaign and fee evidence.

## File responsibilities

- New `lib/marketplace/fee-waivers.ts`: types, date/state validation, deterministic selection, integer fee calculation, historical presentation fallback.
- New `lib/db/repositories/fee-waivers.ts`: campaign versions, controlled mutations, global revision lock and checkout guards, immutable line evidence reads.
- New SQLite migration `drizzle/0073_marketplace_fee_waivers.sql` and MariaDB counterpart `deployment/babal/mariadb-marketplace-fee-waivers.sql`: additive tables only (confirm 0073 remains unused before creating).
- New `app/admin/fee-waivers/page.tsx`, `app/api/admin/fee-waivers/route.ts`, `components/admin/fee-waiver-manager.tsx`: Super Admin campaign section.
- Existing `orders.ts`, commission reporting, seller earnings, cancellation/return/accounting and promo cost-preview modules: consume recorded net fees and display evidence.
- Existing release/schema generation, native upgrade, portability inventory and readiness: package and verify the additive schema without applying it locally.

### Task 1: Versioned campaign controls and selection

**Files:** Create the policy module, repository, both migrations, `tests/fee-waiver-policy.test.ts`, `tests/fee-waiver-repository.test.ts`, and `tests/helpers/fee-waiver-fixture.ts`. Reuse existing permission/transaction guard patterns from commission rates and promo codes.

**Interfaces:**

- `FeeWaiverTerms = { name:string; description:string; startsAt:number; endsAt:number }` (name 1–100, description 0–1000 characters, safe nonnegative timestamps, end greater than start).
- `FeeWaiverCampaign = FeeWaiverTerms & { id:string; revision:number; state:'draft'|'published'|'paused'|'ended' }`.
- `selectFeeWaiver(campaigns:FeeWaiverCampaign[], at:number):FeeWaiverCampaign|null` orders eligible published campaigns by startsAt then ID, ascending.
- `FeeWaiverContext = { actorId:string; authSubject:string; requestId:string; expectedRevision:number; now:number }`.
- `mutateFeeWaiver(db, context, command):Promise<FeeWaiverCampaign>` with a discriminated command for create, revise, publish, pause, resume, end. Revision commands identify campaignId; create/revise include terms. Repeated request IDs replay only identical commands.

- [ ] Write tests asserting two simultaneous campaigns can publish; `selectFeeWaiver([later,earlier], start)` picks earlier; at end it is excluded; paused/ended/draft never apply; pausing the selected campaign selects the next overlap. Reject invalid timestamps and reversed ranges.
- [ ] Run `node --import tsx --test tests/fee-waiver-policy.test.ts tests/fee-waiver-repository.test.ts`; observe missing-module/behavior failures.
- [ ] Implement additive tables: `marketplace_fee_waiver_control` with one revision row; `marketplace_fee_waiver_campaigns`; append-only `marketplace_fee_waiver_revisions`; `marketplace_fee_waiver_requests`; and `order_item_marketplace_fees`. Last table has unique order_item_id, standard_bps/base_paisa/standard_paisa/waived_paisa/net_paisa, nullable campaign_id/revision and created_at. Enforce nonnegative integer amounts and standard minus waived equals net. No existing rows are rewritten.
- [ ] Implement mutations in one guarded batch: lock actor and control rows, check live Super Admin identity, compare revisions, persist version/control revision/request receipt and secret-free audit. Published changes retain old versions; ended cannot resume; published schedules may be paused and resumed only before their end. Audit failure, stale revision, revoked role and changed replay payload must roll back.
- [ ] Run the same tests to green, including idempotency, immutable version history, exact boundaries, concurrent publish/pause and audit rollback. Snapshot only these reviewed source changes using the separate candidate index.

### Task 2: Order creation and immutable waiver evidence

**Files:** Modify `lib/db/repositories/orders.ts`, add checkout helpers in `lib/db/repositories/fee-waivers.ts`, and create `tests/fee-waiver-checkout.test.ts` using existing real checkout fixtures.

**Interfaces:**

- `FeeBreakdown = { standardBps:number; basePaisa:number; standardPaisa:number; waivedPaisa:number; netPaisa:number; campaignId:string|null; campaignRevision:number|null }`.
- `calculateMarketplaceFee(basePaisa:number, standardBps:number, campaign:FeeWaiverCampaign|null):FeeBreakdown` uses existing commission rounding; full waiver equals the computed standard amount.
- `quoteFeeWaiver(db:D1Database, at:number):Promise<{controlRevision:number; campaign:FeeWaiverCampaign|null; evaluatedAt:number}>`.
- `feeWaiverCheckoutGuards(db, quote, placedAt:number):D1PreparedStatement[]` locks the same singleton used by mutations and verifies revision plus deterministic selection, including absence. `placedAt` is server-generated immediately before preparing the order transaction, never client supplied; re-read/reject selection if the earlier quote crossed a boundary.
- `feeEvidenceInsert(db, orderItemId:string, breakdown:FeeBreakdown, now:number):D1PreparedStatement` persists evidence in the order batch.

- [ ] Add failing checkout tests: 10,000 paisa base at 1000 bps yields standard=1000, waiver=1000, net=0; no campaign yields net=1000. Overlap attributes exactly one campaign, retry yields one order/evidence row, and a concurrent pause or new campaign invalidates a stale quote. Test exact end-boundary crossing and mixed marketplace/Managed Maker carts.
- [ ] Run `node --import tsx --test tests/fee-waiver-checkout.test.ts`; verify red before implementation.
- [ ] Integrate quote, guards and evidence for registered marketplace lines only. Preserve accepted commission terms. Store effective `order_items.commission_bps=0` and `commission_paisa=0` when waived; standard bps/amount remain in the immutable sidecar and order terms snapshot. Ordinary lines retain their existing amounts with a no-waiver sidecar. Managed Maker calculations are unchanged.
- [ ] Prove every failure rolls back order, stock, payment and fee evidence together, then rerun checkout regression tests. Snapshot reviewed task changes.

### Task 3: Settlement, returns, reporting and promotion consistency

**Files:** Modify `lib/commission/reporting.ts`, `lib/db/repositories/commission-reporting.ts`, `lib/seller/earnings.ts`, `lib/accounting/source-manifest.ts`, `lib/accounting/source-queries.ts`, `lib/incentives/presentation.ts`, `components/admin/promo-code-cost-preview.tsx`; inspect and modify as required `lib/cancellation/accounting.ts`, `lib/cancellation/repository.ts`, `lib/db/repositories/returns.ts`, `lib/db/repositories/payouts.ts`, `lib/db/repositories/fulfillment.ts`. Create `tests/fee-waiver-accounting.test.ts`.

**Interfaces:** `readOrderMarketplaceFees(db, orderItemIds:string[]):Promise<Map<string,FeeBreakdown>>`; `historicalFeeBreakdown(commissionBps:number, commissionPaisa:number, basePaisa:number):FeeBreakdown` returns waived=0, net=standard=recorded commission. Extend commission report types with standard and waived totals while keeping net meanings stable.

- [ ] Add failing real-fixture tests for delivery, payout, cancellation before delivery, partial return/refund and reversal. Assert waived fees stay zero, seller entitlement increases by the waived amount, gross-minus-waived reconciles with net, and zero-fee orders do not appear as missing ledger entries. Include a historical no-sidecar line and multi-quantity rounding/reversal sequence.
- [ ] Run `node --import tsx --test tests/fee-waiver-accounting.test.ts`; observe red.
- [ ] Route displays/report projections through the recorded breakdown; preserve existing net-commission financial consumers. Add gross/waiver evidence to commission exports without treating waived fees as cash expenses. Keep original snapshot amounts separate from current remaining/reversed balances.
- [ ] Update promo cost preview to use net commission, showing a waived-fee case as zero commission contribution before discount. Existing customer promo eligibility is budget-based: preserve that contract and its recorded discounts, but never display gross waived commission as available contribution. Test net contribution of -discount when fee is zero.
- [ ] Run new tests plus existing commission, cancellation, return, payout, promo and accounting regression files. Snapshot reviewed changes only after reconciliation passes.

### Task 4: Super Admin controls and visible seller fees

**Files:** Create the page/API/manager above and `tests/fee-waiver-routes.test.ts`, `tests/fee-waiver-ui.test.ts`. Modify `lib/admin/navigation.ts`, `components/seller/commission-fee-notice.tsx`, `components/seller/seller-earnings-summary.tsx`, `components/admin/commission-report.tsx`, and relevant order-detail pages. Register a fixed feature-managed form contract in `lib/forms/registry.ts` (no retained form publication or generic answer collection).

**Interfaces:** GET/POST `/api/admin/fee-waivers` returns campaign list with computed display state or a mutation result. POST consumes Task 1 command plus expectedRevision/requestId; actor and current time always come from trusted server context. Responses use 403 unauthorized/origin, 422 validation, 409 stale/conflicting request, 503 unavailable; never accept client role or fee amounts.

- [ ] Add failing route tests for Admin/customer/revoked Super Admin and cross-origin requests, then browser tests for multiple campaigns, Nepal dates, schedule/pause/resume/end, revision conflict refresh and visible overlaps.
- [ ] Run `node --import tsx --test tests/fee-waiver-routes.test.ts tests/fee-waiver-ui.test.ts`; verify red.
- [ ] Implement a Super Admin-only navigation entry and screen with clear start/end fields, status and active-campaign list. Show “Pausing this campaign will not stop other active campaigns” where applicable. Server routes and repositories both enforce authorization.
- [ ] Display standard fee, named waiver and net fee on relevant seller/order/commission views. Historical records use Task 3 fallback. Avoid deriving old fees from the current campaign or current rate setting. Test exact 10% / full waiver / 0% copy, changed historical rates, mobile layout and keyboard form use.
- [ ] Run all new UI/route tests and existing navigation/form-catalog/commission/seller earnings checks. Snapshot reviewed changes.

### Task 5: Packaging, recovery and staging gates

**Files:** Modify `scripts/generate-mariadb-schema.mjs`, `scripts/generate-release-manifest.mjs`, `scripts/staging-native-upgrade.mjs`, `lib/portability/d1-source.ts`, readiness schema checks and native fixture setup. Add `tests/fee-waiver-native.test.ts` and update native runner/report expectations deliberately. Document schema rollout and rollback limits in `docs/marketplace-fee-waivers.md`.

**Interfaces:** Existing native runtime and encrypted recovery contracts remain; all new tables must be recognized and inventoried. Schema absence blocks the new release's readiness instead of silently ignoring campaigns or starting with unverified state.

- [ ] Add failing native fixture tests for additive migration preserving existing rows, concurrent campaign/order writes, role revocation, transaction rollback, partial return and encrypted backup/recovery of campaign/evidence rows.
- [ ] Package the reviewed additive MariaDB file and portable inventory; apply only to disposable test databases. Keep the canonical local preflight read-only. Document that restoring an old binary after waived orders exist requires compatible fee-evidence readers; do not assume rollback erases financial history.
- [ ] Run lint, typecheck, full tests, read-only local preflight, and Linux native/recovery CI on the authorized non-main candidate. Require exact candidate SHA and complete reports; a skipped native test is not a pass.
- [ ] Obtain a separate read-only code review of the completed feature and resolve substantive findings. Keep existing MFA enrollment intact.
- [ ] Prepare the hosted migration/backup/recovery source and destination for concrete review. Preserve retained data and stop for scoped irreversible cleanup/access approvals or personal MFA entry. Install only the exact verified artifact under existing staging restrictions, then verify readiness, restart, gateway acceptance and protected smoke. Report unresolved blockers before production.

## Self-review and execution handoff

All approved spec requirements map to Tasks 1–5; review-focus cases have explicit tests. Multiple campaigns are deliberately supported without stacking. No campaign or schema has been applied by this document.

Recommended execution: native in this session because the financial tasks share ordered dependencies and the current checkout/data safeguards must remain under one coordinator. A separate reviewer checks the completed changes. User may instead choose task-by-task subagents with review gates.
