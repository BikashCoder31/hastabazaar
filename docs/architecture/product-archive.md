# Archive published products

Seller dashboard > Products & stock now shows Archive product for published listings. Confirmation explains removal from the storefront and retention of orders, reviews and records. Only the owning, approved seller can perform this action. Archived products remain in the seller list; this update does not add restoration or permanent deletion.

POST /api/seller/products/[id]/archive requires seller authentication and trusted mutation origin. A conditional, transactional update restricts ownership and published status and records product.archived in the audit log. Repeated requests, wrong owners and other statuses cannot archive. No product rows, media, reviews, stock quantities or order snapshots are deleted. Existing cart/checkout checks reject non-published products. Existing orders continue through fulfillment and returns.

Validation: 76 automated tests, TypeScript and production build passed. A database regression verifies ownership, state restrictions, public detail removal, audit recording and unchanged order snapshot. Local MariaDB and desktop/mobile browser verification covers confirmation, cancellation, successful archive, archived status, hidden archive action, and cross-site rejection. Password/OTP role routing regression also passes. Scripts: scripts/verify-product-archive.mjs with outputs/resume-archive-check.mjs, disposable localhost fixture only.

Deployment: cumulative outputs/hastabazaar-product-archive-2026-09-11.zip, Babal.Host Node 22, existing /home2/hastabaz/hastabazaar-app, startup app.cjs. Backup first, stop the app, extract ZIP into app root preserving environment, media and dependency symlink, restart, check /health and seller products. No new migration. Never import base/reset schema or blindly re-run already applied migrations. Archive only a deliberately selected test listing during live acceptance; do not archive customer products for verification.

Status: locally implemented and tested; not deployed. Live database products unchanged.
