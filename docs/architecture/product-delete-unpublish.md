# Product deletion and Super Admin unpublishing

## Customer-facing and seller behavior
Seller > Products & stock: published products have Archive product. Archived products have Delete product. Both require confirmation. Delete removes the listing from the seller list; it retains the archived product, media, reviews and existing order/return records. The dialog explicitly explains this and that deletion cannot be undone from the dashboard. This is logical deletion, not physical destruction. Archived/deleted products cannot be bought through existing cart and checkout validation.

Admin > Products > Published products > Review listing: only Super Admin sees Unpublish product. A review reason and confirmation are required. The listing returns to under_review, leaves the storefront, and must be approved and published again before sale. Ordinary Admin receives 403 for direct unpublish API requests. The repository independently checks an active Super Admin role. Existing orders remain unchanged; the review event and audit log record the decision.

## Implementation
Additive product_deletions table stores a deletion marker with actor/time/request ID. No product rows are deleted. Seller lists exclude marked records. POST /api/seller/products/[id]/delete uses authenticated seller ownership and archived-state checks within an atomic batch with an audit record. Unpublish extends the existing review workflow (published -> under_review), with server-side role restriction and published timestamp clearing.

## Local verification
78 automated tests pass, including archive/delete ownership and state restrictions, unchanged order snapshots, hidden seller listings, audit recording, active Super Admin restriction and public-detail removal. TypeScript and Babal production build pass. Local MariaDB/browser checks confirm archive/delete confirmation and cancellation, removal from seller list, Published products navigation, ordinary Admin denial, Super Admin unpublish, and password/OTP role-routing regression. scripts/verify-product-controls.mjs runs with outputs/resume-product-controls-check.mjs using the disposable local fixture only. The additive migration was exercised against local MariaDB.

## Deployment instructions
Cumulative archive: outputs/hastabazaar-product-controls-2026-09-11.zip.
NOT DEPLOYED. No live products or database records changed by this task.

1. On Babal.Host, take a current full account/database backup.
2. Apply deployment/babal/mariadb-product-deletions.sql to the existing hastabaz_marketplace database BEFORE switching files. This repeatable CREATE TABLE migration retains all existing data.
3. Stop the existing Node 22 application, extract the cumulative ZIP into /home2/hastabaz/hastabazaar-app, preserve environment, uploaded media and the dependency symlink, and start with app.cjs.
4. Verify /health and existing sign-in. Check seller Products & stock and Admin Products > Published products. Only use a deliberately selected test listing for live archive/delete/unpublish acceptance.
5. Rollback: restore the previous application files if needed. Leave the additive table in place; do not drop it or reset data.

Do not import base/reset schema. Prior migrations in the ZIP are cumulative references and must not be blindly re-run if already applied. No email, payment, authentication provider or hosting changes are needed.
