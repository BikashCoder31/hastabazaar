# Production checkout hotfix: MariaDB `key` identifier

Date recorded: 20 September 2026 (Asia/Kathmandu)

## Incident

After the 9% commission release, submitting a cash-on-delivery checkout returned HTTP 500 with the customer-facing message:

> The order could not be placed. No payment was collected.

The checkout failed before the order transaction began. No order, payment, inventory adjustment, historical price snapshot, or commission snapshot was created by the failed attempt.

## Confirmed cause

`getMarketplaceCommissionBps` used this query:

```sql
SELECT value FROM marketplace_settings WHERE key = ? LIMIT 1
```

MariaDB 11.4.9 reproduced error 1064 because the unqualified `key` identifier is parsed as reserved SQL syntax. This was not a missing migration or an address-validation problem.

## Production action

The active compiled module under `/home2/hastabaz/hastabazaar-app/dist/server/_next/static/marketplace-settings-DQgH5res.js` was manually hot-fixed from:

```sql
WHERE key = ?
```

to:

```sql
WHERE marketplace_settings.key = ?
```

The user confirmed that checkout worked after the edit. The Node application was restarted through cPanel/Passenger. No database migration or historical-record update was required.

## Permanent source correction

`lib/db/repositories/marketplace-settings.ts` now uses the qualified identifier. `tests/marketplace-commission.test.ts` asserts that the checkout commission lookup contains `WHERE marketplace_settings.key = ?` and does not regress to `WHERE key = ?`.

Future builds and deployments must include this source correction. Editing only the compiled production asset is temporary because a later release replaces hashed server modules.

## Safety and follow-up

- Do not alter existing `order_items.unit_price_paisa`, `commission_bps`, `commission_paisa`, or policy/agreement snapshots.
- Do not apply another migration for this issue; it is an application-query correction.
- Retain the production file backup until a normal tested release containing the permanent correction is deployed and accepted.
- Before that release, run the commission test, full regression suite, production build, and the documented checkout smoke test without creating an unintended real order.
