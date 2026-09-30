# Hastabazaar storefront

A clean, non-WordPress foundation for the Hastabazaar handmade marketplace.

## Development

```powershell
npm ci
$env:HASTABAZAAR_RUNTIME_ENV = 'local_staging'
$env:HASTABAZAAR_MAIL_MODE = 'capture'
$env:HASTABAZAAR_PAYMENT_MODE = 'simulated'
$env:HASTABAZAAR_RECIPIENT_DOMAIN = 'local.hastabazaar.test'
$env:APP_ORIGIN = 'http://127.0.0.1:4317'
npm run staging:verify -- --initialize
npm run dev -- --host 127.0.0.1 --port 4317
```

Use a clean shell without production database, SMTP, Cloudflare, or object-storage
credentials. The guarded setup targets this checkout's `.staging` directory.
The initial verification may report that the server is not running; start it,
then use a second shell with the same five environment variables:

```powershell
npm run staging:seed
npx tsx scripts/staging/hosted-auth-readiness.mjs --apply --confirm-local-hosted-auth-schema=HASTABAZAAR-LOCAL-STAGING
npm run staging:verify
Invoke-RestMethod "$env:APP_ORIGIN/health"
```

Seeding applies the tracked SQLite migrations, creates fictional roles, and
publishes only missing form configurations through the audited admin APIs.
It refuses to replace existing drafts. The auth prerequisite helper backs up
the local database before creating missing runtime auth tables; it creates no
auth records. `/health` should report `marketplaceReady: true`.

Open `http://127.0.0.1:4317/local-testing` to choose a fictional role. The switcher
is unavailable in production builds. Live providers remain unconfigured;
the contact form therefore shows a retryable delivery failure in this D1 preview.
Local fixture setup does not certify an empty MariaDB production installation.

Source and build checks:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run build:babal
```

`npm test` runs files serially because the real Miniflare fixtures create a full
migrated database and worker process. Allow time for these native tests; do not
drop them from the verification result. Native MariaDB identity/commerce
acceptance tests are separate opt-in tests guarded to loopback, fictional data,
and `local_staging`. Build commands produce local artifacts and do not deploy.

## Repository map

- `app/` — routes, metadata, and shared styling
- `components/layout/` — site-wide header and footer
- `components/catalog/` — product presentation components
- `components/admin/` — protected marketplace operations interfaces
- `components/ui/` — accessible interface primitives
- `lib/catalog/` — typed catalogue data and future data access
- `lib/marketplace/` — Phase 1 policy, workflows, fees, and role permissions
- `lib/shipping/` — carrier-neutral delivery contracts and integration rules
- `db/` — typed D1 schema and local-only seed data
- `drizzle/` — append-only generated database migrations
- `public/brand/` — production-ready brand assets
- `public/catalog/` — curated images used by the current storefront
- `reference/migration/` — private legacy catalogue/content export and original referenced media
- `reference/brand/` — brand source files
- `docs/` — architecture and product decisions

## Phase 1 baseline

- [Marketplace rules](docs/product/phase-1-marketplace-rules.md)
- [Nepal launch compliance checklist](docs/legal/nepal-launch-checklist.md)
- [Architecture](docs/architecture.md)
- [Commerce data model](docs/architecture/data-model.md)
- [Seller onboarding](docs/architecture/seller-onboarding.md)
- [Seller workspace and local validation](docs/architecture/seller-workspace.md)
- [Staff access and seller review](docs/architecture/staff-operations.md)
- [Admin and Super Admin workspace and validation](docs/architecture/admin-workspace.md)
- [Product onboarding and publication](docs/architecture/product-onboarding.md)
- [Catalogue search and gifting discovery](docs/architecture/catalog-discovery.md)
- [Cart and COD checkout](docs/architecture/checkout.md)
- [Order fulfilment and cancellation](docs/architecture/order-fulfillment.md)
- [Returns, refunds, and complaints](docs/architecture/returns-refunds-complaints.md)
- [Seller earnings and maker-checker payouts](docs/architecture/seller-earnings-payouts.md)
- [Customer accounts, reviews, wishlists, and discovery](docs/architecture/customer-accounts-discovery.md)
- [Operations, shipping, notifications, privacy, and resilience](docs/architecture/operations-governance.md)

The hosted storefront remains private while development continues. Customer accounts, saved addresses, order history and account-owned aftercare, wishlists, verified-purchase reviews, public maker profiles, catalogue and occasion management, cart, COD ordering, product compliance disclosures, immutable checkout acceptance, downloadable order statements and COD receipts, fulfilment tracking, item-level returns/refunds, complaints, seller analytics, pickup/return coordination, seller payout requests, maker-checker payouts, promotions, user controls, privacy requests, incident records, backup-verification records, and high-risk public mutation rate limits are implemented. The interface is English-only for now while bilingual-ready database fields remain intact. PAN/VAT tax invoices, live carrier booking, email/SMS delivery, automated bank transfer, provider-created backups/monitoring, online payment, approved legal text, production credentials, and production legal identifiers remain intentionally disabled until real approvals, contracts, or providers exist.
