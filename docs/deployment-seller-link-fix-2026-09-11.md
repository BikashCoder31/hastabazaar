# Seller identity-link fix deployed — 11 September 2026

Owner-authorized deployment completed on Babal.Host. Installed `outputs/hastabazaar-approved-seller-link-fix-2026-09-11.zip` (SHA256 `E20433E19064B55D94F543A51E830D36D1CEB451673DA40DE4FC307B955D7E31`) into `/home2/hastabaz/hastabazaar-app`.

A fresh cPanel full-account backup was completed and listed as available before the app switch: `/home2/hastabaz/backup-9.11.2026_10-34-07_hastabaz.tar.gz`. Retain this backup and the previous release. No new SQL migration was run. The existing environment, dependency symlink and media were retained; application files were extracted in place without reported errors. The app was stopped briefly for extraction and started successfully in production on Node.js 22.23.2, with startup `app.cjs` unchanged.

Live health returned HTTP 200 with marketplaceReady true. Login and Contact returned HTTP 200. The staff-access page displays the new Open seller dashboard link, confirming the new release is being served. Anonymous `/seller` correctly redirects to Login with `/seller` preserved as the destination.

The local release passed 75 tests, TypeScript, build and fresh-application approval/password/OTP regressions before deployment. Those local tests are not a substitute for signing in with the affected real approved seller. That live account verification remains pending; no credentials were reset and no staff/seller approval was granted manually during deployment.

The session-link repair runs only for the account proven by a valid session and preserves existing non-null provider links. If an approved seller remains denied after sign-in, inspect that account's seller profile, role and user linkage; do not grant staff access as a workaround.

Rollback: retain current database and media while restoring the previous application if required. Do not overwrite new order/account activity with an old database backup. Any identity links established by valid sessions are account data and should be preserved.

Post-deployment anonymous Chrome smoke check passed all 22 page/viewport checks at 1440px and 390px, with zero console/page errors and no horizontal overflow. Results and screenshots are in outputs/live-verification-2026-09-11/. No orders, emails or account changes were submitted by this smoke test.
