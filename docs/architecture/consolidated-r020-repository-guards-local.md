# R020 — repository permission coherence

Local bounded follow-up, 13 September 2026.

Two direct repository bypasses were reproduced before implementation: a revoked Admin profile could cancel a parcel through operateParcel and prepare a seller payout through prepareSellerPayout. API guards were stronger than the repository's raw role/claimed-role checks.

## Fix

New lib/db/repositories/staff-mutation-guard.ts resolves the active stored staff role and effective permission profile. Malformed profiles fail closed; missing profiles retain the existing approved legacy policy. A claimed role cannot elevate the real actor. It returns exact profile/role/status guards appended inside each mutation transaction.

- parcels.ts: setup and every operation, including courier-cost early return, require order.manage at entry and commit. Existing independent remittance reviewer rules remain.
- payouts.ts: historical accrual, request processing and preparation require payout.prepare; independent approval/rejection require payout.approve; processing/paid/failed operations require payout.mark_paid, matching the API. Stored actual role must agree with the claimed role. Maker-checker and destination/available-balance controls remain.
- fulfillment.ts: legacy Admin fulfillment requires order.manage. Its shared cancellation helper receives the staff guards for the Admin path; customer cancellation ownership behavior is unchanged.

Guards are appended to retain existing mutation-result index checks. A changed profile before batch execution rolls back source, ledger, audit and queued-notification writes. Preparation and payout-request bookkeeping remain their existing separate transactions: a preparation committed while authorized is not retroactively undone if permission changes before subsequent bookkeeping.

## Verification

Focused revoked parcel/payout tests initially failed with Missing expected rejection. Five R020 regression tests now pass, including changes between repository read and commit, legacy cancellation rollback and forged Super Admin role rejection. Returns-complaints, delivery-rates and exception-work suites passed 61 tests. A fresh native MariaDB verifier run passed 9 groups including revocation immediately before actual parcel batch commit (no version/courier cost change) and denied payout preparation. Output: outputs/consolidated-local-20260913-042936/exception-native-current.json. Touched-file lint passed. No existing business database or sender was used.

This is bounded coverage of the requested repositories, not a claim that every marketplace mutation has identical guards. Seller/customer paths retain their own authorization model.

## Coordinated R004 follow-up

Customer return/complaint notifications resolve order numbers through case/order/customer ownership and open the existing aftercare section. Staff inbox/read access suppresses closed or reassigned case work, matching sender source rules. A synthetic regression covers ownership projection, assignment changes, closed staff source suppression and retained customer outcome visibility. Only listNotifications was edited in operations.ts; the notifications agent owns governance producer additions.

Empty-profile follow-up: stored empty-string profiles were reproduced as authorization bypasses (both regressions failed before the fix). staff-mutation-guard and exception-work now parse any non-null stored profile. Empty/corrupt profiles reject parcel mutation and exception actor, owner selection, and read access; missing null profiles alone retain legacy behavior. Both focused regressions and touched lint passed.
