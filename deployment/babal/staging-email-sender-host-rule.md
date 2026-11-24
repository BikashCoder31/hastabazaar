# Staging email sender host rule

**For hosting-provider review.** Apply only to the HTTPS virtual host for `staging.hastabazaar.com`. This host uses LiteSpeed with cPanel configuration. Have the provider confirm the live version, the location of the existing Directory Privacy rule, and the order of rewrite and access checks. Use a persistent site-specific configuration. [LiteSpeed release log](https://litespeedtech.com/products/litespeed-web-server/release-log) · [cPanel HTTPS virtual-host includes](https://docs.cpanel.net/ea4/apache/modify-apache-virtual-hosts-with-include-files/)

## Proposed vhost and Basic Auth rules

Put the following in the staging HTTPS virtual host's server-level rewrite rules, before any catch-all route. It sets a request-local marker and leaves the route, body and original `Authorization` header intact. It does not add a new backend or route.

```apache
RewriteEngine On
RewriteCond %{HTTP_HOST} ^staging\.hastabazaar\.com(?::443)?$ [NC]
RewriteCond %{REQUEST_METHOD} ^POST$
RewriteCond %{THE_REQUEST} "^POST /api/jobs/order-emails HTTP/[0-9.]+$"
RewriteCond %{HTTP:Authorization} "^Bearer[ ][A-Za-z0-9_-]{32,512}$"
RewriteRule ^/api/jobs/order-emails$ - [E=HB_STAGING_ORDER_EMAIL_POST:1]
```

In the staging site's existing Basic Auth context, replace the existing `Require valid-user` clause with this block. Preserve the current realm, user file, auth provider and any enclosing IP or access requirements. Keep Basic Auth on the entire site. The marked request uses the app's existing Bearer-token check as its authentication.

```apache
<RequireAny>
    Require env HB_STAGING_ORDER_EMAIL_POST
    Require valid-user
</RequireAny>
```

The app compares the token before touching the queue. The host rule checks only its format. It contains no credential. Confirm that LiteSpeed forwards the original header to the Node app. Keep the marker server-owned, preserve TLS and other access restrictions, and exclude authorization headers from logs. [App credential check](../../lib/email/job-auth.ts) · [Apache authorization semantics](https://httpd.apache.org/docs/2.4/mod/mod_authz_core.html)

## Hosted acceptance before enabling the cron

Use a fresh client with no browser credentials. With `curl`, use `--http1.1` to match the sender. A dummy token can be any **incorrect** 32-character value drawn from letters, digits, hyphens and underscores. Record the status and the response type. Keep the actual token out of command arguments and output.

| Staging request | Expected result |
| --- | --- |
| `POST /api/jobs/order-emails` without Authorization | HTTP 401 with the staging Basic challenge |
| Same POST with the well-formed dummy Bearer token | HTTP 401 with the app's JSON `{"error":"Unauthorized"}`. This distinguishes app rejection from a Basic challenge. The authenticated cron run later proves the original header reached the app. |
| GET, HEAD or OPTIONS to the same path with the dummy token | Staging Basic Auth still required |
| POST to `/api/jobs/order-emails/`, to a query-string or encoded variant, or to a different job such as `/api/jobs/ncm-updates`, with the dummy token | No pass-through. Basic Auth or a host rejection. |
| `/`, `/admin` and `/health` without Basic credentials | Staging Basic Auth still required |
| `/health` with valid Basic credentials | HTTP 200 and the exact newly verified staging release |

Check both the sender's request path from the host and the public staging host. If the deployed LiteSpeed build cannot implement this exact exception while retaining the other protections, leave the original Basic gate in place and have the provider review a supported equivalent. Removing the two site-specific changes restores the previous rule. [Staging enablement](../../docs/babal-host-setup.md#schedule-the-email-sender)
