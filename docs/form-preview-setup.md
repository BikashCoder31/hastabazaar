# Local form preview

The preview needs both the business forms in the catalog and the forms managed by other features. Checking the catalog alone does not check staff access, account settings, or sign-in.

In this checkout, use these local settings in PowerShell:

```powershell
$env:HASTABAZAAR_RUNTIME_ENV='local_staging'
$env:NODE_ENV='development'
$env:APP_ORIGIN='http://localhost:3018'
$env:HASTABAZAAR_MAIL_MODE='capture'
$env:HASTABAZAAR_PAYMENT_MODE='simulated'
$env:HASTABAZAAR_RECIPIENT_DOMAIN='local.hastabazaar.test'
npm run staging:forms:check
```

This read-only check reports missing sign-in tables and missing or invalid published settings for every form that needs them. It exits with an error if the preview is incomplete. Run it after preparing or restarting a local preview and before handing it over for review. A successful page response alone does not check the settings loaded later by the browser.

For an existing preview with missing sign-in tables, use `npx tsx scripts/staging/hosted-auth-readiness.mjs --plan`, then its guarded `--apply --confirm-local-hosted-auth-schema=HASTABAZAAR-LOCAL-STAGING` command. For missing forms managed by other features, use `npx tsx scripts/staging/identity-form-readiness.mjs --plan`, then `--apply`. These tools check the marked local environment, save a recovery copy, and preserve existing published settings. They do not grant staff roles.

Business forms use the normal draft and publish APIs. Resolve any existing unpublished draft instead of replacing it with setup data. Read-only search filters, logout, add-to-cart, and the local role selector do not need a published form configuration.

The preview uses isolated sample data. These setup commands do not prepare or certify a live deployment.
