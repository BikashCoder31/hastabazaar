# Referrals and shopping-credit wallet

Implemented scope (10 September 2026): cash on delivery plus promotional shopping credit. Deposits, withdrawals, transfers, and cash top-ups are unavailable. No payment provider or paid wallet service is required.

## Offer and customer experience

The 11 September update sets future offers to NPR 50 off a first order with NPR 1,500 in products, and NPR 50 shopping credit for the referrer. The original NPR 100 offer remains preserved on historical orders. A signed-in customer supplies a referral code at checkout. Invitation links store the code in an HTTP-only, SameSite=Lax cookie for 30 days; checkout lets the buyer review or remove it. No authentication method is replaced.

The wallet at `/account/wallet` shows available credit and the latest 100 immutable entries. The separate `/account/referrals` page shows the personal code, copy/share controls, current offer and latest 100 referral orders with progress. Both are linked from customer navigation, overview and footer. Referral progress does not disclose friends' names, email addresses, or order numbers. `/referral-terms` explains the offer. The Super Admin manages future amounts and can pause new offers at `/admin/referrals`; each change is audited. Accepted orders snapshot the offer.

One referral redemption is allowed per account and normalized phone number. Self-referrals and prior non-cancelled purchases are rejected. Cancellation does not reset a redeemed offer. This is basic identity-based abuse protection, not a claim that duplicate real-world identities can be detected perfectly.

## Accounting

All amounts are NPR integer paisa. Each wallet journal entry has an equal opposite platform amount. Entries cannot be updated or deleted. A trigger updates the cached available balance in the same transaction, and a nonnegative database constraint rejects overspending. A customer's checkout locks their wallet before inserting the order. Unique business-event entry ids prevent duplicate rewards, refunds, and cancellation credits.

Product prices and seller commission calculations are unchanged. The order cash total, payment collection amount, shipment COD amount, and documents subtract the referral discount and credit used. Credit covers merchandise only; delivery stays payable in cash. Credit is consumed atomically at checkout, and cancellation restores it atomically exactly once.

Refund `amount_paisa`, item amounts, and liability entries continue to represent the gross approved return value. New refund columns separately snapshot shopping credit to restore and promotional discount to void. **Cash to refund = amount_paisa - wallet_credit_paisa - referral_discount_paisa.** Admin and customer screens display the cash/credit breakdown. The discount has no cash refund. Seller liability remains gross. Partial refunds use cumulative proportional allocation; rounding residue goes to the last merchandise refund. Failed refund attempts keep their allocation reserved for retry. A cross-row guard rejects stale concurrent allocation. Completing the refund restores its credit exactly once.

## Reward release

A single idempotent insert releases a reward only when the order is delivered, COD payment is captured, the full snapshotted wait (at least seven days) has elapsed, the account is active, and no return or unresolved order complaint blocks it. Cancelled/refunded orders do not qualify. Release runs when the referrer opens Refer & earn, the wallet or checkout; this version needs no cron job. Only MariaDB deadlocks in this unique-key-protected insert are retried, for at most three total attempts. Late complaints after a legitimately released reward do not automatically claw back spent credit.

## Database and deployment

`db/schema.ts` and `drizzle/meta/0021_snapshot.json` track the schema. `scripts/generate-wallet-schema.mjs` writes the custom SQLite migration and the MariaDB counterpart with matching triggers. If regenerating the Drizzle migration, run this script afterward to retain the custom guards. The historical MariaDB base schema remains the 0020 snapshot: new installations import it and then the additive wallet migration.

Production: back up application files and the database, place the site in a maintenance window, import `deployment/babal/mariadb-referrals-wallet.sql` into the existing database, then deploy the new standalone build and restart Passenger. The migration only adds new tables, columns, indexes and triggers. It also supplies the checkout inventory-reservation trigger present in SQLite but previously missing from the MariaDB export. Re-import is supported. Never use the empty-database reset script on production.

Application rollback should preserve the additive schema. If wallet-funded orders have been placed, do not roll back to an application that does not understand credit refunds. Keep the site in maintenance and fix forward or restore a coordinated backup before any new business activity.

## Validation

The SQLite integration suite covers first-order pricing, return-window and collection gates, reward replay, wallet spending, negative-balance rejection, cancellation replay, immutable entries, proportional refunds and stale allocation. The standalone MariaDB test uses a disposable localhost database and tests additive/repeated migration, simultaneous spending, concurrent reward release, ledger reconciliation, actual checkout, inventory reservation, cancellation and credit restoration. It never accepts production connection settings.

The offer is funded by Hastabazaar: the updated offer has NPR 100 in combined incentives. Super Admin can monitor accepted obligations and pause or change future offers. No third-party payment fees apply to this implementation; normal hosting/mail costs are unchanged. For the cumulative 11 September release and the required one-time amount migration, follow `referrals-customer-experience.md`.

### Verification recorded on 10 September 2026

- TypeScript: passed.
- Automated suite: 52 tests passed.
- Portable MariaDB 11.4.9: repeatable migration, concurrent credit spending/reward release, actual checkout, stock reservation, cancellation and ledger reconciliation passed.
- Babal standalone build: passed, with app.cjs included.
- Built HTTP checks: wallet, checkout, Super Admin offer controls, public terms, authentication boundaries, CSRF rejection and relative referral redirects passed.
- Browser test using disposable local data: copy invitation, add product, use NPR 20 credit on an NPR 1,180 total, confirm NPR 1,160 COD order, cancel, and observe NPR 20 restored passed.
- Live deployment: pending cPanel sign-in. No production schema or application changes have been made for this release.
