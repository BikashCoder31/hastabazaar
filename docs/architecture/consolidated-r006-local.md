# R006 — positive seller earnings payout balance

Local implementation only, 13 September 2026. Supersedes the minimum-balance statements in seller-earnings-payouts.md and seller-workspace.md for current payout operations.

Seller earnings have no Rs. 1,000 payout minimum. The eligible queue, seller request, preparation and seller/Admin copy require a positive currently available, unallocated balance. Existing delivery holds, reserve/refund ledger arithmetic, destination/approved-seller requirements at preparation, allocation, independent Super Admin approval and payment-reference controls remain in place. Customer wallet withdrawals remain disabled; wallet code was not changed.

The historical phaseOneMarketplacePolicy payout minimum stays intact for historical policy/snapshot compatibility; current operational checks no longer consult that field. No migration or historical ledger/order/payout rewrites are needed.

## Files

- lib/db/repositories/payouts.ts: queue SUM > 0; request and preparation reject <= 0.
- lib/seller/presentation.ts and components/seller/payout-request-form.tsx: remove the configurable minimum presentation argument, retain open-request blocking.
- app/seller/finance/page.tsx and app/admin/payouts/page.tsx: explain positive available-balance eligibility.
- tests/returns-complaints.test.ts: synthetic database regressions for one paisa, Rs. 999.99, zero/negative, future/null release, allocated entries, duplicate open requests, missing/blank destination and unapproved seller.
- tests/seller-presentation.test.ts: positive/zero/negative and outstanding-request UI eligibility.

## Verification

The initial R006 regression failed because the queue excluded one paisa (false !== true), before production edits. After implementation, tsx --test tests/returns-complaints.test.ts tests/seller-presentation.test.ts passed 45/45. This includes existing immutable-ledger, payout lifecycle, independent approval and payout-request preparation tests. Targeted oxlint on all seven changed source/test files exited 0.

Tests use fresh in-memory SQLite databases and existing synthetic fixtures; no production database, external message or deployment was used. MariaDB execution and rendered-browser inspection were not performed for this bounded change. Full cumulative type/build validation belongs to the parent integration pass.
