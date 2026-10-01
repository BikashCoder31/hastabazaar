# Existing customer seller applications — 2026-09-11

## Confirmed live account finding
The affected account is active, has a sign-in identity and only the customer role. No saved seller application matches its account ID or email. The three saved approved applications belong to other account emails. The user explicitly confirmed the newest business is unrelated. No ownership links, roles or approvals were changed during diagnosis. The user does not remember the random trading name, so the claimed prior submission cannot be identified.

## Independently reproduced defect and fix
Public application submission always inserted a new user, even for an existing signed-in customer. MariaDB rejected the duplicate account and the API misleadingly described it as an existing application. This is a confirmed defect, but not proof of what happened to the user's historical submission.

The API now resolves the authenticated customer on the server, requires the submitted email to match, and saves the application and documents on that account. Anonymous applicants with an existing email must sign in. New anonymous email applications remain supported. The form pre-fills and locks the signed-in email and explains which account receives access. Approval remains manual; existing account credentials, roles, identity and customer data are preserved. No migration or automatic account relinking is required.

## Local validation
75 automated tests, TypeScript and Babal production build passed. The disposable MariaDB regression initially failed on duplicate insertion, then passed with the fix. HTTP checks cover password login, anonymous and mismatched-email rejection, multipart submission with three documents, duplicate submission rejection, actual Admin review and approval, and dashboard access using the same session. Desktop 1440px and mobile 390px check account email and overflow. Existing password/OTP role-routing regression also run.

Re-run: node outputs/resume-existing-seller-check.mjs (requires the existing disposable local fixture and built standalone app). Durable test: scripts/verify-existing-customer-seller.mjs. Never point fixture scripts at production.

## Deployment
Cumulative ZIP: outputs/hastabazaar-existing-customer-seller-fix-2026-09-11.zip.
Use the same Babal Node 22 application and app.cjs startup. Take a current backup, stop the app, upload/extract the tested ZIP into the application root, preserve environment/dependency symlink/uploads, then restart. No SQL import is needed for this incremental update. Do not import base/reset schema. Previously applied migrations must not be blindly re-run. Verify /health, /login, /sell and anonymous /seller redirect. Existing approved business ownership must not be changed to compensate for missing application records.

Status at packaging: locally verified; this registration fix has not yet been deployed. The earlier session-identity fix is already live. End-to-end access for the affected real account remains unverified because there is no matching saved application.
