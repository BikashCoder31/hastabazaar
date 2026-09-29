# Account dashboard role links — 2026-09-29

User request: after switching from Seller to Customer dashboard, seller-only accounts should see the return-to-seller option without unrelated rider material.

## Reproduction and fix

Route `/seller` -> Switch to customer dashboard -> `/account`, fictional local seller. Before: both “Rider dashboard / apply” and “Assigned deliveries” appeared despite no rider profile.

The layout now resolves rider participation using the authenticated customer's database user ID. A seller without a rider profile sees no rider shortcuts. Approved rider profiles retain the rider dashboard and assigned deliveries; other existing rider profiles retain application-status access. Customer-only accounts without a profile retain application discovery. Normal shopping navigation is unchanged.

No permissions, roles, profiles, or financial records are modified. The client navigation receives only the approved-rider boolean, not private rider profile data.

## Verification

- Eight rendered layout/navigation regression scenarios went RED before the fix and GREEN afterward: seller-only, approved/pending/rejected dual-role accounts, ordinary customer, approved/pending rider customers, and default navigation visibility.
- Local browser verified seller -> customer -> seller round trip with zero rider links for the seller; pending-application customer status link; approved rider dashboard and assigned deliveries.
- Independent specification review: PASS. Independent quality/security review: PASS.
- All 139 application/migration table hashes/counts unchanged; only Cloudflare runtime metadata differed among 140 checked tables.
- All 37 unrelated dirty files unchanged. The existing responsive class modification in account-navigation.tsx is preserved and excluded from the task commit.

Evidence: `C:/Users/abinash/Desktop/Hatskala/account-role-links-20260929/` contains browser results, screenshots, and database/file hashes. Regression logs are in `C:/Users/abinash/Desktop/Hatskala/account-role-navigation-20260929/`.
Final checks: 8/8 focused tests, TypeScript, scoped lint, and diff checks passed.
