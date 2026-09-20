# Verified purchase reviews, photos and seller replies

The existing delivered-purchase review flow now includes customer photos and moderated seller replies. No paid review service is used.

## Customer experience

Signed-in customers open a purchased product page after delivery and submit a 1–5 star review. The server verifies the order-item ID, product and customer ownership. Only one review per delivered order item is accepted. Customers can attach up to three JPG, PNG or WebP images of at most 5 MB each. The entire multipart request is bounded at 16 MB even without Content-Length. File types and signatures are checked; SVG and other document types are rejected. File names are not exposed or used as storage paths.

Review text and photos remain pending until Admin approves the review. Approved reviews show a verified-purchase badge, clickable photos and an approved seller reply, if available. Signed-in customers see whether their review is awaiting moderation or already published. All star ratings use the same moderation workflow; negative reviews must not be rejected merely for being negative.

Photo uploads reuse the existing private media storage. Access is checked for every request, with no-store and nosniff headers. Before publication only the customer and active Admin/Super Admin accounts can view the photo. Hiding a review or unpublishing its product blocks anonymous photo access immediately. Already-downloaded copies cannot be revoked. The service validates image format signatures but does not transcode images or strip metadata; the upload UI asks customers to avoid personal details and location metadata.

## Seller and Admin experience

Seller → Customer reviews lists published reviews for that seller’s products. Sellers can submit or revise one response per review. They cannot change the customer’s text, stars or photos. Each edit creates a retained revision and requires fresh moderation. The old public reply is hidden while the new revision awaits approval. A stale form or moderation decision cannot silently overwrite a newer revision.

Admin → Product reviews shows photos alongside the customer review and offers separate publish/reject/hide controls for the latest seller reply. Seller identity is verified on the server. Submission and moderation decisions are recorded in audit logs, with reply revisions retained in the database.

## Babal.Host deployment

1. Back up the live application, MariaDB database and private media. Keep all environment variables, Super Admin settings and existing user data.
2. If the preceding order-email release was not deployed, first import `deployment/babal/mariadb-order-updates.sql` into the existing database. The wallet migration from the earlier release must already be installed.
3. Import `deployment/babal/mariadb-review-photos-replies.sql` into the same database. It adds two tables and preserves all existing records; repeat imports are safe. Do not import the full base schema over production.
4. Extract the new standalone ZIP into `/home2/hastabaz/hastabazaar-app`. Preserve the existing `private-media` directory (or the configured `MEDIA_ROOT`) when replacing code. Never use a deployment option that deletes existing media. Restart the Node application using `app.cjs`.
5. Verify health, password/Google login and Super Admin access. Use an authorized delivered test purchase to upload a review/photo. Confirm it is private before moderation, public after approval, and inaccessible anonymously after hiding. Submit a reply from the owning seller, approve it as Admin, and confirm it appears beneath the customer review. Check mobile layout.

The new application ZIP also includes the preceding order-email and tracking changes. Their optional cron setup is documented in `order-updates.md`. Production has not been changed or tested by this local feature work.
