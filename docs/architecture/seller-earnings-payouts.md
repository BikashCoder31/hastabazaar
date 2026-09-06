# Seller earnings and payouts

## Ledger accrual

When Admin confirms delivery, Hastabazaar appends seller-ledger entries from the commercial values already snapshotted on each order item:

- `sale` credits the item line total;
- `commission` debits the snapshotted 12% marketplace commission;
- eligible new sellers receive a 5% `reserve_hold` debit and a matching future `reserve_release` credit;
- seller-liable paid refunds remain separate negative `refund` entries.

Sale, commission, and reserve entries use the delivered timestamp. Sale, commission, and reserve hold become available after the configured seven-day delivery hold; reserve release becomes available after 30 days. A partial unique index on order item and controlled ledger type makes delivery retries exactly once.

An authenticated Admin action can accrue missing entries for orders delivered before this feature existed. The action uses the same immutable calculations, is idempotent, and writes an audit record. It is not a schema migration or silent request-time backfill.

## Seller finance view

An approved seller can view only their own:

- available and pending balances;
- gross delivered sales, commission, and seller-liable refunds;
- immutable ledger history with order/product context;
- payout status, amount, date, and confirmed provider reference.

Payout destination details are masked in interfaces. Sellers cannot change a verified destination through the finance page.

## Maker-checker payout workflow

1. A seller can submit one idempotent payout request after their available balance reaches the configured minimum. An Admin may also start from the eligible-seller queue.
2. An Admin reviews a seller request and prepares a payout from every currently available, unallocated ledger entry, or rejects the request with a recorded reason.
3. Preparation requires a stored payout destination and the configured minimum balance of NPR 1,000.
4. The destination, ledger composition, period, amount, preparer, and operational note are snapshotted.
5. A different Super Admin approves or rejects the prepared payout. Database and application checks prevent self-approval.
6. Rejection releases the associated ledger entries without deleting their historical association.
7. An approved payout moves to processing. A failed payout can be retried through processing.
8. A processing payout can be marked paid only with a verified provider or bank reference. Payment appends one exactly-once negative `payout` ledger entry.

Every transition appends a `payout_events` record and an `audit_logs` record. Creation and transition request IDs are unique so client retries do not duplicate money movement.

## Controlled-launch boundaries

- No bank, wallet, or carrier payout API is assumed. The recorded provider reference represents an off-system payment that an authorized operator verified.
- Seller payout-destination ownership verification and change approval still require a production operational workflow.
- Carrier reconciliation and claim records are available in Operations. Automated COD-remittance imports, bank-file export, reversal handling, and withholding/tax statements remain provider/accounting integration work.
- Only real production Super Admin identities may approve or record payout completion.
