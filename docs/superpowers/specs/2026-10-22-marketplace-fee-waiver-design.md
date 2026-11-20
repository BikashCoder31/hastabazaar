# Marketplace fee waiver campaigns

Status: written specification approved on 2026-10-22, including multiple campaigns. Implementation plan subsequently approved for subagents with review after every task.

## Intended outcome

Super Admin can create and control campaigns that automatically waive the marketplace fee for every eligible seller during a scheduled period. The normal marketplace fee remains visible (currently 10%). Sellers see the standard fee, the campaign waiver, and the net fee of zero. Admin cannot create, change, or activate these campaigns.

Multiple campaigns may exist and overlap. A fee can only be waived once: overlapping campaigns never create a negative fee or a seller credit beyond the standard fee. No customer voucher entry is necessary.

## Campaign controls

A new Marketplace fee waivers section provides campaign name, optional description, start and end date/time, and draft, scheduled/active, paused, and ended states. Dates are displayed in Nepal time and stored as UTC instants. Start is inclusive and end exclusive. Each campaign has an immutable ID and versioned changes, plus actor and time audit records.

Super Admin can create several campaigns, schedule activation, pause, resume within the scheduled window, or end a campaign early. Overlaps are allowed. A deterministic choice (earliest start, then immutable ID) attributes each eligible order line to exactly one active campaign. Pausing one campaign does not stop another eligible campaign; the management screen explains this and shows all currently active campaigns. Published campaign history is retained rather than deleted.

Changes require live server-side Super Admin authorization, request-origin protection, input validation, and an atomic audit record. Client visibility alone never authorizes a mutation. Existing MFA policy remains applicable to the acting account.

## Financial treatment and scope

Use the existing accepted seller commission terms and rate version. Do not change the commission setting or substitute zero for its standard rate. For an eligible new order line, persist the standard basis points, standard fee in paisa, waiver in paisa equal to that standard fee, net fee of zero, and the applied campaign ID/version. Existing commission amounts consumed by payouts and accounting must represent the net fee; the separate snapshot preserves gross fee and waiver evidence.

Eligibility covers every seller charged the marketplace commission. Company-store/Managed Maker retention and other charges are separate contractual amounts and are not marketplace commission. Delivery, buyer service fees, payment fees, tax, customer discounts, and product prices are unchanged. Existing seller agreement acceptance requirements remain enforced.

Campaign selection and order creation must be consistent under concurrent pause, activation, or revision. Validate the campaign revision and relevant eligibility in the order transaction, including the no-campaign case. A changed quote is retried or rejected for review rather than silently writing an inconsistent order. Order retries must not duplicate waiver evidence.

Customer promotions remain independent. Any promotion eligibility or margin calculation that depends on platform commission must use the net fee after waiver, so waived revenue cannot fund a discount twice. Existing customer discount terms on placed orders stay unchanged.

## History, reporting, and aftercare

Existing orders are not repriced. Campaign changes affect only future committed orders. Historical rows without waiver evidence retain their original recorded commission and are shown as having no waiver.

Seller earnings, order details, Super Admin commission reporting, accounting exports, and settlement calculations use the same recorded net fee. Relevant fee views display “Standard marketplace fee 10%”, the campaign waiver amount, and “Net marketplace fee 0%” when the full waiver applies; use the actual recorded standard rate when it differs from 10%.

Cancellations, partial returns, refunds, and payout reversals use the original order-line snapshot. They reverse only amounts actually charged or accrued and cannot recreate a waived commission or apply a later campaign retroactively. Aggregate reports distinguish gross fees, waived fees, and net revenue without counting the waiver as customer spending or cash paid out.

## Implementation boundaries and data preservation

Follow existing versioned campaign/repository and commission patterns, while keeping customer promo codes and fee campaigns distinct. Add dedicated campaign storage and order-line waiver evidence through reviewed additive migrations. No destructive schema changes, resets, or historical rewrites.

The canonical local database must not be migrated, seeded, restored, or reset during development. Exercise migrations and financial flows in disposable SQLite and native MariaDB fixtures. Any hosted migration requires a reviewed backup, isolated recovery verification, and the existing staging release controls. The user subsequently authorized production upload after local, staging, recovery and acceptance checks pass; report and resolve remaining blockers first.

## Acceptance checks

- Multiple scheduled and overlapping campaigns work; a single order line gets exactly one full waiver and deterministic attribution.
- Start/end boundaries, pause/resume, concurrent edits, and stale or replayed requests behave consistently.
- Non-Super Admin actors and cross-origin mutations are rejected; audit failures roll back changes.
- Standard rate stays visible and unchanged; existing orders and their refunds retain recorded terms.
- Seller settlement, partial returns, cancellations, refunds, promo margins, and accounting reconcile with zero net fee, including mixed marketplace/Managed Maker orders and integer rounding.
- Real UI tests cover campaign creation and controls, overlap messaging, visible gross/waived/net amounts, and permission restrictions.
- Linux CI, native database checks, local read-only preflight, and staging acceptance run against the final candidate. Any unfinished recovery or access gate remains a reported deployment blocker.

## Design choices

Automatic global campaigns implement the requested scope without forcing sellers to redeem a code. A global rate toggle would lose the visible standard fee and per-order campaign evidence. Seller-specific vouchers would add assignment/redemption flows the user did not request. Multiple campaigns are supported without stacking because a complete waiver already reduces the fee to zero.
