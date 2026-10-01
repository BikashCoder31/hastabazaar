# R014 business activity and R004 notification navigation — local bounded work

13 September 2026. No production access, email sender invocation, deployment, or historical audit backfill.

## Implemented

- New /admin/activity page and business-activity repository: Super Admin-only at page and repository boundaries; latest 100 matching audit records; bound exact action/actor/type and inclusive Nepal calendar-date filters; actor/time/action/record and safe allowlisted internal links. Raw before/after JSON and free-text notes are excluded from the view.
- Current queue cards are explicitly current record states, not completed approvals or staff-performance totals. admin-workspace accepts effective permissions and suppresses unauthorized count subqueries. The navigation/main-dashboard integration is owned by the permissions agent.
- Parcel setup, ordinary parcel operations and courier-cost early-return branch append safe audit events inside their existing transaction, with unique request references. Previous parcel events remain historical source evidence, not fabricated audits.
- Delivery-rate saves append an audit in the existing transaction, with actor/time/reason and previous/new immutable configuration version references. No credential or destination evidence is added.
- Existing customer/seller notifications query only the recipient's in-app workspace audience. NotificationList maps allowlisted related record types and safe IDs to internal destinations; links never invoke business mutations. Customer order notifications now project the order number through an ownership-constrained lookup and open /orders/[orderNumber]; a missing verified number falls back to the authorized account order list. Seller application customer links open /sell, which does not yet provide a dedicated application-status screen.
- New staff /admin/notifications page and recipient-bound read endpoint enforce current effective permission, including stored required_permission where present and fail-closed unknown permission values. Legacy rows infer permission by known record type. The staff-specific endpoint uses account.self.manage as the universal staff entry guard and then exact row authorization.

## Files

New: lib/db/repositories/business-activity.ts; app/admin/activity/page.tsx; lib/operations/notification-links.ts; app/admin/notifications/page.tsx; app/api/admin/notifications/[id]/read/route.ts; tests/business-activity.test.ts.
Modified: lib/db/repositories/admin-workspace.ts; lib/db/repositories/operations.ts notification read helper; components/account/notification-list.tsx; app/account/notifications/page.tsx; app/seller/notifications/page.tsx; lib/operations/parcels.ts; lib/db/repositories/delivery-rates.ts; tests/returns-complaints.test.ts; tests/delivery-rates.test.ts.

Staff notification required_permission column depends on the permissions agent's additive 0033 business-notification migration. Other notification events/sending remain separately owned by that agent.

## Verification

Initial helper tests failed on absent new module; focused parcel audit regression failed with no courier-cost audit (0 != 1); focused rate audit regression failed with no rate audit (0 != 1). Final tsx tests across business-activity, returns-complaints and delivery-rates passed 55/55 using fresh synthetic in-memory SQLite. Covers safe navigation, SA-only reads, date/SQL injection boundaries, private snapshot exclusion, recipient/audience/channel separation, permission revocation, parcel exactly-once/stale failure behavior, and rate audit rollback. Targeted oxlint passed on touched files. Browser rendering and native MariaDB audit execution were not performed in this bounded task; parent integration owns cumulative validation.

## Remaining scope

This is not exhaustive R014 completion. Audit coverage is limited to events the repositories actually record; rejected attempts are not universally audited; per-person explicit recorded-step counts and Admin own permitted history are now implemented in the follow-up described by consolidated-r014-progress-local.md; full business outcome aggregation remains outside this bounded matrix. Existing arbitrary audit action text is displayed as recorded, without interpreting it as final financial settlement. Generic governance/custom subsystems may need more precise subjects and destinations. R004 comprehensive event production and delivery are separate work; this task adds recipient-safe views/navigation, not a second sender. No old audit records or outcomes were invented.
