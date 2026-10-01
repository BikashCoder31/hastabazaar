# Production deployment: product controls and delivery maps

Deployed to https://hastabazaar.com on 2026-09-11 with the user’s explicit authorization. Hosting remains Babal.Host; cPanel shows production started on Node.js 22.23.2. Application root: /home2/hastabaz/hastabazaar-app. Startup: app.cjs.

## Release and backup
- Cumulative release: outputs/hastabazaar-delivery-maps-2026-09-11.zip
- SHA256: 9C7252A09DA937C2A7608D09F65284833C1C7EDA8E40DC08EE29F13B16DFB30C
- 3216 entries checked against the tested standalone build; no private fixtures, environment secrets or reset/base schema included.
- Fresh completed full cPanel backup: /home2/hastabaz/backup-9.11.2026_15-20-12_hastabaz.tar.gz (240.86 MB).
- Previous release and backups retained. ZIP upload completed; extraction into the existing application root reported app.cjs/server.js and no extraction errors. App was stopped for extraction and started afterward.

## Database
Applied product_deletions, address_locations and delivery_assignments tables, plus clear_closed_delivery_location trigger. The successful import reported six queries (including USE); CREATE statements returned success and the trigger was independently visible in the marketplace Triggers list.

phpMyAdmin initially retained information_schema as its context and rejected the first imports. No application switch occurred during those attempts. The successful import explicitly qualified the marketplace database, including foreign-key and trigger targets, and omitted information_schema verification SELECTs from the import. The exact successful SQL is outputs/deploy-product-delivery-migrations.sql. The trigger-not-found note on DROP IF EXISTS was expected before its first creation. Do not import a base/reset schema.

Existing orders, users, roles, authentication settings, media, wallet entries and order-policy snapshots were not reset. No live product was archived/deleted/unpublished and no customer order was dispatched or marked delivered for testing.

## Available functionality
- Sellers can archive published products and logically delete archived products while preserving order history.
- Super Admin can unpublish approved products from Admin > Products > Published.
- Optional map pins and Use my location at checkout and saved addresses, with manual address fallback.
- Admin > Orders > order > Delivery assignment supports an existing own-rider account or courier company/reference/link.
- Riders use /rider or Account > Assigned deliveries. Explicit sharing works for dispatched assigned orders while the browser/device remains active.
- Protected customer orders show fresh rider positions or the courier tracking link. Stale positions are hidden and order closure clears stored position.
- Includes the previously implemented public pages, password reset, role routing, seller application fixes, reviews, order updates and Rs. 50 referral offer.

## Verification evidence
Local before packaging: 82 automated tests, TypeScript, Babal build, disposable MariaDB integration and desktop/mobile functional browser checks passed. These included product controls, map permission/fallback, pins, rider Start/Stop, assignment isolation, customer access, courier handoff and password/OTP routing.

Production after restart: /health returned 200 and marketplaceReady=true. New privacy map-pin content is present. Anonymous /rider redirects to login; anonymous delivery lookup returns 404. All 22 read-only browser checks passed at widths 1440 and 390, with no browser errors or horizontal overflow. Pages checked: login, forgot-password, about, contact, shipping, returns, privacy, terms, referral-terms, track and shop. Results: outputs/live-verification-2026-09-11/results.json.

Authenticated functional flows were tested locally, not repeated against real production orders/accounts. Real device GPS accuracy, background tracking, external inbox delivery and courier APIs were not tested live. Courier assignment is manual; automatic courier booking, status webhooks and courier GPS require the chosen company’s integration. Riders must keep the page/device active for location sharing. The existing optional email retry cron has not been configured by this deployment.

## Rollback
Stop Node and restore the prior application release from the retained release/backup while preserving current environment/media. Start app.cjs and check health. Leave the additive tables and trigger in place; do not restore an old full database over newer customer activity. Any database restoration requires reconciling activity since the backup.
