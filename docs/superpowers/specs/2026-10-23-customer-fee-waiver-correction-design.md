# Customer marketplace-fee waiver correction

Status: owner approved this written amendment, the separate customer-fee campaign approach and its implementation plan on 23 October 2026, retaining subagents with independent review after each task. Hosted financial writes and other concrete action gates remain separate. The owner confirmed both 12% rates and the NPR 10 customer-fee-only waiver. This replaces the charge/beneficiary interpretation in the approved 22 October campaign specification, while retaining its global scope, multiple campaigns, controls and historical preservation.

## Confirmed outcome

Registered Seller commission and HastaBazaar-managed sale-linked maker retention are each to be 12% under properly published and accepted new commercial terms. These are separate settings and agreements. The maker's share under the new sale-linked split is 88%, subject to the existing treatment of other charges and adjustments; this is not a promise that every settlement equals 88% of an order's entire payable total.

The marketplace/customer platform service fee is currently **NPR 10, or 1,000 paisa, once per order**. It is not 10% and is not seller commission. Super Admin controls automatic global campaigns that waive this customer charge on eligible new orders. Commission/retention remains payable according to valid accepted terms. A campaign never waives delivery, merchandise, taxes, payment charges, or either seller commission.

Several campaigns may be scheduled and overlap. One full customer-fee waiver applies per eligible order; campaigns do not stack. Customers do not need to enter a voucher code. The owner previously chose automatic global campaigns; code redemption, seller assignments and partial discounts are outside this correction.

The existing personal-PAN managed application route remains available alongside Registered Seller applications once each route's actual terms/readiness requirements are met. No business PAN is required merely to apply through the managed route. Personal PAN, private identity evidence, staff review, accepted terms, product eligibility, program readiness and payout gates remain applicable. Submitting or approving an application does not activate managed sales.

## What exists and why it must change

The current staging candidate already charges the NPR 10 customer fee separately. Its campaign implementation instead waives Registered Seller commission per order line and leaves that customer fee charged. Changing a label or setting the commission to zero cannot implement the confirmed outcome.

The customer-fee snapshot currently requires net charged to equal the enabled policy amount. A real waiver therefore needs a new validated representation, order-level financial evidence, and corresponding accepted quotes, documents, refunds and reporting. Globally disabling the policy would hide the standard charge and lose campaign attribution.

Source reconnaissance is recorded in `output/production-readiness-2026-10-23/customer-fee-waiver-correction-recon.md`, against exact old and staging-candidate Git blobs. It is source evidence, not proof of today's deployed rows or campaign state. Candidate `27b0d15100123783da8fe0a59589a1aaef31e06a` is not the final corrected production candidate.

## Approaches and proposed engineering choice

The controller proposes **separate customer-fee campaign storage and order-level evidence**, sharing tested campaign validation/selection primitives where practical. Existing seller-commission campaign records and per-line facts remain intact as legacy history. Explicit names and units make a customer fee difficult to confuse with commission again. This is the controller's proposed engineering choice, not a new owner business requirement.

An alternative is shared campaign storage with an additive, immutable fee-type binding. It reduces some storage duplication but requires a correct type filter in every quote, mutation, replay, report and overlap path. Missing a filter could repeat the wrong-charge defect. A silent default reinterpreting existing campaign IDs is unacceptable in either approach.

A global fee enable switch lacks the approved scheduling, overlap and historical campaign evidence. Converting or deleting old campaign history is also unsuitable. This document's approval would select the separate customer-fee approach unless the owner chooses the explicit-type alternative before approval.

## Campaign experience and authority

The existing Marketplace fee waivers entry point will manage the corrected customer fee and clearly say **Customer marketplace fee — NPR 10 per order**. The description will explain that seller commission is separate. The screen provides campaign name, optional description, Nepal start/end times, save draft, publish, pause, resume and end. Start is inclusive; end is exclusive. Stored instants are UTC.

Preserve immutable campaign IDs, revision history, actor/time audits, expected revisions and idempotent request receipts. Every mutation requires a currently active live Super Admin, authenticated-subject/actor matching, origin protection and a successful atomic audit. Ordinary Admin cannot mutate campaigns. The existing optional Admin MFA and current Super Admin enrollment policy are independent of this pricing correction.

Published eligible campaigns are selected deterministically by earliest start, then immutable ID using consistent database/JavaScript ordering. Pausing one campaign may leave another eligible campaign applying; show that fact. Expired campaigns cannot be resumed or published into the past. No negative fee, duplicate relief, stacking, or customer credit can arise.

Legacy seller-commission campaigns and saved outcomes remain clearly identified in a historical section. Corrected checkout never selects them for new orders. Do not silently change their state, claim they were ended, clone them into customer campaigns, or replay an old mutation as a new campaign. Legacy mutation endpoints must refuse new campaign changes after cutover with a clear retirement message; old request receipts remain historical facts and cannot re-enable legacy behavior. A fresh current-state inventory is required before each retained-environment cutover. Any still-published legacy campaign must be disclosed in that exact cutover preview, including the fact that it will no longer affect new orders.

## Fee calculation, quote and placement

Resolve the effective, versioned customer service-fee policy first. Preserve its enable state, standard amount and source version. Its current configured amount is 1,000 paisa. A campaign waives the entire positive charge from that policy once per order. Future changes to the normal fee require the existing controlled publication process; historical fee values always come from recorded order facts. A disabled or zero policy has no positive fee to waive and must not invent a nominal NPR 10 benefit or waiver evidence.

For an enabled NPR 10 charge with an applicable campaign, show:

| Customer fee fact | Amount |
| --- | ---: |
| Standard marketplace fee | NPR 10 |
| Campaign waiver | −NPR 10 |
| Net marketplace fee | NPR 0 |

Commission/retention is calculated separately on its established base and accepted rate. For new valid 12% terms, an otherwise commission-bearing NPR 1,000 item retains NPR 120 commission during a customer-fee campaign. This example does not change any existing allocation, discount, tax or rounding rule.

Apply the customer campaign to any otherwise orderable registered, managed-only or mixed cart that incurs that customer charge. The waiver does not make an ineligible managed product orderable. Multiple sellers/items still receive only one order-level customer-fee waiver.

The server owns campaign selection and financial calculation. The reviewed quote contains policy identity, standard/waived/net integer paisa, and exact campaign/revision attribution where applicable. Client-supplied campaign IDs or amounts confer no entitlement. Reconcile payable total using net charged. Policy, campaign, cart or relevant time changes require a fresh customer review rather than silently changing the accepted amount.

Inside the order transaction, lock/guard the campaign control revision, re-evaluate the winner at the real placement instant, and guard the effective fee policy and accepted seller terms. Cover the no-campaign case as well as activation, pause, edits, overlap and start/end crossings. Order retry/idempotency must not duplicate fee evidence. Write one immutable order-level fee fact and the matching accepted quote, customer policy/terms and order document snapshots atomically.

`orders.buyer_platform_fee_paisa` continues to mean the actual net fee charged. Existing fee-exclusive totals and helpers add that net value exactly once. Do not substitute a gross amount as cash revenue or express the waiver as a merchandise promotion, wallet credit or seller expense.

## Historical data and aftercare

Preserve all existing applications, personal PAN/identity records, approvals, products, terms acceptances, campaigns/revisions/receipts, order lines, payments, refunds and settlements. No recalculation at 12%, historical campaign conversion, accepted-document rewrite, or synthesized acceptance is permitted.

Old service-fee snapshots continue to parse and retain their original charged amount. Old per-line seller-waiver facts retain their original beneficiary, basis points, amounts and saved campaign revision. Absence of a new order-level customer-waiver record never implies a retroactive waiver. New validated fee snapshots distinguish a real campaign from a disabled policy without relaxing old validation.

Cancellation and returns use the original net charge and existing allocation rules. An already waived customer fee cannot be waived a second time or recreated by a cancellation. A fully waived fee has no collected customer-fee amount available for a lawful fee refund. Existing fee-only refund authorization and cumulative caps remain tied to the net amount actually collected, including partial cancellations, returns and concurrent refund attempts.

Cart, checkout, customer/staff order details, saved documents and relevant finance views display recorded standard, waiver and net facts consistently. Existing historical documents keep their recorded amounts. Billing receipts and cash/COD/payment totals reconcile to net actual charges. Reports distinguish foregone customer-fee revenue from seller commission, customer spending and cash refunds. Join/aggregate order-level fee evidence once; joining across several items must not multiply it. Promotional contribution previews retain real seller commission instead of zeroing it because a customer campaign is active.

## Controlled 12% terms and timing

Prepare Registered Seller commission and managed sale-linked retention at 1,200 basis points through ordinary supported Business Settings publication. Keep the settings distinct; matching a local-only initializer's value does not authorize hosted initialization or bypass environment guards. Financial writes require a concrete reviewed action gate.

The existing first Registered Seller commission publication requires at least 15 days between actual publication and effectiveness. Do not backdate or bypass this interval, claim notice started before publication, or silently treat 12% as already effective. Verify notice/delivery and renewed acceptance evidence required by the actual contracts. Existing orders retain their accepted rates; future orders require the current valid displayed-context-bound acceptance.

The owner selected preparing publication ahead of the upgrade on the verified existing release. That preparation remains conditional: the old Registered Seller acceptance UI/API is not bound to the terms displayed on a stale page. The corrected acceptance path or a properly verified commerce/acceptance gate must exist before the scheduled effective instant. If that protection cannot be guaranteed, report the blocker and prepare publication under the private corrected candidate instead; do not silently change or publish dates.

Old managed checkout can use the latest rate without matching the maker's accepted rate. Therefore prepare managed 12% publication/renewal under the private corrected candidate, preserving existing acceptance evidence and requiring supported renewal where needed. Do not publish an effective managed increase on the old release while relying on that old checkout path. Managed live-program gates remain closed until their own readiness conditions are satisfied.

The shared application page must handle each route's genuine effective terms/readiness cleanly. Show available routes with their actual terms and a clear unavailable reason when a required published agreement is missing. Do not invent fallback 12% terms, accept future rates early as current, or hide a missing-term error behind a generic blank page. New managed applicants with personal PAN remain in the supported managed route and do not gain Registered Seller authority.

## Additive implementation and rollout boundaries

Do not edit applied migration 0073 or its existing MariaDB companion as though that upgrades retained data. Plan reviewed additive D1 and MariaDB storage for the new campaign namespace, control/revisions/idempotency and immutable per-order buyer-fee evidence with appropriate identities, foreign keys, reconciliation and update/delete guards. Keep old seller-waiver tables and immutable history readable.

Update fresh-schema generation, migration/release manifests, readiness registries, read-only local preflight, export/import/accounting contracts and native recovery coverage together. Exact SQL/table names, backward-compatible schema discriminants, shared internal abstractions and implementation task boundaries are left to the builder. Repository conventions and the preserved interfaces above govern those choices.

The canonical local database is retained data. Development uses disposable SQLite/native MariaDB fixtures; no automatic seed, reset, migration, restore or empty replacement is allowed. A concrete reviewed backup and additive upgrade need separate approval before changing retained local data. Any staging or production migration similarly requires exact backup/recovery and action gates; design approval is not deployment approval.

Produce a new reviewed candidate and Linux CI artifact, exercise the corrected flow locally, and repeat staging migration/recovery/access/restart/MFA/financial acceptance against that exact artifact. Freshly inventory and preserve any later manual staging work. The earlier staging acceptance cannot certify the newly corrected feature.

Production pre-upgrade source/backup preparation may continue independently. Final isolated additive rehearsal must bind the new corrected artifact and migrations, not the superseded staging candidate. Preserve existing backups until an authenticated complete replacement has recovery coverage and the exact approved cleanup list exists. Latest-only cleanup remains limited to current deployment backups; historical `Desktop/Hatskala-backups` archives are excluded.

Use the separately approved private maintenance enrollment approach when ready: customers remain outside, production data is preserved, and the owner completes production Super Admin MFA enrollment personally before public launch. No staging secret/key/enrollment is copied into production. Report all remaining blockers before activation.

## Required regression and acceptance evidence

- A full NPR 10 customer waiver changes payable by exactly 1,000 paisa once while both valid 12% seller rates remain charged; registered-only, managed-only, mixed and multi-seller fixtures reconcile.
- Multiple drafts/published campaigns, overlap winner, Nepal display/UTC storage, inclusive start/exclusive end, pause/resume/end, no-campaign guards, placement races and stale reviewed quotes are covered.
- Live role/actor/origin enforcement, malformed commands, optimistic conflicts, idempotent replay, retired legacy commands and audit-failure atomic rollback are covered.
- Enabled/disabled/zero fee policies, integer bounds, future controlled policy changes and old/new snapshot parsing are covered without fake disabled-policy waivers.
- Existing seller-waiver history and documents are unchanged; customer fee facts are never inferred for legacy orders. Real immutable financial fixtures verify cancellation, partial returns, fee refunds, receipts, cash/COD totals, settlement, promo preview and aggregation without duplicated fee relief.
- Additive SQLite and MariaDB tests verify immutable evidence, transaction guards, preserved old rows and export/recovery inclusion; no retained data is used to make tests pass.
- Commercial first-publication timing, displayed-context acceptance, stale forms, renewal, managed accepted-rate snapshots, and both personal-PAN application routes retain their real gates.
- Browser acceptance verifies customer standard/waiver/net display and Super Admin campaign controls using disposable or explicitly approved test data. Final Linux, local preflight, staging, restart, access, backup/recovery and production MFA evidence identify the exact candidate and unresolved limits.

The owner has approved this amendment for implementation planning. No commission publication, campaign activation, database deletion/grant, retained migration, maintenance or deployment is performed by approving it.
