# Consolidated delivery revision deployed — 14 September 2026

The owner explicitly authorized production deployment and then explicitly confirmed the final distinct-store delivery rule: the first store uses the destination base fee and each additional store adds 50% of that base. At a Rs. 150 base, one/two/three/four stores are Rs. 150/Rs. 225/Rs. 300/Rs. 375. Eligible whole-store cancellation recalculates against remaining stores. Historical order policy snapshots remain authoritative.

## Backup and maintenance

- cPanel full-account backup completed and appeared in the available-download list before application or database changes: `/home2/hastabaz/backup-9.14.2026_00-43-20_hastabaz.tar.gz` (cPanel displayed 260.66 MB).
- The backup covers the application, MariaDB account data, private media and hosting configuration. Earlier backups and release archives remain present.
- The configured Node application was stopped through cPanel before production DDL or application extraction. No second Node process was started.

## Database upgrade

Read-only production inspection found 67 of 92 required tables and 12 of 38 required triggers before the upgrade. This placed the pending boundary at migration 9; the empty-database-only base schema and already-installed migrations 1–8 were not run.

The following additive MariaDB files were applied in order through phpMyAdmin, stopping on errors:

1. `mariadb-identity-purchase-security.sql`
2. `mariadb-parcel-operations.sql`
3. `mariadb-product-identity-taxonomy.sql`
4. `mariadb-staff-permissions.sql`
5. `mariadb-delivery-rates-costs.sql`
6. `mariadb-business-notifications.sql`
7. `mariadb-exception-work.sql`
8. `mariadb-guest-business-notifications.sql`
9. `mariadb-gift-cards.sql`
10. `mariadb-seller-registration.sql`
11. `mariadb-verified-riders.sql`
12. `mariadb-partial-cancellation.sql`

Post-migration read-only checks passed 92/92 manifest-required tables, 38/38 required triggers and 4/4 required named integrity constraints. No base/reset schema, development seed or destructive rollback was used.

## Application release

- Installed `outputs/hastabazaar-consolidated-delivery-revision-2026-09-14.zip` into `/home2/hastabaz/hastabazaar-app` with startup `app.cjs` unchanged.
- Approved SHA-256: `5b908944bc289a20be2704206e77a7c7615a6c76ef1ca9b87d7b053017e4ad3a`.
- cPanel extraction listed all 3,425 archive entries and no explicit failure line.
- A fresh server-side download of the uploaded archive was streamed, measured at 24,744,984 bytes and matched the approved SHA-256 exactly; the temporary local verification download was deleted.
- The release contains no `.env`, uploads or private-media payload. Existing private media, logs and cPanel environment configuration were retained. The application started successfully on Node.js 22.23.2.

## Production checks

- `https://hastabazaar.com/health` returned HTTP 200 with `status: ok` and `marketplaceReady: true`.
- Anonymous Chrome checks passed `/`, `/shop`, `/login`, `/contact` and `/seller` at 1440, 390 and 320 px. All 15 navigations returned HTTP 200; `/seller` redirected to `/login`; there were no horizontal-overflow findings, console errors or page errors.
- The existing `stderr.log` size/timestamp did not change during startup inspection.

No cron was enabled, no real email/message was sent, and no test order, wallet, payout, rider, seller, cancellation or other business record was created or changed for acceptance.

## Pending acceptance and rollback boundary

Authenticated owner/staff/customer/seller/rider workflows, protected evidence/media uploads, designated real-inbox delivery and production financial actions remain pending separately authorized acceptance. Local synthetic coverage is documented in `docs/architecture/consolidated-local-completion-2026-09-14.md` and is not represented as production inbox or real-account evidence.

If a production issue appears, retain the new additive schema and financial/audit history and prefer an additive forward fix. Do not restore the database after new writes without reconciling intervening orders, balances, evidence and notifications. The pre-deployment full-account backup and earlier release archives remain the recovery baseline.
