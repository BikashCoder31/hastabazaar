# Promo codes and daily loyalty points

Date: 2026-09-28
Status: Written design for user review; implementation is not yet authorized by this document.
Checkout: C:/Users/abinash/.codex/worktrees/hastabazaar-v1-2-1-staging/Hatskala
Branch: codex/hastabazaar-v1-2-1-staging
Baseline: a36323a

## 1. Agreed outcome and scope

Customers can apply a promotional discount code at checkout and earn points by explicitly claiming a daily visit reward. They later exchange points for shopping credit, which can be spent across orders using the existing wallet. The user selected points instead of immediate daily cash-value credit and accepted the recommended shopping-credit exchange rather than single-use vouchers.

The intended business outcome is repeat visits and purchases. Implementation must preserve seller earnings, customer privacy, authorization, historical financial records and the completed form-catalog contract. Work stays in the existing isolated worktree; unrelated responsive-media edits remain untouched. No production connection, migration, deployment, configuration change, live payment or external message is authorized.

This is an architectural addition: promo redemption changes checkout and aftercare calculations; loyalty introduces a second ledger and an atomic exchange into money-denominated shopping credit. Implement promo codes first, then points, with separate verification checkpoints and a final combined journey.

## 2. First-version product decisions

- Daily rewards require an active, signed-in customer and an explicit Claim today's points action. A page view or GET request never grants points. An ordinary customer account that also has a seller role remains eligible; staff-only identities do not gain customer privileges.
- One daily award per customer per Asia/Kathmandu calendar date, across devices and campaign changes. Server time is authoritative. Show the next local midnight; do not use a rolling 24-hour timer or the browser clock.
- Points and shopping credit have separate balances and histories. No deposit, withdrawal, transfer, sale or cash conversion is offered.
- Points and redeemed credit do not expire in this version. No streak bonuses, random prizes, purchase points, referral-point conversion or manual balance editor.
- Suggested disabled defaults: 10 points per claim, exchange 100 points for 1,000 paisa (NPR 10), minimum exchange one 100-point block. These are proposals for review, not activated commercial terms. Super Admin must select dates and finite issuance limits before enabling earning.
- The exchange denomination is configurable before the first award. Once points have been issued it is immutable in version one, protecting the value of existing balances and keeping one understandable balance. A later rate-change or points migration is a separate design, not a silent devaluation.
- Daily award size and future campaign dates/issuance limits may change through audited, versioned settings; old ledger entries retain their original terms. Limits cannot be set below already-issued totals. Pausing daily earning does not prevent redemption of already-earned points.
- Discounts and rewards are funded by HastaBazaar. They do not reduce the seller's agreed merchandise value or change commission/reserve/settlement rules.

## 3. Customer experience

### Promo code

Checkout offers distinct Promo code and existing Referral code controls so their rules are clear. Applying a promo obtains a server quote and displays its discount and any minimum-spend/expiry condition. Removing it updates the summary without placing an order. Unauthenticated customers are asked to sign in before using a promo, matching account-based usage limits; ordinary guest checkout remains available without incentives.

One promo per order. A promo and a referral discount cannot be combined; the server rejects a payload containing both rather than silently selecting one. Shopping credit, including redeemed loyalty credit, may cover the remaining merchandise subtotal after the selected discount. Credit and discounts never cover delivery or buyer fees and cannot make a total negative.

### My Rewards

Add My Rewards to the customer account navigation and a compact dashboard card. Show available points, today's claimed/unclaimed status, earning pause or budget exhaustion, next claim time and the exchange rate. History distinguishes daily awards and redemptions and uses bounded pagination.

Redeem points shows eligible whole blocks, points spent, credit received and resulting balances before confirmation. A successful exchange links the points debit to one shopping-credit ledger entry. After a lost response, the same attempt is retried or its result loaded; the UI must not generate another debit. Insufficient points, inactive account or a changed settings version produces an actionable message without losing the entered amount.

Checkout continues to call redeemed value Shopping credit. Points themselves never enter the order-payment calculation. For example, redeeming 200 points under the suggested rate adds NPR 20 to the wallet; unused credit remains available for later orders.

## 4. Super Admin experience

Add Promo codes and Loyalty rewards management under the existing administrative navigation. Every mutation requires an active Super Admin server-side, a reason, an opaque request ID and optimistic version checks. Ordinary Admins, sellers and customers receive no new administrative grants. One authorized Super Admin can perform distinct draft and publish steps, consistent with the previously approved unilateral approval design.

A promo defines a normalized unique code, customer-facing label, fixed paisa discount or percentage in basis points, minimum merchandise subtotal, maximum percentage-discount amount, start/end timestamps, finite total usage limit, finite per-customer limit and a finite total discount budget. Version one applies to the entire eligible merchandise subtotal; product/category targeting, free shipping, automatic coupons and guest coupons are excluded. Use a documented ASCII code format, trim and uppercase it, enforce uniqueness in storage, and do not reuse a retired code for a different campaign.

Promo lifecycle is draft -> published/scheduled -> active within its time window -> expired or paused. Editing financial terms on an issued campaign creates a new immutable revision; checkout quotes carry its version. Pausing prevents new use immediately but does not rewrite existing orders. Usage and budget counters are visible with redemption history; historical records cannot be deleted through this UI. Total usage, per-customer usage and committed discount budget accumulate against the stable campaign/code across every revision; editing or republishing never resets them. Reject revised limits below already-consumed totals, including any existing customer usage count.

Loyalty settings show the locked exchange denomination, daily points, dates, finite daily and lifetime points-issuance budgets, used totals and the corresponding maximum shopping-credit exposure. Enabling requires complete valid settings; no unlimited budget is implied by null or zero. Lowering a future limit cannot invalidate earned points. Program accounting tracks issued points, redeemed points, outstanding points and linked credit separately.

## 5. Authoritative calculations and money rules

All monetary amounts are integer paisa; points are positive integers; percentages use basis points. Validate bounded safe integers and compute products/divisions with overflow-safe integer arithmetic. For a percentage promo, round down to whole paisa and cap by the configured maximum, remaining applicable budget and merchandise subtotal. Do not silently reduce the promised quote to fit a depleted budget: reject and requote instead. A fixed promo is capped by merchandise subtotal and otherwise subject to the same eligibility and budget checks.

Calculate merchandise -> either promo or referral discount -> wallet credit -> add delivery and existing buyer fee. The final checkout transaction recalculates from current products, prices, ownership, inventory and campaign state. Client-provided amounts, balances, dates, remaining uses and eligibility are never authoritative.

Allocate the platform-funded promo discount deterministically to merchandise lines, using stable line keys and a defined remainder rule. Preserve seller gross value and existing seller commission calculations. Snapshots identify the funding source and actual promo revision, label/code and line allocation. Budget exhaustion, campaign change or a simultaneous final use cannot overspend a budget or create an order without its matching redemption.

Cancellation and partial refund calculations allocate from the original order/line incentive snapshot, using cumulative integer allocation so repeated partial events cannot exceed the original amount. Delivery and fee policies remain unchanged. An expired or paused promo is not reevaluated retroactively; remaining lines retain their allocated discount even if their reduced subtotal is below the original minimum. A discount is not cash and is never refunded to the wallet. Previously spent wallet credit is restored through the existing controlled cancellation/refund paths, including credit originally obtained from points; do not award the points again.

A promo's successful order placement permanently consumes its usage count and committed budget in version one, including after cancellation or refund. This conservative rule prevents cancel/reorder cycling; restoring campaign capacity is not an implicit side effect. The UI must communicate this rule. Failed checkout consumes neither use nor budget. Same-request replay returns the original successful order without consuming a second use, even if the promo has since expired or been paused, subject to current access checks.

## 6. Storage and transactional invariants

The precise migration names belong in the implementation plan. Add concepts for:

- Promo campaigns/revisions, atomic usage/budget counters and immutable order-linked redemptions with per-customer counting and unique order/request keys.
- An explicit order discount snapshot/source and original/current/refunded promo allocations, integrated with existing aggregate totals. Keep legacy referral-specific fields meaning referral-only; never store a promo amount in referral_discount_paisa or reinterpret historical rows as a different incentive.
- A loyalty configuration record with versioned mutable earning terms and a conversion-rate lock.
- Loyalty accounts and an append-only points ledger; unique customer/local-date daily claims; immutable redemption records linking a points debit to exactly one wallet credit.

Reconcile account balances to their ledgers. Audit administrative changes with actor, reason, old/new versions and request. No direct SQL balance edits or deletable audit trails.

Daily claim transaction: verify current active customer, server-local day, enabled date window and budget; reserve one globally unique customer/day claim; post its points entry and update balance/counters atomically. Two different request IDs on the same day still award only once. A settings change or account suspension between preflight and commit must fail closed. After checking current identity/authority, resolve an existing request before applying new-award date/window/budget eligibility. An exact authorized retry returns its original result even on a later date or after earning is paused, never another award. A fresh day requires a fresh intentional claim request. Bind request keys to actor and operation; changed request content conflicts rather than reusing a result.

Redemption transaction: validate positive whole exchange blocks and settings version, serialize the customer's balances, deduct points, create one immutable redemption and post the linked wallet credit atomically. A points debit must never commit without its credit or vice versa. Duplicate request IDs with identical content replay; changed content conflicts. Concurrent tabs cannot spend the same points twice or exceed wallet money limits. Lock order must be consistent with existing wallet checkout operations.

The existing wallet_entries constraints only allow referral_reward/order_spend/cancellation/refund/gift_card and require a valid source relationship. Add a distinct loyalty_redemption kind and unique redemption reference, with mutually exclusive source checks. Preserve append-only triggers, amount/platform accounting conservation, balance updates and all existing gift-card/order-source checks. Do not loosen constraints to accept arbitrary source-less credits.

Promo redemption, inventory reservation, checkout order/item writes, wallet spending and form answers participate in the same successful business transaction. A quote never reserves a use or awards anything. Transaction and uniqueness guarantees must be tested with the actual D1 runtime, not inferred from in-memory SQLite alone.

## 7. Form catalog, security and privacy

Register every new actual form or form-like action. Define stable identifiers for promo draft/publish controls, loyalty settings, daily claim and points redemption, and update the closed inventory. Daily claim and redemption are protected system financial controls: customer ID, date, amount, rate, request ID, budgets and balances cannot become editable custom questions. Prefer no custom answers on these two actions. Administrative explanatory fields can follow the existing configured-form policy only where it does not alter financial semantics.

Extend commerce.checkout's protected payload keys for the promo identifier and quoted version. Unpublished or unavailable configurations must have a documented initialization procedure; include all new definitions in guarded local setup and verify actual controls after initialization. Do not repeat the prior problem of only initializing representative forms. Production initialization remains a reviewed deployment step, not an automated side effect of a public page.

Validate authentication, ownership, action authority and Origin/CSRF policy on every receiver and again where needed in the atomic mutation. Bound bodies, rate-limit code guesses/claim attempts using existing infrastructure, and retain idempotency across retries. Do not invent a verified-phone requirement unsupported by current onboarding; multi-account farming is not solved by per-account daily uniqueness and must remain a stated first-version limitation. Finite budgets and pausing limit exposure; invasive fingerprinting and device-wide reward exclusion are out of scope.

Customers can read only their own points/credit history. Do not expose other customers' redemption identities, private admin reasons, referral phone keys or financial details through promo validation. Follow existing financial retention, privacy export and erasure/hold policies for new records; never erase retained financial proof as a cosmetic account cleanup.

## 8. Compatibility and rollout

Existing featured-product promotions and referral campaigns remain separate and unchanged. New campaigns begin disabled; existing checkout without a promo remains behaviorally compatible. Historical invoices, receipts, cancellations and refunds render correctly before and after the migration; new documents label promo savings separately from referral savings and wallet credit.

Provide forward D1 migrations plus maintained MariaDB schema equivalents and compatible new query implementations. The existing Babal/MariaDB catalog/runtime failures remain a known independent blocker; do not represent local acceptance as production or MariaDB readiness. Test new D1 behavior directly and new MariaDB operations in an isolated fixture where possible, reporting pre-existing versus introduced failures separately. No live infrastructure is contacted.

Implementation uses RED/GREEN regressions, independent specification/code review and task-scoped commits. Preserve the original 17 modified and 5 untracked responsive-media paths. New changes to protected navigation files must be isolated from those existing changes with reviewed feature-only staging.

## 9. Acceptance evidence

- Promo quote/application/removal and clear rejection of expired, paused, malformed, below-minimum, exhausted and mutually exclusive referral/promo input; server ignores forged discount amounts.
- Real concurrent last-use/per-user/budget races, stale quote, same-request retry and failed-checkout rollback with correct order/answer/audit provenance.
- Daily Nepal-midnight boundaries, browser-clock spoofing, two devices/tabs, changed campaign on the same date, exhausted daily/lifetime budgets, disabled/inactive accounts and atomic replay behavior.
- Redemption minimum/block validation, insufficient points, duplicate/changed requests, simultaneous redemption/checkout, forced failure between ledger operations, wallet upper bounds and preserved rate lock.
- Mixed-wallet-source orders, partial/multi-seller cancellation, refund rounding, expired-code aftercare, unchanged seller earnings, no cash refund of promo discounts and no double restoration or point reaward.
- Current authorization, ownership, privacy/hold behavior, protected system fields and complete form inventory including initialization of every new local form.
- Real browser journeys for Super Admin creation/publication, customer daily claim/history/exchange and checkout with redeemed credit plus a promo; mobile and desktop keyboard/error/confirmation states. Repeat at the established six widths where new dashboard/form layouts apply.
- Relevant existing wallet, referral, gift-card, checkout, cancellation/refund and financial suites, plus complete tests, TypeScript, lint, build and diff verification before final acceptance. Report no skipped required checks as passes.

## 10. Review checkpoint

The accepted concept is points exchanged into shopping credit, alongside checkout promo codes. This document makes the proposed initial reward amounts, immutable post-launch exchange rate, stacking rules, finite budgets and non-restored promo uses explicit for review. These are not live settings. After written-spec approval, produce the task implementation plan and review it before coding; retain the previously requested subagent-driven/TDD method within the actual environment's concurrency limit.
