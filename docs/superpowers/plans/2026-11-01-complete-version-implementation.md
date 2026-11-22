# Complete version — all 20 workstreams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Detailed checklist prepared on 1 November 2026. **Implementation remains on hold in the planning chat.** All approved active work belongs to one version. The user will start implementation in a new chat.

**Goal:** Deliver every approved V01–V20 workstream, preserving current records and the paused source checkpoint, with a smooth seller workflow and one coherent Super Admin review workspace.

**Architecture:** Extend the existing feature repositories, guarded commands, versioned evidence and financial ledgers. Core forms own their business fields; approved metadata augments them. One authoritative read model supplies action eligibility and public/private projections. Durable source events drive notifications. Real sellable offers and immutable order allocations connect product review to stock, checkout, invoices, aftercare and settlements. No replacement framework, duplicated ledger or blanket activation is required.

**Tech Stack:** Existing React 19 / vinext / Vite / TypeScript application; Drizzle schema; D1/SQLite locally and native MariaDB adapter for hosting; Node/tsx test runner, lint/typecheck/build and approved browser verification.

**Spec:** [Version scope](2026-10-31-complete-version-scope.md), [decision register](2026-10-30-planning-readiness-review.md), [complete-plan review](2026-10-31-complete-plan-review.md), and all 29 controlling sources mapped in the [requirement coverage ledger](2026-11-01-requirement-coverage.md).

## Start here

The [preparation verification report](2026-11-01-preparation-verification.md) records the checks actually completed. The [machine-readable task index](2026-11-01-implementation-index.json) and [source-section index](2026-11-01-requirement-coverage.json) support continuation; the Markdown progress ledger remains the execution status record.

1. Read [new-chat handoff](2026-11-01-new-chat-handoff.md), then this file.
2. Read [AGENTS.md](../../../AGENTS.md) and [LOCAL-START.md](../../../LOCAL-START.md).
3. Begin **T00**, reconcile existing work and baseline tests before changing application code.
4. Execute T01–T35 in the listed order, checking the dependency column and the owning canonical specifications. Update [progress](2026-11-01-implementation-progress.md) after each meaningful checkpoint.
5. Finish all active workstreams and integrated evidence before calling the version complete. Deployment is a separate held action.

This is an execution checklist, not a claim that current code passes it. Task statuses start **Not reconciled / not verified** because existing partial work must be assessed. A working equivalent may satisfy a task after evidence is recorded; do not rewrite it just to create a planned file.

## Verified preparation checkpoint

- Canonical root: `C:/Users/abinash/Desktop/HastaBazaar`.
- Branch: `codex/company-store-maker-readiness`.
- HEAD observed: `1addd7e9d60ace09e111d30ad5d4a8140998ecc6`.
- Configured root matches the canonical root; approved baseline `d9056dc10fee13dc11d15f24a14f63b003befe0b` is an ancestor.
- `npm run local:check` passed: **89/89 forms; sign-in schema ready; local staging; no server started; no data changed**. This did not verify email delivery, payment delivery, application tests or production.
- [Checkpoint manifest](2026-11-01-checkpoint-manifest.json) records metadata/hashes for **701 pre-existing changed source/planning paths** in its stated scopes, before this preparation packet was written. It excludes build/archive/private-media/runtime-data trees and is not a database backup or a complete repository snapshot. Planning-index links added in this turn are expected documentation drift; application-source drift requires inspection.
- Existing document-review/change-request code, simulated activation, draft/form handling and Nepali media are present. Their existence is not evidence that the final approved behavior works.
- Current staging/production version, hosting configuration, repository visibility, real seller checks and real banking/email readiness were **not inspected in this preparation turn**.

## Global Constraints

- The latest user amendments and current AGENTS instructions govern. Current canonical specifications override old proposals and historical implementation plans. No previously settled design decision needs routine reapproval.
- Use only the canonical checkout for active work/preview. Preserve `hastabazaar.localProjectRoot` and `hastabazaar.localBaseline`. Do not launch archives, old Desktop/Hatskala copies or another worktree. Inspect source changes before any commit; no blanket `git add .`, reset, checkout, stash or deletion of the paused work.
- Launch through `npm run local:check`, then `npm run dev` or `START-HASTABAZAAR.cmd` at port 3018. No direct vinext/Vite/Wrangler startup bypass.
- Keep `local_staging`, `NODE_ENV=development`, mail capture, simulated payments and `local.hastabazaar.test`. Missing/incomplete local data is a stop condition. Never automatically seed/migrate/restore/reset/create an empty canonical database to pass a check.
- Prepare additive migrations and run them only against proven disposable fixtures. Existing local/live migration or recovery requires a concrete source/destination and reconciliation review under the repository rules. Do not disable guards or silently repoint credentials to run a test.
- Inspect old test/build/native scripts before execution: identify writes, target, fixture guards and credentials. A skipped native test is not a passing MariaDB test. Do not use production data for development evidence.
- Keep core registration/product intake optional; actual later publication, ordering, verification and finance actions have their true prerequisites. No fake verification, silent consent, forced OTP, simulation-to-production shortcut or 'hide the error' workaround.
- All 20 active streams are one version. Internal parts below are dependency stages, not separately approved reduced releases. If a real capability is unavailable, record it and continue independent work; do not invent readiness or silently defer scope.
- Staging deployment remains held. The user's last preferred future route was local-to-production; this checklist does not deploy, run live migrations, send real email, transfer money, change live permissions or activate real sellers.
- Preserve deferred scope: no new daily/hourly backup program/restore UI/RPO guarantee; no QR/gateway/automatic bank feeds/transfers; no forced second Super Admin for approved finance stages; no language/translation/badge/contact-policy redesign; no used/refurbished/open-box/demo products, new cross-border commerce or unsupported rider/promotional extensions.

## Non-negotiable approved behavior

- Seller Center has **seven sections**; Super Admin has **eight areas**, as listed in the approved paired walkthrough and register.
- Registration autosaves truthfully; optional fields have clean names; Nepal-default phone accepts valid10digits without OTP; Citizenship number, editable address copy and compact agreement remain.
- Verified documents/identity/bank details cannot be overwritten directly. Reasoned scoped changes keep history, exact-version review, separate holds and clear next actions.
- **168-hour** public-profile cooldown starts at actual normal publication. Operational contacts/addresses and approved corrections follow their separate rules.
- Product intake/help may be incomplete or lack a cover; publication needs one accurate cover and a truthful identifiable offer. Gift occasions stay optional. **Approve & publish** is supported; public visibility and permission to order are separate.
- New handmade/retail/resale categories are expandable. Real offers allow at most **3 option types and 100 included combinations**, with independent stock/price and historical identity.
- Use recorded current/future commission timestamps. The new applicable 12% begins at the common recorded start for all covered new orders, subject to exact terms acceptance; old committed orders keep their recorded rate. No future schedule means only current-rate wording.
- Price guidance uses the actual route and selected offer; optional costs/profit remain owner-private. A30-day price check is **advisory only**: suggestions atdays23/29, optional dismissal, no expiry/removal/compulsory changes/automatic repeating cycle.
- Seller preparation reminder at **6h**, escalation at **12h**, from genuine actionability. Staff follow-up within 2h after escalation; unresolved Super Admin checkpoint at 24h from original actionability.
- One eligible Super Admin can prepare/approve/record all approved finance stages. Real conflict, evidence, version and money safeguards remain.
- All operational events notify Super Admin through email plus dashboard/bell, including actor-self events. Shared read status is not task completion. Stop stale/resolved reminders; duplicate workers/retries cannot create duplicate economic effects or blind duplicate sends.
- Current service business day is24elapsed hours. Use saved calendar versions and Nepal display time; exact approved case/payment/incident targets remain in their source specifications.
- Genuine seller/model/terms/identity/beneficiary checks and real commerce paths gate ordering/payouts. Deployment never substitutes for real verification.

## Execution order

| Part | Tasks | Purpose and dependency |
|---|---|---|
| 1 | T00–T05 | [Foundation and safe checkpoint](2026-11-01-implementation-1-foundation.md). Protect the checkpoint, core forms, permissions/clocks, events and shared shell. |
| 2 | T06–T11 | [Seller records and review](2026-11-01-implementation-2-sellers.md). Finish registration, documents/changes, profile and bank instruction foundations. |
| 3 | T12–T17 | [Offers, fees and product entry](2026-11-01-implementation-3-products.md). Build category/offer identity before prices, fee calculations and intake. |
| 4 | T18–T23 | [Publication, checkout and orders](2026-11-01-implementation-4-orders.md). Publish reviewed offers, then connect real checkout/payment and fulfillment. |
| 5 | T24–T29 | [Aftercare, payouts and activation](2026-11-01-implementation-5-finance-activation.md). Complete aftercare and money reconciliation before evidence-based live activation; finish automatic delivery. |
| 6 | T30–T35 | [Operations, integration and delivery](2026-11-01-implementation-6-verification.md). Complete operational screens/help, rehearse preservation, verify everything and prepare delivery. |

Execute sequentially by default in the new chat. Independent work may be delegated only if applicable user/AGENTS/skill instructions authorize it and ownership/merge boundaries are explicit. No new chat or agent was created by preparing this packet.

## All 20 workstreams mapped

T34 checks the integrated result for every stream; T35 prepares its final delivery evidence. The owning implementation tasks below are in addition to those final gates.

| Workstream | Scope | Owning tasks |
|---|---|---|
| V01 | Registration and saved progress | [T06](2026-11-01-implementation-2-sellers.md#t06-complete-simple-registration-honest-autosave-and-applicant-access) |
| V02 | Unified Seller Center | [T05](2026-11-01-implementation-1-foundation.md#t05-build-the-shared-seller-center-and-super-admin-workspace-shells), [T06](2026-11-01-implementation-2-sellers.md#t06-complete-simple-registration-honest-autosave-and-applicant-access), [T09](2026-11-01-implementation-2-sellers.md#t09-implement-public-profile-revision-and-the-seven-day-publication-cooldown), [T17](2026-11-01-implementation-3-products.md#t17-complete-optional-product-entry-support-and-correction-workflow), [T22](2026-11-01-implementation-4-orders.md#t22-implement-seller-order-response-delivery-actions-and-delay-follow-up), [T31](2026-11-01-implementation-6-verification.md#t31-finish-every-admin-area-and-paired-sellercustomer-screen) |
| V03 | Super Admin workspace | [T02](2026-11-01-implementation-1-foundation.md#t02-implement-authority-task-ownership-and-continuous-service-clocks), [T04](2026-11-01-implementation-1-foundation.md#t04-create-durable-operational-events-and-recipient-mapping), [T05](2026-11-01-implementation-1-foundation.md#t05-build-the-shared-seller-center-and-super-admin-workspace-shells), [T10](2026-11-01-implementation-2-sellers.md#t10-complete-the-unified-seller-review-and-readiness-screen), [T11](2026-11-01-implementation-2-sellers.md#t11-manage-company-receiving-accounts-and-payment-instruction-versions), [T18](2026-11-01-implementation-4-orders.md#t18-implement-complete-product-review-publication-and-published-edits), [T22](2026-11-01-implementation-4-orders.md#t22-implement-seller-order-response-delivery-actions-and-delay-follow-up), [T30](2026-11-01-implementation-6-verification.md#t30-finish-team-system-health-incidents-and-audit-records), [T31](2026-11-01-implementation-6-verification.md#t31-finish-every-admin-area-and-paired-sellercustomer-screen) |
| V04 | Verification, change requests and live activation | [T01](2026-11-01-implementation-1-foundation.md#t01-establish-shared-contracts-preservation-fixtures-and-additive-schema), [T07](2026-11-01-implementation-2-sellers.md#t07-finish-panidentity-verification-and-protected-document-change-requests), [T08](2026-11-01-implementation-2-sellers.md#t08-implement-bank-and-material-identity-changes-with-independent-holds), [T10](2026-11-01-implementation-2-sellers.md#t10-complete-the-unified-seller-review-and-readiness-screen), [T28](2026-11-01-implementation-5-finance-activation.md#t28-implement-evidence-based-live-activation-across-the-real-commerce-paths), [T33](2026-11-01-implementation-6-verification.md#t33-rehearse-all-schemadata-transitions-and-prepare-the-cutover-map) |
| V05 | Public profile and operational details | [T09](2026-11-01-implementation-2-sellers.md#t09-implement-public-profile-revision-and-the-seven-day-publication-cooldown) |
| V06 | Product intake, review and publication | [T17](2026-11-01-implementation-3-products.md#t17-complete-optional-product-entry-support-and-correction-workflow), [T18](2026-11-01-implementation-4-orders.md#t18-implement-complete-product-review-publication-and-published-edits) |
| V07 | Pricing, private profit helper and preview | [T16](2026-11-01-implementation-3-products.md#t16-add-private-profit-helper-truthful-pricing-and-customer-preview) |
| V08 | Customer shopping and order screens | [T19](2026-11-01-implementation-4-orders.md#t19-align-public-discovery-product-shop-and-cart-presentation), [T20](2026-11-01-implementation-4-orders.md#t20-carry-immutable-offers-and-policy-snapshots-through-checkout), [T21](2026-11-01-implementation-4-orders.md#t21-implement-manual-receipts-payment-deadlines-and-cod-reconciliation), [T31](2026-11-01-implementation-6-verification.md#t31-finish-every-admin-area-and-paired-sellercustomer-screen) |
| V09 | Order response and delivery | [T22](2026-11-01-implementation-4-orders.md#t22-implement-seller-order-response-delivery-actions-and-delay-follow-up), [T23](2026-11-01-implementation-4-orders.md#t23-implement-cancellation-cutoffs-and-scoped-dispatch-holds) |
| V10 | Cancellations, returns and complaints | [T23](2026-11-01-implementation-4-orders.md#t23-implement-cancellation-cutoffs-and-scoped-dispatch-holds), [T24](2026-11-01-implementation-5-finance-activation.md#t24-complete-returns-complaints-shipping-responsibility-and-inspections) |
| V11 | Company bank, manual payments and COD | [T11](2026-11-01-implementation-2-sellers.md#t11-manage-company-receiving-accounts-and-payment-instruction-versions), [T21](2026-11-01-implementation-4-orders.md#t21-implement-manual-receipts-payment-deadlines-and-cod-reconciliation), [T25](2026-11-01-implementation-5-finance-activation.md#t25-implement-refund-obligations-funding-and-uncertain-execution) |
| V12 | Seller earnings, bank details and payouts | [T08](2026-11-01-implementation-2-sellers.md#t08-implement-bank-and-material-identity-changes-with-independent-holds), [T26](2026-11-01-implementation-5-finance-activation.md#t26-complete-earnings-payout-approval-and-manual-transfer-tracking) |
| V13 | Refunds and post-payout recovery | [T15](2026-11-01-implementation-3-products.md#t15-unify-promotion-combinations-permissions-and-aftercare-allocations), [T25](2026-11-01-implementation-5-finance-activation.md#t25-implement-refund-obligations-funding-and-uncertain-execution), [T27](2026-11-01-implementation-5-finance-activation.md#t27-implement-post-payout-recovery-repayment-and-dispute-follow-up) |
| V14 | Fees, terms, programs and promotions | [T14](2026-11-01-implementation-3-products.md#t14-implement-effective-commission-terms-acceptance-and-schedule-replacement), [T15](2026-11-01-implementation-3-products.md#t15-unify-promotion-combinations-permissions-and-aftercare-allocations), [T20](2026-11-01-implementation-4-orders.md#t20-carry-immutable-offers-and-policy-snapshots-through-checkout), [T33](2026-11-01-implementation-6-verification.md#t33-rehearse-all-schemadata-transitions-and-prepare-the-cutover-map) |
| V15 | Bell, inbox and automatic email | [T01](2026-11-01-implementation-1-foundation.md#t01-establish-shared-contracts-preservation-fixtures-and-additive-schema), [T04](2026-11-01-implementation-1-foundation.md#t04-create-durable-operational-events-and-recipient-mapping), [T29](2026-11-01-implementation-5-finance-activation.md#t29-finish-automatic-delivery-retry-recovery-and-shared-notification-bell) |
| V16 | Form Management and field cleanup | [T03](2026-11-01-implementation-1-foundation.md#t03-replace-fragile-form-dependency-with-stable-core-forms), [T12](2026-11-01-implementation-3-products.md#t12-create-expandable-category-templates-and-new-product-rules), [T30](2026-11-01-implementation-6-verification.md#t30-finish-team-system-health-incidents-and-audit-records) |
| V17 | Team, service coverage, health and records | [T02](2026-11-01-implementation-1-foundation.md#t02-implement-authority-task-ownership-and-continuous-service-clocks), [T30](2026-11-01-implementation-6-verification.md#t30-finish-team-system-health-incidents-and-audit-records) |
| V18 | Nepali video and seller help | [T32](2026-11-01-implementation-6-verification.md#t32-refresh-the-nepali-registration-guide-and-in-context-help) |
| V19 | Preservation, integration and delivery | [T00](2026-11-01-implementation-1-foundation.md#t00-reconcile-the-paused-checkout-and-establish-the-baseline), [T01](2026-11-01-implementation-1-foundation.md#t01-establish-shared-contracts-preservation-fixtures-and-additive-schema), [T33](2026-11-01-implementation-6-verification.md#t33-rehearse-all-schemadata-transitions-and-prepare-the-cutover-map) |
| V20 | New retail/resale, categories and variants | [T01](2026-11-01-implementation-1-foundation.md#t01-establish-shared-contracts-preservation-fixtures-and-additive-schema), [T12](2026-11-01-implementation-3-products.md#t12-create-expandable-category-templates-and-new-product-rules), [T13](2026-11-01-implementation-3-products.md#t13-implement-real-variants-independent-stock-and-legacy-offer-mapping), [T17](2026-11-01-implementation-3-products.md#t17-complete-optional-product-entry-support-and-correction-workflow), [T19](2026-11-01-implementation-4-orders.md#t19-align-public-discovery-product-shop-and-cart-presentation), [T20](2026-11-01-implementation-4-orders.md#t20-carry-immutable-offers-and-policy-snapshots-through-checkout), [T33](2026-11-01-implementation-6-verification.md#t33-rehearse-all-schemadata-transitions-and-prepare-the-cutover-map) |

## Shared contracts and interface handoff

These are proposed implementation contracts, not code already added. T01 reconciles them with existing equivalent types/guards before callers are changed. Keep one definition and record any justified rename in every dependent task; do not leave mismatched producer/consumer signatures.

- `CommandContext = { actorId: string; requestId: string; expectedRevision: string | null; now: number }`. Actor/time/authority are resolved by trusted server code. Request IDs are bound to subject/action/payload. Existing APIs may adapt their numeric versions to the canonical revision without losing equality checks.
- `OfferSnapshot = { offerId: string; productId: string; revision: string; selection: readonly { name: string; value: string }[]; currency: 'NPR'; sellingPaisa: number; compareAtPaisa: number | null }`. Money uses safe integer paisa. Inventory available/reserved and mutable current presentation are separate; snapshots do not read future catalog values.
- `SellerCapabilities = { dashboard: boolean; submitProducts: boolean; publicListings: boolean; newOrders: boolean; payouts: boolean; blockers: readonly { capability: string; sourceId: string; reason: string; nextActor: string; href: string | null }[] }`. T10 exports `getSellerReadiness(db: D1Database, sellerId: string, now: number): Promise<SellerCapabilities>`; checkout and live activation recheck current authority at commit.
- `OperationalEvent = { eventId: string; sourceType: string; sourceId: string; revision: string; kind: string; occurredAt: number; actorId: string }`. T04 constrains source/kind pairs through the event catalog; no arbitrary client audience, email address or private raw payload. Adapt existing `BusinessEvent` without duplicating notifications.
- `calculateServiceDueAt(input: { startedAt: number; amount: number; unit: 'elapsed_hour' | 'staffed_hour' | 'service_day' | 'calendar_day'; calendarVersion: string }): number`. T02 owns timezone/calendar handling. Source-specific policies determine when to start/pause/suppress, rather than using a generic 'last updated' timestamp.
- Financial commands consume original order/tender/benefit/earning/beneficiary versions and current reservations. Existing repository return types may be retained; money states must distinguish prepared/approved/reserved/sent/confirmed/failed/uncertain. An HTTP timeout is not proof of rollback.
- T13 offer/inventory, T20 quote/order, T21 receipt allocation and T25–T27 refund/payout/recovery own one economic identity each. Foreign keys/replay constraints and guarded transactions must connect them. Document the concrete schema and API signature in the ledger before dependent UI work.

## Review Focus

| Failure mode | Owning tests/tasks |
|---|---|
| State changes while the user submits, stale evidence, duplicated actions or cross-account access | T01 transaction fixtures; T03 config recovery; T06 draft ownership; T07–T10 evidence/holds; T18 publication; T20 checkout; T28 activation. |
| Stock, money or discounts duplicated/lost at partial outcomes or uncertain transfers | T13 last-unit/pack tests; T15 allocations; T21 cutoff races; T23 cancellations; T25–T27 refund/payout/recovery caps; T33 native parity. |
| An approved product/seller is inaccessible, or ordering bypasses incomplete real checks | T05/T06 applicant path; T10 capabilities; T17/T18 submission/publication; T19/T20 public and checkout consumers; T28 real activation. |
| Missing forms, worker outage, retries or resolved tasks create lost answers or repeated emails | T03 stable forms; T04 event uniqueness; T14/T16/T22 source suppression; T29 delivery/recovery; T30 incidents. |
| Historical prices/terms/evidence or private data leak/change across redesigned screens | T08/T09 original records; T14 rate boundary; T16 private costs; T19 public projection; T20 immutable snapshots; T31 paired screens; T33 preservation; T34 integrated role tests. |

## Verification and task completion

Each task includes files, dependencies, specific acceptance assertions and a targeted command. For new behavior: write the meaningful missing test, observe the intended failure, implement the smallest responsible change, rerun the target and inspect the diff. For existing code: prove and reuse it; do not rewrite merely to manufacture a failing test.

After each task update status, source diff/commit, fixture target, commands/results including skips, browser evidence where appropriate, event coverage and remaining runtime dependencies. Stage/commit only reviewed task-owned changes if permitted; a documented checkpoint is acceptable when a shared dirty diff cannot safely be split.

Full completion requires:

- [ ] All 36tasks reconciled and implemented where needed; every approved source requirement assigned and verified.
- [ ] All 20 streams have implementation and verification evidence, with no hidden scope deferral.
- [ ] Local startup safety, lint, typecheck, relevant tests and final complete suite/build evidence.
- [ ] Real SQLite and isolated MariaDB transaction/preservation coverage; skipped native checks remain a gap.
- [ ] Seller/admin/customer browser journeys, mobile/keyboard checks and exact state/privacy/uncertainty behavior.
- [ ] No duplicate money/stock/notifications; no stale acceptance or unsupported form metadata bypass.
- [ ] Updated Nepali guide works against the final flow.
- [ ] Real hosting/email/roster/commercial readiness is separately recorded; fictional tests do not supply it.
- [ ] Exact release artifact and reviewed migration/cutover proposal prepared. Deployment/real seller activation remain held until separately authorized.

## What remains factual rather than a new policy question

During implementation obtain the actual current commission effective record, intended staff accounts/coverage, SMTP/provider/domain and scheduler capabilities, carrier operations, real company/seller verification and deployed source version. Most can be inspected from authorized sources; ask only for truly missing access/facts. Continue independent local work while a fact is unavailable. Never invent a date, verification reference, payment result or completed setup.

The preparation packet has no unresolved business-policy approval: it carries all approved corrections. A newly discovered contradiction or unsupported capability must be documented concretely, not hidden as an implementation detail.

