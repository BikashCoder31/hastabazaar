# Forgot password — release, 11 September 2026

Deployment update: this cumulative release was deployed to Babal.Host with owner authorization on 11 September 2026. See `../deployment-2026-09-11.md` for the backup, migrations, live verification and remaining tests. The local preparation details below remain the record of pre-deployment testing.

The Login page now has a **Forgot password?** link beside the password sign-in section. `/forgot-password` accepts the account email; `/forgot-password/reset` accepts a six-digit email code, a new password and its confirmation. Passwords must contain 10–256 characters. Successful reset returns to Login with a confirmation, preserving the safe original destination and role-aware sign-in behavior.

The existing Babal SMTP sender delivers a Hastabazaar password-reset message. No new mailbox/provider credentials are needed. Reset codes use the existing salted browser-token-bound OTP hashing utility but have a separate HTTP-only cookie and `password_reset_challenges` table. Sign-in codes cannot reset passwords. Codes expire after ten minutes, permit at most five wrong guesses and work only in the requesting browser. Requests also have per-email and per-request-fingerprint rate limits.

Unknown accounts and delivery failures receive the same generic response. Once validation/configuration/rate checks pass, the response follows a fixed five-second schedule independent of account lookup or SMTP completion. The Babal Node process completes the started email operation in the background; a process restart can interrupt delivery, so users may need to request another code. This is not a durable email queue or delivery guarantee. Failed sends remove the corresponding stored challenge. Raw reset codes and browser tokens are never stored in the database or put in URLs.

The reset claim, salted password replacement, session revocation and sign-in-code invalidation run in one database transaction. A unique completion marker limits changes to the winning request; replay cannot replace the password again. Existing sessions are signed out and the user signs in again. Active users who previously used Google/email-code only may set a password after proving email ownership. Roles, Google identity linkage, account status, orders, wallet entries and media are preserved. No email address can be supplied to change a different account at the completion step.

## Local verification

- 71 automated tests passed, including expiration, replay, exhausted guesses, inactive accounts, sign-in-code separation and uniform-response scheduling with a delayed email stub. TypeScript and Babal standalone build passed.
- MariaDB 11.4.9 on localhost: additive migration/re-import, single-use claim, concurrent replay, complete rollback on an injected failure, password hash replacement and revocation of existing sessions passed.
- Chrome desktop (1440×1000) and mobile (390×844): Login link, both reset pages, password-confirmation error, successful reset, confirmation on Login and signing in with the new password passed. No horizontal overflow. Cross-site completion requests were rejected; missing SMTP configuration showed the unavailable state.
- Email generation/delivery was mocked locally and produced a reset-specific message. Existing standalone Login/Google entry and trusted hosting-proxy checks passed. Live SMTP delivery, external Google flow and exact Node.js 22.23.2 behavior remain unverified. Local runtime was Node.js 24.19.0.
- Read-only security review found the response-timing issue; it was corrected and reviewed again with no further substantive findings.

## Cumulative deployment — only when requested

Use `outputs/hastabazaar-password-reset-2026-09-11.zip`. It supersedes the role-sign-in ZIP and includes all earlier referral, public-page, product delivery/returns, order-email/tracking and review work. Its sibling manifest verifies every packaged file against the tested standalone output. No local database, uploaded media, environment secrets or test credentials are included.

1. Back up the existing Babal application, MariaDB database and media; preserve all cPanel environment values and Super Admin access. Use a maintenance window for application/database switching.
2. Follow `referrals-customer-experience.md` for the prior pending migrations: foundational referrals/wallet if absent, then order updates, review photos/replies and the fifty-offer migration. **Then apply `deployment/babal/mariadb-password-reset.sql`** to the existing database before installing the new application. It only creates the reset-challenge table/index; repeat import preserves data. Never run base/reset SQL on production.
3. Extract this ZIP into `/home2/hastabaz/hastabazaar-app`, preserving uploaded/private media and configuration. Keep Babal.Host Node.js 22.23.2, `app.cjs`, the existing public origin and SMTP/Google settings. Restart the Node application.
4. Verify password, Google and OTP sign-in and the correct customer/seller/Admin landing pages. Using an authorised test account, request a reset email, check inbox/spam, complete it in the same browser and sign in with the new password. Confirm old password/session rejection and that the code cannot be reused. Do not reset the Super Admin password merely for a test.
5. Verify the prior cumulative features as documented. COD and promotional wallet/referrals remain enabled; deposits and withdrawals remain disabled. Keep backups until live verification is complete.

No live application, database or SMTP settings were changed while preparing this release. Rolling back application code can retain the additive reset table, but must not restore old credentials over users' completed password resets. Follow the financial-data rollback precautions in the prior release instructions.
