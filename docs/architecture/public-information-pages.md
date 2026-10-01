# Public information pages

## Local release — 11 September 2026

Added public, anonymous routes at `/about`, `/contact`, `/shipping`, `/returns`, `/privacy` and `/terms`. Each has its own title/description, shared responsive layout, page navigation, expandable section index and working footer links. The existing Help hub remains available with links to the full Shipping and Returns pages. Product returns link to `/returns`; checkout links to Terms, Privacy and Returns; registration exposes Terms and Privacy without changing authentication or adding a new acceptance flow.

Content lives in `lib/content/public-pages.ts`; layout is `components/layout/public-information-page.tsx`. The page wrappers are deliberately explicit so unknown URLs continue to use the normal not-found behavior.

Shipping charges and transit ranges are read from the existing calculator. Preparation and once-per-order/multiple-seller explanations match checkout. Returns use the current policy's request/evidence windows and refer customers to the conditions on their item and policy saved with their order. No policy version, order acceptance record, return snapshot, rate, authentication flow, wallet behavior or database schema changed.

Privacy and Terms describe implemented functionality. They do not invent business registration numbers, an office address, a grievance officer, absolute security, a retention duration, guaranteed delivery dates or instant refunds. Contact exposes the owner-selected support email alongside existing order and account support routes. Checkout retains its prior acceptance wording and stored acceptance schema; Terms and Shipping are additionally linked for reading.

## Public support mailbox and business details

The public address is **support@hastabazaar.com**, included in the local Contact page as an email link. This is a custom-domain Babal.Host cPanel mailbox, not a new `@gmail.com` account. On 11 September 2026, the owner completed password entry and mailbox creation privately. The cPanel account list and expanded mailbox details confirmed that `support@hastabazaar.com` exists, is unrestricted and has a 1 GB quota. The existing `no-reply@hastabazaar.com` mailbox remains present, with three mailbox slots still available. No marketplace SMTP settings or Super Admin credentials were changed. Inbound/outbound email delivery has not yet been tested.

Before publishing, open Email Accounts → expand `support@hastabazaar.com` → Check Email. Verify receiving a test email from an external account you control and replying to it. Retain the mailbox password privately. Do not create a duplicate mailbox or change marketplace SMTP credentials or mail routing for this support inbox.

Before production publication, supply the verified legal business name, registration/tax and e-commerce listing details, business address and grievance contact applicable to Hastabazaar. This local implementation is not a claim that those business disclosures or legal compliance have been completed. The Nepal Law Commission's [Electronic Commerce Act, 2081](https://giwmscdnone.gov.np/media/files/E-Commerce%20Act,%202081_yr7k9o5.pdf) (sections 4 and 33) identifies business/contact disclosure and grievance requirements; the [Privacy Act, 2075](https://lawcommission.gov.np/content/12261/12261-the-privacy-act-2075/) provides relevant privacy context. The public copy is grounded in the application's present behavior, with applicable consumer rights preserved.

## Verification

- 62 automated tests passed. The suite includes preceding email, tracking, review, delivery/preparation, return snapshot, wallet/referral and account-security regressions.
- TypeScript passed and the cumulative Babal standalone build succeeded.
- Standalone login, Google entry and hosting-proxy origin checks passed.
- Anonymous headless Chrome checks at 1440×1000 and 390×844 covered all six routes: HTTP 200, page identity and metadata, active navigation, section links, footer destinations, shipping rates, return windows, route-to-route navigation and horizontal overflow. No browser console/runtime errors were observed. Bundled Playwright with installed Chrome was used for isolated local tests; no real accounts, messages or orders were created by this page test.
- Read-only code review found no substantive issues in the new pages or their content alignment.

The standalone server also logged a closed-stream warning during the browser test session. All checked pages returned 200 and browser interactions passed; the warning originates in the framework response-piping path. This remains an observed server-log caveat, not a claim of a warning-free server run.

Node.js 24.19.0 was used locally. Exact Babal.Host Node.js 22.23.2 runtime and live verification remain pending. MariaDB was not changed or rerun for this presentation-only update; its prior delivery/review/wallet release verification is documented in `product-delivery-returns.md`.

## Cumulative deployment package

`outputs/hastabazaar-public-pages-2026-09-11.zip` contains the complete standalone application, dependencies, prior delivery/returns work, order emails and tracking, review photos/replies, and the two pending additive migrations. No new migration is required for these pages.

Keep this release local until deployment is requested and the public contact/business details above are completed. Preserve the existing application, database, uploads and environment values. Follow `product-delivery-returns.md` for backups, migration order and rollback. Apply only the pending order-update and review-photo/reply migrations as needed; never import the base schema or reset SQL into the live database.

When authorised, extract into `/home2/hastabaz/hastabazaar-app`, retain private media and cPanel settings, use Node.js 22.23.2 with `app.cjs`, restart, then check all six public URLs, footer and checkout links, authentication/Super Admin, COD and promotional credit. The mailbox has been created and its cPanel status verified; the website has not been deployed.
