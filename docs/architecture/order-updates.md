# Order emails and tracking

Order confirmation, preparation, ready-for-pickup, dispatch, delivery and cancellation now queue branded HTML and plain-text emails. Existing SMTP settings are reused. No additional email vendor is required; hosting mailbox sending limits still apply.

`/track` accepts an order number and the checkout email, with no sign-in required. The lookup uses POST, rate limiting, same-origin checks and no-store responses. It returns status, dates, delivery reference and the estimate recorded at checkout. It excludes customer identity, address, phone, items, receipt credentials and internal notes. Order numbers alone do not grant access. This is recorded order progress, not live courier GPS. Full order actions continue to require the existing receipt or signed-in account.

## Reliability

Database triggers insert an outbox record in the same transaction as an order status change. A unique order/status key prevents repeated updates from queuing the same event twice. Checkout and fulfillment routes attempt delivery after the transaction commits. SMTP failure does not roll back an order. Existing historical orders are not emailed during migration.

Each sender atomically claims a job with a 15-minute lease. Success is recorded only after the SMTP server accepts the message; acceptance cannot guarantee inbox delivery. Failed attempts are eligible after five minutes and can be processed from Admin → Order emails. A scheduler endpoint supports unattended retries. Without the cron setup below, retries happen on later actions for that order or when staff use the retry button.

As with SMTP outboxes generally, a process crash after SMTP acceptance but before recording success can cause a duplicate on recovery. The admin page deliberately says “sent,” not “read” or “received.” Error records contain only a safe failure code, never SMTP responses or credentials. A late email includes the current order state so an older confirmation does not hide a later cancellation.

## Next Babal.Host deployment

1. Back up the existing application and database. Preserve database variables, SMTP variables, Google settings, Super Admin settings, media and existing user data.
2. This migration assumes the referrals/wallet schema is already installed. Import `deployment/babal/mariadb-order-updates.sql` into the existing marketplace database through phpMyAdmin. It only adds the email queue, index and two named triggers. Repeat imports preserve queued jobs. Do not import the full base schema over a live database.
3. Upload the next tested standalone build to the existing application root and restart the Node app. Keep `APP_ORIGIN=https://hastabazaar.com` and the existing SMTP configuration.
4. Check `/health`, `/track`, password/Google login and Super Admin access. Place an authorized test COD order with an inbox you control; confirm the email and tracking result. Move it through packing, ready, dispatch and delivery only if it is genuinely a test order under your operational procedure. Check cancellation with a separate test order. Avoid marking real orders delivered for testing.
5. Confirm Admin → Order emails records sent/failed states. A mismatched email on tracking must reveal no order. Check the inbox and spam folder; only a real mailbox check verifies end-to-end delivery.

## Optional automatic retries with cPanel Cron Jobs

No paid service is required for this feature. Use the hosting account’s Cron Jobs facility if available.

1. Generate a random secret of at least 32 characters privately. Enter it directly into the Node app environment as `ORDER_EMAIL_JOB_SECRET`. Do not paste it into chat or put it in a URL. Restart the app.
2. Create a private curl configuration file outside public directories, for example `/home2/hastabaz/order-email-cron.conf`, with owner-only permissions (0600). In the provider editor, enter these lines, replacing the placeholder directly there:

```text
url = "https://hastabazaar.com/api/jobs/order-emails"
request = "POST"
header = "Authorization: Bearer ENTER_THE_SAME_SECRET_HERE"
silent
show-error
fail
max-time = 180
output = "/dev/null"
```

3. Run this command every five minutes in cPanel Cron Jobs:

```sh
curl --config /home2/hastabaz/order-email-cron.conf
```

The command does not contain the secret. Each run processes at most six eligible jobs. An absent or incorrect credential returns 401. Failed/unconfigured delivery returns 503. Monitor the admin queue and adjust scheduling to traffic and hosting limits. Do not make the configuration file public or include it in deployment ZIPs.
