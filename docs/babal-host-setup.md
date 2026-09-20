> Current local implementation (13 September 2026): deployment remains on hold. For the existing marketplace use [the consolidated maintenance supplement](architecture/consolidated-babal-maintenance-2026-09-13.md). The initial empty-database setup and older release names below are historical instructions, not the current upgrade procedure. Never import the base/reset schema into the existing marketplace.

# Hatsabazaar: Babal.Host setup

This guide is for hastabazaar.com and the purchased Starter Node.js hosting account.
The supplied hosting-check ZIP is a temporary connectivity check, not a deployable copy of the marketplace.

## 1. Activate the domain and hosting

1. Open the Babal.Host client area and confirm that both the domain and hosting service show Active.
2. Under the hosting service, open cPanel using the account's login button or the link in the hosting welcome email.
3. Check that hastabazaar.com appears under cPanel's Domains section.
4. In the domain's nameserver settings, use the exact nameservers assigned in the welcome email. If already correct, leave them unchanged. Preserve any existing email DNS records.
5. Under SSL/TLS Status, check certificate coverage for hastabazaar.com and www.hastabazaar.com. Run AutoSSL if offered once DNS points to the hosting server; otherwise request certificate activation from support.

A local DNS check during preparation returned “DNS name does not exist.” This does not establish that registration failed: check the account's registration status and assigned nameservers.

## 2. Verify Node.js hosting

In cPanel, open **Setup Node.js App → Create Application** and use:

| Field | Value |
| --- | --- |
| Node.js version | 22.23.2 if available, otherwise the supported 22.x version confirmed by Babal.Host (minimum 22.13) |
| Application mode | Production |
| Application root | hastabazaar-app (a directory under the account home, outside public_html) |
| Application URL | hastabazaar.com, with the URL path empty or `/` |
| Application startup file | app.cjs |

Create the application. In File Manager, open its exact application root. Upload and extract `babal-hosting-check.zip` so `app.cjs` and `package.json` sit directly in that root, with no extra nested folder. Replace only a newly generated default example if necessary; do not overwrite another existing site.

Return to Setup Node.js App. Add the database environment variables listed below, run **NPM Install**, and restart the application. Allow Passenger to manage the process; do not also start a separate background process.

| Variable | Value |
| --- | --- |
| `DB_HOST` | `localhost` |
| `DB_PORT` | `3306` |
| `DB_NAME` | `hastabaz_marketplace` |
| `DB_USER` | `hastabaz_marketapp` |
| `DB_PASSWORD` | The private password created for that database user |

Do not add another `NODE_ENV` variable; Production mode already supplies it. Do not put the database password in a file or share it in screenshots.

Visit:

- `https://hastabazaar.com/` — should show “Hatsabazaar hosting is connected.”
- `https://hastabazaar.com/health` — should return `status: ok`, `node: connected`, `database: connected`, and `marketplaceReady: false`.

This proves HTTPS routing and the Node process work. It does not test the marketplace's database, authentication, uploads, or resource usage.

If the page does not respond, check the application log shown in cPanel and the domain/certificate status. Share the error message, not passwords, private keys, connection strings, or session-bearing cPanel URLs.

## 3. Import the marketplace database

The generated `deployment/babal/mariadb-schema.sql` is for the confirmed MariaDB 10.11 server. It creates the 52 marketplace tables, password authentication, server-side sessions, constraints, and the production category/occasion taxonomy. It does not insert sample users, sellers, products, or orders.

1. Open phpMyAdmin and select `hastabaz_marketplace` in the left sidebar.
2. Select **Import**, choose `deployment/babal/mariadb-schema.sql`, leave the character set as UTF-8, and click **Import/Go** once.
3. A successful import should show `hastabazaar_schema_versions`, `user_credentials`, and `user_sessions`, along with the marketplace tables.
4. Do not import `db/seeds/development.sql`; that file contains local test identities.

## 4. Deploy the standalone application

The prepared `outputs/hastabazaar-babal-deploy.zip` contains a tested Vinext standalone Node build and the Passenger `app.cjs` entry point. It is about 15.5 MB compressed and contains roughly 3,100 files.

1. In Setup Node.js App, stop the current preflight app.
2. In File Manager, move the existing contents of `/home2/hastabaz/hastabazaar-app` to a backup directory outside the application root.
3. Upload the deployment ZIP to the empty application root and extract it there. `app.cjs`, `server.js`, `package.json`, `dist`, `node_modules`, and `public` must sit directly in `hastabazaar-app`, not inside another folder.
4. Keep the startup file set to `app.cjs`. The standalone package already contains its production dependencies, so do not run another build on the 1 GB hosting account.
5. Retain the existing database variables and add:

| Variable | Value |
| --- | --- |
| `AUTH_PROVIDER` | `local` |
| `APP_ORIGIN` | `https://hastabazaar.com` (also supplied by the updated `app.cjs`) |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Web application client ID from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Web application client secret from Google Cloud |
| `SMTP_HOST` | Outgoing mail server hostname shown by cPanel |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | Full cPanel mailbox address, for example `no-reply@hastabazaar.com` |
| `SMTP_PASSWORD` | Password for that mailbox |
| `EMAIL_FROM` | `Hastabazaar <no-reply@hastabazaar.com>` |

For Google OAuth, create a Web application credential with the authorized redirect URI
`https://hastabazaar.com/api/auth/google/callback`. Only the `openid`, `email`, and
`profile` scopes are requested. For mail, use cPanel's encrypted SSL/TLS SMTP settings;
the Node adapter currently expects implicit TLS, normally port 465.
| `DB_POOL_SIZE` | `3` |
| `MEDIA_ROOT` | `/home2/hastabaz/private-media` |
| `HASTABAZAAR_SUPER_ADMIN_EMAIL` | The email address you will use for the owner account |

Before restarting the release that adds passwordless email sign-in, import
`deployment/babal/migrations/2026-09-09-email-login-otp.sql` into the existing
marketplace database with phpMyAdmin. The migration only creates the
`email_login_challenges` table when it is missing; it does not replace or delete
existing users, sessions, orders, or staff records.

Email-code sign-in is available only to active accounts that already exist. Codes
are six digits, expire after ten minutes, allow five attempts, and are consumed
after a successful sign-in. Password login and Google sign-in remain available.

6. Save and restart the application.
7. Visit `https://hastabazaar.com/health`. It should return `marketplaceReady: true` after the schema import.
8. Open `/register`, create the owner account using the exact configured super-admin email, then visit `/admin`. The first matching account is promoted through the one-time bootstrap invitation. Once a super administrator exists, the bootstrap refuses to create another one.

Do not share database passwords, account passwords, private keys, or session cookies. Never enable the `/local-testing` role switcher in production.

## 5. Before opening the marketplace

Validate login/logout, owner access, seller applications, private document access, product uploads, cart, COD checkout, order management, and the cPanel backup/restore process. Monitor cPanel CPU, memory, entry-process, and error statistics during representative activity. The Starter plan is a valid launch environment, but its 1 GB RAM and process limits still need real traffic measurement.

## References

- Babal.Host Node setup: https://babal.host/blog/how-to-setup-install-and-deploy-your-node-js-application-with-babal-host/
- CloudLinux Node.js Selector and CommonJS startup wrapper: https://docs.cloudlinux.com/cloudlinuxos/cloudlinux_os_components/#node-js-selector

No account settings, DNS records, or live deployment were changed while preparing these files.

## Referral and wallet update (10 September 2026)

Latest cumulative local release: `outputs/hastabazaar-password-reset-2026-09-11.zip`. Follow `docs/architecture/password-reset.md`; it adds `mariadb-password-reset.sql` after the previously pending migrations below. Do not deploy until the owner requests it.

This release supports referral shopping credit with cash on delivery. It has no customer cash deposits or withdrawals and needs no additional payment provider credentials. Super Admin offer controls are at `/admin/referrals`; the customer wallet is `/account/wallet`.

Before installing, back up `/home2/hastabaz/hastabazaar-app` and export the existing MariaDB database. Use a short maintenance window for the schema and application switch. Apply `deployment/babal/mariadb-referrals-wallet.sql` if not yet installed, then the pending `mariadb-order-updates.sql`, `mariadb-review-photos-replies.sql`, and `mariadb-referral-offer-fifty.sql` in that order. The final migration sets both future referral amounts to NPR 50 once, preserving recorded orders and later Admin settings on repeat import. Keep its audit marker. Do not import the base schema or the empty-import reset file into a live database. The current cumulative release instructions are in `docs/architecture/referrals-customer-experience.md`.

Build with `node scripts/build-babal.mjs` (it now copies `app.cjs` automatically). Deploy the contents of `dist/standalone` into the existing application root, preserving runtime environment variables, private media, logs and any customer uploads. Restart the Node application. Keep the application and database backups until live verification is complete.

Verify `/health`, `/login`, `/register`, `/referral-terms`, authenticated `/account/wallet`, `/checkout`, and Super Admin `/admin/referrals`. Check a controlled first-order referral, cash total after credit, and cancellation restoration. Do not mark a real order delivered or collected merely to accelerate a test. Automated tests cover the seven-day reward wait using a disposable database and simulated time.

For wallet-funded returns, the refund page separates **cash to refund**, **shopping credit to restore**, and **referral discount (not refundable)**. Refund only the cash amount. Credit restoration occurs when the approved refund is completed. A local-only MariaDB test script and built-site verification script are in `scripts/`; they never accept production database settings.
