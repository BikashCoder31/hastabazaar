# Babal.Host deployment — 11 September 2026

Deployed with the owner's explicit authorization. Live verification completed around 01:59 Nepal time on 11 September (20:14 UTC on 10 September).

## Release and backup

- Installed cumulative `outputs/hastabazaar-password-reset-2026-09-11.zip` into `/home2/hastabaz/hastabazaar-app`.
- SHA256: `0E1D400C3D84C871E1A52D90A5E5F66C5CD527EAB7937AAA5545D63180AB2631`.
- Babal cPanel full-account backup completed before maintenance: `/home2/hastabaz/backup-9.11.2026_01-40-27_hastabaz.tar.gz`, displayed size 193.61 MB, permissions 0600. Retain it. A full cPanel restore requires host assistance; individual archived files/database exports may be recovered separately.
- Node.js 22.23.2, production mode, startup `app.cjs`; MariaDB 10.11.19. App stopped for migrations/extraction, then started successfully.
- Existing environment settings and dependency symlink retained. Release extraction reported no failures. No database reset, file deletion, account password change or media replacement was performed. Existing Super Admin session remained valid.

## Database changes applied

The referrals/wallet foundation already existed. Imported only these pending migrations, in order, using UTF-8 with foreign-key checking enabled and partial-import interruption disabled:

1. `deployment/babal/mariadb-order-updates.sql`
2. `deployment/babal/mariadb-review-photos-replies.sql`
3. `deployment/babal/mariadb-referral-offer-fifty.sql`
4. `deployment/babal/mariadb-password-reset.sql`

phpMyAdmin confirmed successful completion of 14 queries. The combined import input is `outputs/live-pending-2026-09-11.sql`. No base schema or foundational reset script was imported. The referral migration retains historical amounts and its one-time audit marker.

## Live verification

- `/health`: HTTP 200, marketplace ready.
- Public About, Contact, Shipping, Returns, Privacy, Terms and referral terms: HTTP 200. Contact displays `support@hastabazaar.com`.
- Anonymous Chrome at 1440×1000 and 390×844: 22 page checks passed, no console/page errors or horizontal overflow. Login's Forgot password link opens the reset-request page and its send-code control is visible. Also checked tracking and shop. Script/results/screenshots: `outputs/verify-live-2026-09-11.mjs` and `outputs/live-verification-2026-09-11/`.
- Existing authenticated Super Admin visiting `/login` landed in `/admin`, with access preserved.
- Admin referral settings show NPR 50 for both friend discount and referrer reward, retaining the NPR 1,500 minimum and seven-day wait. Admin order-email and review queues render successfully.
- Customer account has separate wallet and referral destinations. Referral page displays the live NPR 50 offer, copy/share controls, eligibility and progress. Wallet renders and explicitly keeps deposits and withdrawals unavailable; delivery remains payable in cash.

## Local verification versus remaining live testing

Before deployment, the cumulative release passed 71 automated tests, TypeScript, production build, disposable MariaDB integration and desktop/mobile flow checks. Those tests used local fixtures and mocked mail; they are not evidence of real inbox delivery.

The live shop currently has no published products, so actual product delivery calculations, checkout, order updates, review uploads and return flows could not be exercised against a real listing. No real orders were placed or marked delivered. Live password-reset email receipt/completion, OTP receipt, a fresh password sign-in, external Google authorization and seller sign-in require subsequent controlled testing. The preserved Admin-session redirect is verified, but does not substitute for those fresh-login tests. The support mailbox's incoming delivery was not tested.

Optional unattended email retry cron was not configured in this deployment. Existing immediate attempts and Admin retries are available; see `docs/architecture/order-updates.md` for the optional Babal cron setup.

## Rollback and further releases

Keep the full backup and this release ZIP. Prefer restoring the previous application files while retaining current configuration/media and additive tables. Do not restore an old database over new orders, wallet activity, or completed password resets. Do not remove the referral migration marker or change recorded referral amounts. A database restore requires reconciling activity since the backup. Continue testing locally, then package and deploy further changes only when authorized.
