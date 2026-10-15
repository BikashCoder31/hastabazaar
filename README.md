# Hastabazaar storefront

A clean, non-WordPress foundation for the Hastabazaar handmade marketplace.

## Development

The active local project is `C:/Users/abinash/Desktop/Hatskala`.
Open a terminal in that folder, or double-click `START-HASTABAZAAR.cmd`.
The Desktop project already has its local data. For normal startup, use:

```powershell
npm run local:check
npm run dev
```

Use a clean shell without production database, SMTP, Cloudflare, or object-storage
credentials. The launcher checks the project folder, approved Git baseline,
local settings, and existing `.staging` data before starting at
`http://localhost:3018`. It stops if the port is occupied or data is missing.
It never creates an empty database, restores a backup, seeds records, or applies
migrations. See [LOCAL-START.md](LOCAL-START.md) for help with a stopped launch.

Open `http://localhost:3018/local-testing` to choose a fictional role. The switcher
is unavailable in production builds. Live providers remain unconfigured;
the contact form therefore shows a retryable delivery failure in this D1 preview.
The readiness check verifies form settings and the sign-in database structure;
it does not verify live email, payment, or MariaDB production services.

ZIP files in `C:/Users/abinash/Desktop/Hatskala-backups` are recovery archives,
not working projects. Do not extract them over this project or launch an old
worktree to get around a failed check. Git keeps the normal project history.

Creating a new test environment, restoring data, applying migrations, or testing
the local media decoder is a separate reviewed setup task. The existing guarded
scripts under `scripts/staging/` are not normal launch steps. Their checkout and
data protections remain in force. Do not run reset or seed commands to repair a
missing-data error without reviewing the intended source and destination.

SMS verification is temporarily dormant until a provider is selected. Explicit
`CHECKOUT_CONTACT_POLICY=email_only` keeps email ownership verification required
and still requires a valid account phone number for delivery. It neither marks
phones verified nor sends SMS. Set `CHECKOUT_CONTACT_POLICY=email_and_phone` after
the SMS adapter and delivery are configured and verified to restore phone OTP;
an absent or unknown value retains the stricter email-and-phone requirement.
The production Node runtime reads this setting from its environment; a local
preview forwards only the explicit email-only setting, never provider secrets.

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
