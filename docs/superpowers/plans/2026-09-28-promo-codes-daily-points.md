# Promo Codes and Daily Loyalty Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers apply controlled promo discounts, claim daily points and exchange those points for existing shopping credit without changing seller earnings or historical financial rules.

**Architecture:** Implement promo codes first, then loyalty. Keep campaign rules and integer calculations in focused modules, use immutable revisions and ledgers, and commit financial changes atomically with existing checkout/wallet operations. Configured forms supply presentation and provenance, never financial authority.

**Tech Stack:** Existing TypeScript, React 19, Vinext, Cloudflare D1/Workers, Drizzle SQL migrations, maintained MariaDB adapter, Node test runner via tsx; no new runtime dependency planned.

**Spec:** `docs/superpowers/specs/2026-09-28-promo-codes-daily-points-design.md` (4862c66), approved in chat on 2026-09-28.

## Global Constraints

- Work only in `C:/Users/abinash/.codex/worktrees/hastabazaar-v1-2-1-staging/Hatskala`, branch `codex/hastabazaar-v1-2-1-staging`. Never modify the Desktop checkout.
- Preserve ancestry of `61c1422`, `537f009`, `dcfaaaf`, `3cfd893`, `9a0bc2c`, and local fixes `a36323a`.
- Preserve the existing 17 modified and 5 untracked responsive-media paths. Navigation edits require feature-only staging and inspection; never blanket-stage.
- No production connection, migration, deployment, configuration change, live payment or external message is authorized.
- One daily award per customer per Asia/Kathmandu calendar date, across devices and campaign changes. Server time is authoritative.
- Suggested disabled defaults: 10 points per claim, exchange 100 points for 1,000 paisa (NPR 10), minimum exchange one 100-point block. No live campaign is enabled by migrations.
- Points and redeemed credit do not expire in this version. No streak bonuses, random prizes, purchase points, referral-point conversion or manual balance editor.
- One promo per order. A promo and a referral discount cannot be combined. Shopping credit may cover remaining merchandise only; no incentive pays delivery or buyer fees.
- Discounts and rewards are funded by HastaBazaar. They do not reduce the seller's agreed merchandise value or change commission/reserve/settlement rules.
- All monetary amounts are integer paisa; points are positive integers; percentages use basis points. Use safe bounded integers and overflow-safe arithmetic.
- Promo usage and budget stay consumed after cancellation/refund and across revisions. Exchange rate locks after first points issuance. Paused earning does not prevent redemption.
- Existing Babal/MariaDB catalog/runtime failures remain a separate blocker. Local acceptance does not mean production readiness.

## Review Focus

1. A lost response retried after midnight, pause or expiry returns the original authorized result; changed payload conflicts. Tests in Tasks 3, 4, 9, 10.
2. Revised campaign limits cannot reset usage or fall below a customer's already-consumed count. Task 3.
3. A stale async quote must not overwrite a newer removed/changed code or permit checkout at obsolete terms. Task 6.
4. Database migration preserves old gift-card/order wallet source constraints and financial history, including mixed-source refunds. Tasks 2, 5, 8, 10.
5. Pausing issuance, exhausting budgets or changing daily award never strands previously earned points; exchange rate cannot be devalued. Tasks 9, 10, 11.

## Execution and verification contract

Use the already selected subagent-driven/TDD method. Actual environment capacity is 4 total agents: main plus at most 3 subagents, not the requested 6. Implementers/reviewers use gpt-6-sol low for straightforward UI work and high for financial/schema/concurrency work. A prompt cannot change the main model; report a mismatch if its actual selection is known. Do not invent model or capacity changes.

For every task: run its failing tests before implementation (RED), implement, run GREEN and relevant existing regressions, obtain independent specification review, then independent code-quality review, address findings and rerun affected tests, then commit only reviewed task paths. No review of unfinished implementation; no dependent task starts until its dependency passes both gates. Keep RED/GREEN command outputs and reviewer outcomes in `.superpowers/sdd/2026-09-28-promo-codes-daily-points/progress.md`. Record runtime failures honestly, never substitute source-string checks for transaction behavior.

Before execution capture dirty-file hashes and diff, verify branch/ancestors, read applicable AGENTS instructions and the approved spec. Stop only at real authority/safety boundaries. Windows worktree writes may require sandbox escalation; the original checkout is not a fallback. Existing local preview and dashboard windows should remain available.

Dependencies: 1 -> 2 -> 3 -> 4; 4 -> 5 and 6; 5+6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12. Tasks 5 and 6 can run in parallel only with the explicit file ownership below. Otherwise use spare slots for sequentially eligible reviews; do not invent parallel work. The sequential financial dependency is deliberate.

Every task below ends with the review/commit gate above. Exact commit scope is its Files block; newly discovered required paths must be explained and inspected before inclusion. Commands run from the isolated checkout. Use `npx tsx --test <listed-tests>` for focused tests, `npx tsc --noEmit` for typing. A passing command must exit 0 with no required test skipped.

## File responsibilities and shared interfaces

New `lib/incentives/types.ts` owns public types; `promo-policy.ts` owns normalization, discount/allocation math; `loyalty-policy.ts` owns Nepal dates and exchange math. New repositories `promo-codes.ts` and `loyalty.ts` own reads and atomic domain changes. New `lib/incentives/forms.ts` owns new form IDs and protected keys; `privacy.ts` owns retained incentive export data. Keep existing order/refund orchestration in place; do not restructure unrelated code.

All timestamps passed to repositories use epoch milliseconds, matching existing Date.now() calls and audit/display conventions. Campaign timestamps are bounded to 0..253402300799999 (end of year 9999). All new exported input/output types live in `types.ts` and are named below. Existing D1Database interface is retained; compatible MariaDB behavior uses `lib/runtime/node-bindings.ts` and explicit dialect handling only where needed.

Core types:
- `PromoTerms`: code, label, kind (`fixed`/`percentage`), fixedPaisa or percentBps/maxDiscountPaisa, minimumSubtotalPaisa, startsAt, endsAt, totalUseLimit, perCustomerUseLimit, budgetPaisa. Required bounded values; inapplicable fields rejected.
- `PromoQuote`: campaignId, revision, code, label, discountPaisa, subtotalPaisa, expiresAt. `PromoState`: immutable current terms/revision, paused flag, cumulative usedCount/spentPaisa, maximum customer count.
- `MutationContext`: actorId, requestId, now, expectedVersion, reason, form: `IncentiveFormSubmission`. Define `IncentiveFormSubmission = {formId: FormId; versionId: string; answers: FormAnswerSnapshot}` using existing form types; requestId comes from the context. Admin mutations require this validated provenance.
- `LoyaltyTerms`: enabled, dailyPoints, pointsPerBlock, creditPaisaPerBlock, startsAt, endsAt, dailyBudgetPoints, lifetimeBudgetPoints. `LoyaltyState`: version, terms, rateLocked, issuedPoints, redeemedPoints, outstandingPoints, issuedTodayPoints.
- `ClaimInput`: userId, requestId, expectedVersion, now, formVersionId. `RedeemInput`: same plus points. Client never supplies userId or now to repositories without server derivation.
- `ClaimResult`: claimId, localDate, awardedPoints, balancePoints. `RedemptionResult`: redemptionId, points, creditPaisa, balancePoints, walletBalancePaisa. Replays return original result snapshots, not newly computed balances.
- `RewardsView`: balancePoints, walletBalancePaisa, claimedToday, nextClaimAt, state, history and nextCursor. History limit defaults 20, maximum 50; opaque cursor bound to owner.
- `IncentiveError`: code (`invalid`, `unauthorized`, `unavailable`, `stale`, `conflict`, `insufficient`, `exhausted`) with safe public message. Routes map to existing 400/401/403/409 conventions; unknown failures do not leak SQL or private reasons.

---

### Task 1: Pin incentive policy and protected form contracts

**Files:** Create `lib/incentives/types.ts`, `lib/incentives/promo-policy.ts`, `lib/incentives/forms.ts`, `tests/incentive-policy.test.ts`. Modify `lib/forms/registry.ts`, `tests/form-catalog-coverage.test.ts`, `tests/helpers/form-policy-ids.ts`.

**Interfaces:** Produce `normalizePromoCode(raw: string): string`, `calculatePromoDiscount(terms: PromoTerms, subtotalPaisa: number): number`, `allocatePromoDiscount(lines: readonly {key:string; subtotalPaisa:number}[], discountPaisa:number): Record<string,number>`. Code format `[A-Z0-9][A-Z0-9_-]{2,31}` after trim/uppercase. Allocation uses proportional floor then largest fractional remainder, ties by ascending stable key. Remaining campaign budget is eligibility, never an amount used to silently shrink the promised discount.

- [ ] Write RED tests with these assertions: `normalizePromoCode(' save_10 ') === 'SAVE_10'`; Unicode lookalikes and 33-character codes throw; 1250 bps on 10001 paisa gives 1250; fixed 20000 on 10001 gives 10001; unsafe integers/negative values throw; allocation of 1 across equal lines `a,b` gives `{a:1,b:0}` and sums exactly.
- [ ] Run `npx tsx --test tests/incentive-policy.test.ts`; capture missing behavior failure.
- [ ] Implement policy and types. Register `staff.promo-code`, `staff.loyalty-settings`, `account.daily-reward`, `account.points-redemption`, `commerce.promo-quote`; protect all financial/auth/request/version keys. Last three are explicit no-custom-answer controls. Update coverage expectations by declared capability, without weakening closed inventory. Extend `commerce.checkout` protected keys with `promoCode` and `promoRevision`.
- [ ] Run `npx tsx --test tests/incentive-policy.test.ts tests/form-catalog-coverage.test.ts tests/form-catalog-policy.test.ts tests/form-catalog-policy-ids.test.ts`; also inspect `tests/form-catalog-coverage.test.ts`, `tests/form-catalog-policy.test.ts`, `tests/form-catalog-policy-ids.test.ts`; GREEN with no pending adapter exemptions. Registered endpoints are completed in downstream tasks; never advertise a working UI before then.
- [ ] Obtain both reviews and commit `feat: define incentive policy and protected forms`.

### Task 2: Add promo schema and historical discount snapshots

**Files:** Create `drizzle/0060_promo_codes.sql`, `deployment/babal/mariadb-promo-codes.sql`, `tests/promo-schema.test.ts`, `tests/helpers/incentive-db.ts`. Modify `scripts/generate-mariadb-schema.mjs`, `deployment/babal/mariadb-schema.sql` through generator only.

**Interfaces:** Produce stable `promo_campaigns`, immutable `promo_revisions`, `promo_customer_usage`, `promo_redemptions`; counters belong to campaign, never revision. Redemption has unique order and actor/request identity, payload digest and original response. Add explicit original/current/refunded promo amounts to order/item financial snapshots, default zero for old rows, and discount source (`none`, `referral`, `promo`) backfilled from actual historical referral values. Preserve existing referral columns. Test helper `createIncentiveDb(): Promise<{db:D1Database; dispose():Promise<void>}>` uses real Miniflare D1 and actual migrations plus minimal fictional prerequisites.

- [ ] Write tests asserting migration of a pre-feature referral order leaves totals/referral values unchanged, promo values zero; duplicate normalized code/order redemption rejects; negative counters, over-budget consumption and revision update/delete reject. Exercise both valid historical wallet entries and invalid source entries after migration.
- [ ] Run `npx tsx --test tests/promo-schema.test.ts` and record RED before migration.
- [ ] Add migration, constraints/triggers needed for aggregate consistency, immutable snapshots and supporting indexes. Do not seed enabled campaigns. Generate MariaDB schema with `npm run schema:babal`; inspect generated diff for unrelated changes.
- [ ] Rerun schema tests plus `tests/mariadb-migration-collation.test.ts`; prove failed batches roll back. Document migration fixture prerequisites rather than silently bypassing failed statements.
- [ ] Reviews, then commit `feat: persist promo campaigns and discount snapshots`.

### Task 3: Implement audited promo lifecycle and quotes

**Files:** Create `lib/db/repositories/promo-codes.ts`, `tests/promo-repository.test.ts`.

**Interfaces:** Consume Task 1 types and Task 2 schema. Produce `savePromoDraft(db, context: MutationContext, terms: PromoTerms, campaignId?: string): Promise<PromoState>`, `publishPromo(db, context, campaignId: string): Promise<PromoState>`, `pausePromo(db, context, campaignId: string): Promise<PromoState>`, `quotePromo(db, input: {userId:string; code:string; subtotalPaisa:number; now:number}): Promise<PromoQuote>`. Mutation functions consume context.form and persist audit/answers in the same batch. Produce `preparePromoConsumption(db, input:{userId:string; orderId:string; requestId:string; quote:PromoQuote; now:number}): Promise<readonly D1PreparedStatement[]>` for the order-owned atomic batch, with commit-time authority/revision/usage/budget assertions.

- [ ] Write RED assertions: ordinary admin rejected; same active Super Admin can draft then publish; stale expectedVersion leaves audit/counters unchanged; revision2 retains spentPaisa and each customer's count; lowering any limit below consumption rejects. Quote expired/paused/not-started/below-minimum/exhausted rejects without writes; quote never returns another customer's identity. Exact admin request replay after pause returns original response; changed payload conflicts.
- [ ] Run `npx tsx --test tests/promo-repository.test.ts` to RED.
- [ ] Implement lifecycle and quote functions with finite budgets, actor checks inside mutation and revision immutability. Budget below calculated discount rejects, never discounts only the remainder. Serialize campaign consumption with checked SQL in the same business batch, not JavaScript read/check/write.
- [ ] Rerun repository and schema tests to GREEN, including two simultaneous final-use attempts: one consumption and no overspend.
- [ ] Reviews, then commit `feat: add audited promo lifecycle and quoting`.

### Task 4: Make checkout consume promo atomically

**Files:** Modify `lib/checkout/validation.ts`, `lib/db/repositories/orders.ts`, `lib/db/repositories/wallet.ts`, `app/api/checkout/route.ts`. Create `app/api/checkout/promo/route.ts`, `tests/promo-checkout.test.ts`, `tests/promo-checkout-routes.test.ts`.

**Interfaces:** Extend `CheckoutInput` with optional `promoCode:string` and `promoRevision:number` required together; preserve `createCodOrder` signature. POST `/api/checkout/promo` consumes `{code}` plus protected form envelope and derives customer/cart/subtotal/server time; returns PromoQuote. `quoteOrderCredit` gains optional `merchandiseDiscountPaisa:number` for promo context, mutually exclusive with referral; legacy callers remain unchanged. It caps wallet spending by merchandise less the selected discount.

- [ ] Write RED: subtotal10000, promo1000, wallet2000, delivery500 -> total7500, unchanged seller gross10000; promo+referral rejects. Forged amount/customer/time ignored or rejected, guests cannot quote/use promo, ordinary guest order still works. Stale revision/price rejects for reconfirmation. Failure after promo statements leaves zero order/redemption/wallet/form changes. Concurrent last-use, per-user-limit and last-budget requests allow only valid winners. Authorized retry after expiry returns original order and one redemption; changed intent conflicts.
- [ ] Run `npx tsx --test tests/promo-checkout.test.ts tests/promo-checkout-routes.test.ts` to RED.
- [ ] Implement inside existing checkout batch with inventory, answers and audit. Preserve actor validation before replay. Add bounded body, trusted Origin and existing rate limiter; no private eligibility details in errors. GET is read-only. Store source and line snapshots, never promo data in referral fields.
- [ ] Run GREEN plus `tests/form-catalog-commerce.test.ts`, `tests/form-catalog-commerce-success.test.ts`, `tests/checkout-recipient.test.ts`, `tests/referral-release.test.ts` and typecheck.
- [ ] Reviews, then commit `feat: apply promo discounts atomically at checkout`.

### Task 5: Preserve promo accounting through aftercare and documents

**Files:** Modify `lib/cancellation/accounting.ts`, `lib/cancellation/repository.ts`, `lib/db/repositories/returns.ts`, `lib/db/repositories/wallet.ts`, `lib/db/repositories/orders.ts`, `app/orders/[orderNumber]/page.tsx`, `app/orders/[orderNumber]/documents/[id]/page.tsx`. Create `tests/promo-aftercare.test.ts`.

**Interfaces:** Existing public aftercare signatures remain stable; receipt/document result types expose distinct promo/referral/original/current/refunded values. Consume original per-line allocations, never current campaign rules. This task owns orders/wallet files while Task 6 owns checkout/admin UI.

- [ ] Write RED assertions: multi-seller partial cancellation keeps remaining allocated promo even below original minimum; cumulative three-part rounding totals original discount exactly; promo never becomes refundable cash or wallet credit; mixed wallet funding restores only spent credit; expired campaign still renders historical label/revision. UsedCount/spentPaisa remain consumed after complete refund. Legacy referral invoice unchanged.
- [ ] Run `npx tsx --test tests/promo-aftercare.test.ts` to RED.
- [ ] Extend existing cumulative refund allocation and aggregate invariants; render Promo savings separately from Referral savings and Shopping credit. Maintain seller commission, reserves, invoice adjustments and delivery policies.
- [ ] Run GREEN plus `tests/cancellation-accounting.test.ts`, `tests/returns-complaints.test.ts`, `tests/referral-release.test.ts`, typecheck.
- [ ] Reviews, then commit `fix: preserve promo allocations through order aftercare`.

### Task 6: Add promo administration and customer controls

**Files:** Create `app/admin/promo-codes/page.tsx`, `app/api/admin/promo-codes/route.ts`, `components/admin/promo-code-manager.tsx`, `tests/promo-ui.test.ts`, `tests/promo-admin-routes.test.ts`. Modify `components/commerce/checkout-form.tsx`, `components/admin/admin-navigation.tsx` (feature-only hunk).

**Interfaces:** Admin POST accepts discriminated actions draft/publish/pause, campaignId where required, expectedVersion, requestId, reason, terms for draft, configured form envelope. UI uses Tasks 3/4 endpoints; preserve request ID while result uncertain and generate fresh ID for changed intentional input.

- [ ] Write RED mounted/route tests: active Super Admin sees controls, ordinary admin denied server-side; all finite limits required; quote apply/remove updates summary, promo/referral conflict explained; slow response for code A cannot replace newer B or removed code; changed quote requires confirmation; actual submit click sends once, replay preserves ID. No hidden hook fetching on unauthorized/unmounted surfaces.
- [ ] Run `npx tsx --test tests/promo-ui.test.ts tests/promo-admin-routes.test.ts` to RED.
- [ ] Build semantic forms with explicit button types and correct BaseUI link/button behavior. Show campaign consumption surviving cancellation, dates/minimum, usage/budget/revision and actionable errors. Keep product-featured promotions separate. Add navigation without staging existing responsive changes.
- [ ] Run GREEN, form coverage, typecheck, scoped lint. Manually inspect keyboard focus and mobile layout in final browser gate.
- [ ] Reviews, then commit `feat: add promo management and checkout controls`.

### Task 7: Verify promo delivery and local configuration readiness

**Files:** Modify `scripts/form-catalog-local-setup.mjs`. Create `tests/incentive-local-setup.test.ts`, `scripts/incentives-browser-check.mjs`, `docs/testing/promo-codes-daily-points-self-test.md`.

**Interfaces:** Add explicit `--publish-incentive-configs` mode, using audited draft/publish APIs and existing loopback/disposable guards. Initialize every present ID from `lib/incentives/forms.ts`, preserve existing published revisions, do not enable business campaigns. Script gains `--phase=promo` now and `--phase=combined` in Task12.

- [ ] Write RED assertions: non-loopback/unmarked/production context refuses before mutation; every incentive form initialized once; existing config unchanged; no seller/checkout/payment/message side effect. Run `npx tsx --test tests/incentive-local-setup.test.ts` to demonstrate failure.
- [ ] Implement guarded setup and browser assertions. Use fictional admin/customer only; preserve current local data and open dashboard sessions. Apply only pending local migration0060 after preflight, never reset/reseed existing state.
- [ ] Run GREEN and guarded promo journey: admin draft/publish, customer quote/remove/reapply, local simulated order, receipt/partial cancellation with accounting checks. Capture screenshots and results at 232,390,722,1024,1440,1920 widths. No live payment or message.
- [ ] Record exact commands/environment/results and any blocker in self-test/progress; both reviews, commit `test: verify promo flows and complete local form setup`. Promo checkpoint must pass before loyalty implementation.

### Task 8: Add loyalty ledger and wallet source migration

**Files:** Create `drizzle/0061_loyalty_points.sql`, `deployment/babal/mariadb-loyalty-points.sql`, `tests/loyalty-schema.test.ts`. Modify schema generator and generated MariaDB schema as in Task2.

**Interfaces:** Produce singleton loyalty configuration with immutable versions, accounts, append-only points entries, daily claims unique(userId,localDate), redemptions unique(userId,requestId), day/lifetime issuance counters. Wallet adds `loyalty_redemption` kind and unique redemption FK; exactly one appropriate gift-card/order/loyalty source, positive redemption credit, amount+platform_amount=0. Store original responses and actor-bound intent digests.

- [ ] RED schema tests: old wallet rows/balances survive copy migration; valid loyalty credit accepts, missing/wrong/duplicate source rejects; negative points balance and points-entry update/delete reject; one day cannot be awarded twice under different campaigns. Migrate historical gift card, referral and cancellation entries intact.
- [ ] Run `npx tsx --test tests/loyalty-schema.test.ts` to RED.
- [ ] Implement forward migration preserving append-only/balance/source/conservation triggers and indexes. Seed disabled defaults only, require finite valid limits before enabling, lock rate after first issuance. No points awarded by migration or GET.
- [ ] Run GREEN and schema/collation regressions; inspect generated changes. Reviews, commit `feat: add loyalty ledger and wallet redemption source`.

### Task 9: Implement daily claims and audited loyalty settings

**Files:** Create `lib/incentives/loyalty-policy.ts`, `lib/db/repositories/loyalty.ts`, `tests/loyalty-claims.test.ts`, `tests/loyalty-settings.test.ts`.

**Interfaces:** Produce `nepalRewardDay(now:number): {localDate:string; nextClaimAt:number}`, `saveLoyaltyDraft(db, context:MutationContext, terms:LoyaltyTerms):Promise<LoyaltyState>`, `publishLoyalty(db, context):Promise<LoyaltyState>`, `pauseLoyalty(db, context):Promise<LoyaltyState>`, `claimDailyPoints(db, input:ClaimInput):Promise<ClaimResult>`, `getRewards(db, userId:string, now:number, cursor?:string, limit?:number):Promise<RewardsView>`. Admin mutations consume context.form and commit answers atomically. Claim/redemption use formVersionId to enforce the protected no-answer configuration at commit without storing custom answers. Identity is derived by routes and rechecked during mutation.

- [ ] RED tests: `2026-09-28T18:14:59Z` belongs to Sep28 and `18:15:00Z` to Sep29; two devices get one10-point award; changing campaign same day awards none; browser date ignored. Daily/lifetime final-budget race never exceeds limits. First award locks conversion rate; paused/disabled/inactive/stale claim creates no entries. Original request retried next day or paused returns original claim after current auth check; changed request conflicts. GET doesn't create rewards.
- [ ] Run `npx tsx --test tests/loyalty-claims.test.ts tests/loyalty-settings.test.ts` to RED.
- [ ] Implement checked atomic batch with uniqueness and authority/config/counter assertions. Use server Nepal date and original response snapshots. Lifetime counters never reset by revision; future limits cannot undercut totals. Bound owner history/cursors, omit private audit notes. Show liability in integer blocks plus outstanding points, never silently round liabilities down.
- [ ] Run GREEN with real D1 concurrent tests and schema regressions. Reviews, commit `feat: add daily points claims and controlled issuance`.

### Task 10: Exchange points into wallet credit atomically

**Files:** Modify `lib/db/repositories/loyalty.ts`, `lib/incentives/loyalty-policy.ts`. Create `tests/loyalty-redemption.test.ts`.

**Interfaces:** Produce `calculateRedemption(points:number, terms:LoyaltyTerms):number`, `redeemPoints(db, input:RedeemInput):Promise<RedemptionResult>`. At100points/block and1000paisa/block,200points yields2000paisa. Reuse existing wallet serialization order before points account mutation; no isolated points debit transaction.

- [ ] RED tests: 0,99,101,negative/unsafe values reject;200->2000; insufficient balance rejects. Paused/exhausted earning still permits redemption of earned points. Concurrent redemption/checkout cannot double-spend; same request credits once; changed amount conflicts. Inject failure between point debit and wallet credit, assert both ledgers and balances unchanged. Wallet bounds reject overflow. Refund of spent redeemed credit restores wallet only, no points reaward.
- [ ] Run `npx tsx --test tests/loyalty-redemption.test.ts` to RED.
- [ ] Implement one atomic transaction linking redemption, debit and credit; assert expected version and frozen rate for new request, replay original result before new-operation eligibility after auth. Preserve all wallet source/sign rules.
- [ ] Run GREEN plus promo-aftercare and loyalty schema/claim tests. Reviews, commit `feat: redeem loyalty points into shopping credit atomically`.

### Task 11: Add rewards dashboards, protected receivers and privacy retention

**Files:** Create `app/account/rewards/page.tsx`, `components/account/rewards-panel.tsx`, `app/api/account/rewards/route.ts`, `app/api/account/rewards/claim/route.ts`, `app/api/account/rewards/redeem/route.ts`, `app/admin/loyalty/page.tsx`, `components/admin/loyalty-manager.tsx`, `app/api/admin/loyalty/route.ts`, `lib/incentives/privacy.ts`, `tests/loyalty-routes.test.ts`, `tests/loyalty-ui.test.ts`, `tests/incentive-privacy.test.ts`. Modify `app/account/page.tsx`, both account/admin navigation components with isolated hunks, `lib/db/repositories/operations.ts`, `app/api/admin/privacy/[id]/route.ts`.

**Interfaces:** GET rewards returns RewardsView for authenticated owner; POST claim accepts requestId/expectedVersion and protected form version only; POST redeem additionally accepts points. Admin action schema mirrors Task6 lifecycle with LoyaltyTerms. Produce `collectIncentivePrivacyData(db,userId:string)` returning only owned ledger/redemption history; integrate existing export/hold/erasure handling, retain required financial proof and held records.

- [ ] RED tests: guest/inactive/other-owner denied, seller+customer allowed, staff-only not granted customer privileges; bad Origin, oversized bodies and rate limits enforced; forged date/rate/customer rejected; custom financial fields cannot override values. Owner export includes new history, private staff reasons excluded, held financial records survive erasure. Mounted claim/redemption buttons work by keyboard; uncertain network retry reuses key; redemption confirmation shows points/credit/resulting balances; pause keeps Redeem available; no eligible points disables it clearly.
- [ ] Run `npx tsx --test tests/loyalty-routes.test.ts tests/loyalty-ui.test.ts tests/incentive-privacy.test.ts` to RED.
- [ ] Build account card/My Rewards/history/pagination and admin settings/counters/rate-lock UI. Reuse configured forms, bounded bodies, rate limiter, current auth and error patterns. Register actual new form sites/adapter receivers fully; no static-source tests in place of mounted interaction tests. Never log sensitive balances/identities to public telemetry.
- [ ] Run GREEN, full form coverage/validation/access, typecheck and scoped lint. Reviews, commit `feat: add customer rewards and admin loyalty controls`.

### Task 12: Complete compatibility, combined browser and regression acceptance

**Files:** Create `scripts/test-incentives-mariadb.ts`, `tests/incentives-compatibility.test.ts`. Modify `scripts/incentives-browser-check.mjs`, `docs/testing/promo-codes-daily-points-self-test.md`, `scripts/form-catalog-local-setup.mjs`, `lib/runtime/node-bindings.ts` only for demonstrated new dialect gaps.

**Interfaces:** Extend existing isolated MariaDB fixture conventions from `scripts/test-wallet-mariadb.ts`; never use production credentials or print secrets. New operations must preserve transaction semantics through the existing adapter; do not globally weaken SQL translation to pass a test.

- [ ] Add failing real adapter assertions for promo publication/quote/consumption and claim/redemption/concurrency, fresh and pre-feature migration datasets; run `npx tsx --test tests/incentives-compatibility.test.ts` and `npx tsx scripts/test-incentives-mariadb.ts` against disposable loopback fixture. Separate pre-existing catalog/bootstrap failures from new-feature failures. No skipped compatibility check counts as passing.
- [ ] Implement only new demonstrated compatibility gaps; rerun same cases to GREEN or explicitly block cross-runtime acceptance with concrete failing evidence. Apply local0061 only to approved marked state; initialize every new form, preserve already-published ones. Do not enable a non-fictional campaign.
- [ ] Run combined browser journey with fictional users: admin config, daily claim, history, redemption, promo+credit checkout, cancellation/refund, duplicate retry. Acquire sufficient points in disposable test fixtures, never edit the running customer's ledger or advance live server time. Check all six widths, keyboard, stale/error/retry paths, console and network failures. Assert no unintended seller governance mutations or external messages.
- [ ] Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `git diff --check`; all must exit0. Record counts, dates, browser artifacts and command logs; verify dirty-file hashes and feature-only staged diffs. Baseline had1633 tests before later fixes; report actual current count, never promise a frozen total.
- [ ] Independent final specification review then code-quality/security/financial review of the full feature diff, resolve findings and rerun affected checks. Commit scoped acceptance changes `test: verify promo and loyalty acceptance`. Report delivered local features, disabled launch defaults, retained responsive work, and any existing MariaDB blocker. Do not deploy or claim production readiness.

## Named regression anchors

These compact assertions pin the intended outcome; each task adds its other listed cases using the real fixture or mounted route/component harness, not a mock of the function under test. Names are required test descriptions, not additional implementation APIs.

| Task | Test name | Core assertion after the specified setup/action |
| --- | --- | --- |
| 1 | normalizes ASCII codes and allocates a one-paisa remainder | `assert.equal(normalizePromoCode(' save_10 '), 'SAVE_10'); assert.deepEqual(allocatePromoDiscount([{key:'a',subtotalPaisa:1},{key:'b',subtotalPaisa:1}],1), {a:1,b:0})` |
| 2 | historical referral order survives promo migration | `assert.equal(after.referralDiscountPaisa, before.referralDiscountPaisa); assert.equal(after.promoDiscountPaisa, 0); assert.equal(after.totalPaisa, before.totalPaisa)` |
| 3 | republishing never replenishes consumed campaign budget | `assert.equal(revision2.spentPaisa, revision1.spentPaisa); assert.equal(revision2.usedCount, revision1.usedCount)` |
| 4 | promo and wallet cover merchandise without changing seller gross | `assert.equal(order.grandTotalPaisa, 7500); assert.equal(sellerGrossPaisa, 10000); assert.equal(redemptions.length, 1)` |
| 5 | full refund retains promo consumption and restores only wallet spend | `assert.equal(walletRestoredPaisa, 2000); assert.equal(cashRefundPaisa, paidCashPaisa); assert.equal(after.spentPaisa, before.spentPaisa)` (fixture has no nonrefundable delivery/fees) |
| 6 | obsolete quote cannot restore a removed code | `assert.equal(renderedPromoDiscountPaisa, 0); assert.equal(submittedBody.promoCode, undefined)` |
| 7 | initialization preserves existing configuration and covers every new ID | `assert.deepEqual(missingFormIds, []); assert.deepEqual(existingAfter, existingBefore); assert.equal(domainMutationCount, 0)` |
| 8 | duplicate loyalty source cannot credit wallet twice | `assert.equal(walletEntryCount, 1); assert.equal(balanceAfterDuplicate, balanceBeforeDuplicate)` |
| 9 | same-date parallel claims award exactly ten points | `assert.equal(claimRows.length, 1); assert.equal(pointsBalance, 10); assert.equal(issuedTodayPoints, 10)` |
| 10 | injected wallet-credit failure rolls points back | `assert.equal(pointsAfter, pointsBefore); assert.equal(walletAfter, walletBefore); assert.equal(redemptionCount, 0)` |
| 11 | paused earning leaves existing points redeemable | `assert.equal(claimButton.disabled, true); assert.equal(redeemButton.disabled, false)` (eligible100-point fixture) |
| 12 | each database conserves linked points redemption | `assert.equal(pointsDebited, 200); assert.equal(walletCreditedPaisa, 2000); assert.equal(linkedCreditCount, 1)` |
## Plan self-review and handoff

Coverage mapping: spec sections1-2 -> global constraints/Tasks1,8-10; section3 -> Tasks4,6,11; section4 -> Tasks3,6,9,11; sections5-6 -> Tasks2-5,8-10; section7 -> Tasks1,4,7,11; section8 -> Tasks2,7,8,12; section9 -> task tests and Task12. Each Review Focus item has an owning RED assertion. No implementation starts until the user has reviewed this plan; keep the already chosen subagent-driven/TDD execution method.
