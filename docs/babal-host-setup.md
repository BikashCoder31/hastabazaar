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

## Schedule the email sender

Start with the isolated hosted staging app at `https://staging.hastabazaar.com`. Use its approved QA mailbox and exact staging recipient allowlist. Set up the production job at `https://hastabazaar.com` after the staging run and QA inbox check pass.

1. In the protected Node application environment for each target, set `ORDER_EMAIL_JOB_SECRET` to a distinct, privately generated 32–512 character value. Set `EMAIL_AUTOMATION_EXPECTED_SINCE` to the actual enablement time in Unix milliseconds and restart that app. Keep this original time when restarting or resuming a job. Use `<SECRET>` and `<ENABLEMENT_EPOCH_MS>` as placeholders in any shared notes.
2. Create `/home2/hastabaz/hastabazaar-email/staging` outside both document roots with directory permissions 0700. Copy the reviewed `scripts/run-email-automation.mjs` and its import `scripts/email-automation-watchdog.mjs` into it. In that same directory, create `sender.env` with `ORDER_EMAIL_JOB_SECRET=<SAME_STAGING_SECRET_AS_THE_APP>`, a `sender.json` using the staging mapping below, and a private `sender.jsonl` log. Restrict the env file, config and log to 0600. Use the matching `production` directory and production secret for the production setup.
3. Confirm the account allows one-minute jobs and has Node 22.13+ and Linux util-linux `flock` with `--no-fork`, `--nonblock` and `--conflict-exit-code`. Use the absolute Node executable shown by `command -v node` after activating the app's Node environment in cPanel. The existing launcher holds the mapped OS lock, skips an overlapping invocation and caps the request at 55 seconds. The app keeps its 45-second job budget.
4. In **cPanel → Cron Jobs**, set Minute, Hour, Day, Month and Weekday to `*`. Paste the staging command after the five stars into **Command**, replacing `/ABSOLUTE/PATH/TO/NODE` with the confirmed binary. Configure one job per environment. [cPanel Cron Jobs instructions](https://docs.cpanel.net/cpanel/advanced/cron-jobs/)
5. After two ticks, open **Settings → Email delivery** and look for **Sending normally** and a last run under a minute ago. On staging, place an authorized QA order and confirm the correct order email arrives in the approved QA inbox. Check that the waiting queue progresses.
6. To stop a target, delete its entry under **Current Cron Jobs** and set `"enabled": false` in its private `sender.json`. Leave the queued messages and run history in place. An existing invocation finishes within the existing bounds.

Before enabling staging, get the exact `POST /api/jobs/order-emails` route to the app with its Bearer authorization header intact. Staging's browser Basic authentication cannot share the header with the sender. Have the host review a pass-through restricted to this method and path. Keep the app's existing bearer check and the rest of staging's browser authentication. Verify a request without the job credential still receives 401. The historical staging gateway allowlist does not yet recognize the two email automation bindings. Review the gateway configuration separately before using it with those protected values.

### Private sender mappings

Use the scoped review reference from your own host check in `mappingReference`. The staging app currently reports the `production` runtime name, so the mapping uses that exact name while targeting its separate HTTPS origin and QA queue.

```json
{
  "version": 1,
  "enabled": true,
  "environment": "production",
  "jobUrl": "https://staging.hastabazaar.com/api/jobs/order-emails",
  "allowedAppOrigin": "https://staging.hastabazaar.com",
  "hostMappingReviewed": true,
  "mappingReference": "REPLACE-WITH-STAGING-REVIEW",
  "lockPath": "/home2/hastabaz/hastabazaar-email/staging/sender.lock"
}
```

```json
{
  "version": 1,
  "enabled": true,
  "environment": "production",
  "jobUrl": "https://hastabazaar.com/api/jobs/order-emails",
  "allowedAppOrigin": "https://hastabazaar.com",
  "hostMappingReviewed": true,
  "mappingReference": "REPLACE-WITH-PRODUCTION-REVIEW",
  "lockPath": "/home2/hastabaz/hastabazaar-email/production/sender.lock"
}
```

```cron
* * * * * /usr/bin/env PATH=/usr/local/bin:/usr/bin:/bin /ABSOLUTE/PATH/TO/NODE --env-file=/home2/hastabaz/hastabazaar-email/staging/sender.env /home2/hastabaz/hastabazaar-email/staging/run-email-automation.mjs --config /home2/hastabaz/hastabazaar-email/staging/sender.json --execute >> /home2/hastabaz/hastabazaar-email/staging/sender.jsonl 2>&1
* * * * * /usr/bin/env PATH=/usr/local/bin:/usr/bin:/bin /ABSOLUTE/PATH/TO/NODE --env-file=/home2/hastabaz/hastabazaar-email/production/sender.env /home2/hastabaz/hastabazaar-email/production/run-email-automation.mjs --config /home2/hastabaz/hastabazaar-email/production/sender.json --execute >> /home2/hastabaz/hastabazaar-email/production/sender.jsonl 2>&1
```

The launcher logs only its environment, outcome and observation time or a safe error code. Keep the secrets in the protected app environment and owner-only env files. The separate-host watchdog is optional for launch. The Emails page and Today warning read the app's sender records.

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
