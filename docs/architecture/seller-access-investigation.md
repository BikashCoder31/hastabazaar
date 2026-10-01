Update: a fresh-application identity-link defect has now been reproduced and fixed locally. See approved-seller-link-fix.md. The earlier findings below are retained as investigation history.

# Seller-access investigation — 11 September 2026

## Live evidence

An isolated Chrome password sign-in was completed manually by the user. The sanitized trace is in `outputs/live-seller-routing-investigation.json`; no passwords, cookies or authentication codes were recorded.

Successful password POST redirected to `/seller`. The seller page then redirected to `/seller-access-denied`, displaying **Approved seller access required**. A second direct document request to `/seller` produced the same result. This run did not reproduce the earlier `/staff-access-denied` screen. Anonymous live requests also correctly preserve `/seller` as the Login return destination.

The tested real account is not recognized as an active, linked, approved seller. This evidence alone does not distinguish a pending/rejected/missing application, a missing seller role, or an identity-link mismatch. No live roles, application decisions, passwords or business records were changed. Its application must be inspected by an authorized Admin before choosing a data correction; do not grant staff access as a workaround.

## Local change and verification

The staff-denial page now explains the separate staff and seller workspaces and links directly to the seller dashboard/application without requiring logout. This is a recovery improvement, not a claimed fix for the real account's approval state. Permission checks are unchanged.

The production build, TypeScript and 71 automated tests passed. `scripts/verify-role-sign-in.mjs` now covers password/OTP routing, hydrated storefront-to-seller navigation, staff denial and seller recovery, and desktop/mobile overflow checks. The disposable test `outputs/test-seller-approval.mjs` runs the actual Admin review/approval repository actions: submitted seller denied, approval assigns exactly one seller role, and the same session can then access the seller dashboard. No test orders or emails were submitted on production.

## Release

`outputs/hastabazaar-seller-access-recovery-2026-09-11.zip` is cumulative with the previously deployed release. This recovery update is local only. It needs no new SQL migration. The four migrations recorded in `docs/deployment-2026-09-11.md` have already been applied live; do not reimport a base schema. Before any later authorized deployment, back up the current app/data and preserve cPanel environment, media, dependency setup and existing account access.

Remaining: inspect the affected account's seller application status and account link through an authorized Admin/database session. The controlled test results do not establish the real account's approval status. Browser-control tooling remained unavailable after the PC restart; live read-only testing used a separate Chrome window with user-entered sign-in.

