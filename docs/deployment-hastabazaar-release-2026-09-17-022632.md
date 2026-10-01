# Hastabazaar production deployment record

Date: 17 September 2026 (Asia/Kathmandu)

## Outcome

Deployment completed successfully using a versioned prebuilt release. Production is serving release `hastabazaar-release-2026-09-17-022632` and both health endpoints are healthy.

- `/health`: HTTP 200, `status=ok`, `marketplaceReady=true`, release `hastabazaar-release-2026-09-17-022632`
- `/health/live`: HTTP 200
- Public homepage: rendered successfully in Chromium
- Footer feedback form: rendered with the “How can we help?” heading and “Send query” action
- A malformed same-origin feedback request was rejected with HTTP 400, confirming server-side validation
- No real email was sent during deployment; inbox delivery remains a manual acceptance check

## Release artifact

- Release ID: `hastabazaar-release-2026-09-17-022632`
- Local ZIP: `C:\Users\abinash\Desktop\Hatskala\outputs\hastabazaar-release-2026-09-17-022632.zip`
- Size: 24,832,864 bytes
- SHA-256: `f3fb57fcd9c44206ab0e0435c81b951e2605b74b1a41e7156500e3454b558cef`
- Files: 3,451
- Source/archive verification: zero missing, extra, or mismatched files
- Schema manifest: 93 tables, 38 triggers, and 22 entries (base schema plus additive migrations 1–21)
- Production ZIP retained at `/home2/hastabaz/deployment-backups/hastabazaar-release-2026-09-17-022632.zip`

The release contained the expected runtime entry points and build output. It did not contain the database reset schema or development seed data. The server-side ZIP size exactly matched the local artifact; a server-side SHA-256 was not available and remains an evidence gap.

## Verification completed before deployment

- Focused feedback tests: 4/4 passed
- Full automated test suite: 245/245 passed
- TypeScript check: passed
- Lint: passed under the previously accepted treatment of 11 unchanged legacy findings
- Standard application build: passed
- Babal/Passenger release build: passed
- Local production smoke checks: passed

## Database decision

No database migration or write was performed. Phase 1 production inventory had confirmed additive migrations 1–21, including the complete `homepage_product_controls` table. The deployed release expects the same migration level.

The base schema, reset schema, development seeds, imports, repairs, and optimizations were not run.

## Cutover

Passenger was stopped once after the replacement release had been uploaded, extracted, and checked. The paths were then moved without deletion:

- Previous active application moved from `/home2/hastabaz/hastabazaar-app` to `/home2/hastabaz/hastabazaar-app-rollback-2026-09-17-024347`
- Prepared release moved from `/home2/hastabaz/hastabazaar-release-2026-09-17-022632` to `/home2/hastabaz/hastabazaar-app`
- Passenger was started once

Observed production interruption was approximately one minute. No second Node process was started and no package installation or production build ran on the hosting account.

## Rollback procedure

Use this only if an application rollback is required. Retain all additive database changes and all newer orders, payments, financial records, audits, policy acceptances, Seller/customer records, messages, uploads, and private documents.

1. Confirm the fault and record current health and relevant logs.
2. Stop Passenger once.
3. Move `/home2/hastabaz/hastabazaar-app` to a new, uniquely named failed-release preservation path. Do not delete it.
4. Move `/home2/hastabaz/hastabazaar-app-rollback-2026-09-17-024347` to `/home2/hastabaz/hastabazaar-app`.
5. Confirm the application root remains `/home2/hastabaz/hastabazaar-app`, startup file remains `app.cjs`, Node remains 22.23.2, and existing environment-variable names remain present without exposing their values.
6. Start Passenger once.
7. Verify `/health/live`, `/health`, HTTPS, authentication, existing Super Admin access, Seller access, private documents, products, uploads, cart, checkout, policy acceptance, orders, cancellations, delivery, returns, complaints, refunds, notifications, and resource usage.
8. Do not restore an older database. If any application/database compatibility problem appears, stop and reconcile it explicitly before taking further action.

## Backups preserved

Fresh predeployment backups remained present after cutover:

- `/home2/hastabaz/backup-9.17.2026_00-25-02_hastabaz.tar.gz` — 339,806,631 bytes
- `/home2/hastabaz/hastabazaar-app-2026-09-17-predeployment.tar.gz` — 78,442,370 bytes
- `/home2/hastabaz/private-media-2026-09-17-predeployment.tar.gz` — 14,013,475 bytes

Verified off-server copies are under `C:\Users\abinash\Downloads\Hastabazaar-Production-Backups-2026-09-17` with these SHA-256 values:

- Full account backup: `4E4650F61EF0FC369A6FADD1C4DF945ADAE7B8A55DE244B9B4562D617F2C131E`
- Separate MariaDB export: `0E2D3C662523990E14001FE0E72644188D23C83E011FFB5CA41659E56749CEF0`
- Application-root archive: `BC3C948DF811270CBCCEB85F5B619477DE55AF44B715B627E65E002436CB7038`
- Private-media archive: `427C121C1E0E96119F173BE9BF87AC4B82E80C448E55C62F3CE1068B113FC6`

No backup, release, log, or temporary artifact was deleted.

## Post-deployment acceptance evidence

HTTP 200 was confirmed for the homepage, shop, legal centre, Seller agreement, terms, privacy, returns, shipping, contact, help, login, registration, and Seller onboarding pages. `/local-testing` returned 404. Protected account, Seller, and administration routes redirected unauthenticated users to login as expected.

Security headers were present, including Content Security Policy, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, strict-origin referrer policy, and HSTS.

The active application root contained the expected runtime files and the Passenger-created `tmp` directory. The new `stderr.log` was zero bytes. Private media and all fresh backups remained present.

Post-deployment hosting usage was within the observed account limits: 33/100 processes, 255.39 MB/1 GB physical memory, 3/20 entry processes, 2.36 GB disk usage, and no CPU/I/O saturation at the observation point.

## Outstanding acceptance and risks

- Submit one genuine footer feedback message and confirm receipt at `hastabazaar98@gmail.com`. This was not done automatically because it sends an external communication.
- Authenticated Super Admin, Seller, and customer workflows were not exercised during this deployment session. Complete the documented acceptance checklist with suitable test accounts.
- The two policy identifiers intentionally remain `customer-legal-v3-registration-pending-2026-09-16` and `seller-agreement-v3-registration-pending-2026-09-16` until approved Nepal-law documents are ready. Treat real-Seller onboarding and commercial acceptance as a business/legal risk until those documents and identifiers are finalized.
- A server-side SHA-256 for the uploaded release ZIP was not captured; exact byte size and extracted-file validation matched.
- Independent second-location/encrypted custody evidence for backups remains outstanding.
- Observe production for 24–72 hours. Do not clean up the rollback release, release ZIP, backups, logs, or temporary artifacts without an exact reviewed deletion list and explicit approval.

## Scope note

The deployed application release is immutable. Subsequent local changes to `scripts/cpanel-cdp.mjs` are deployment-assistance tooling only and were not included in the release artifact.
