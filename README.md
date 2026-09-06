# Hathkriti storefront

A clean, non-WordPress foundation for the Hathkriti handmade marketplace.

## Development

```powershell
npm install
npm run dev
```

Production check:

```powershell
npm run build
npm run lint
```

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
- [Staff access and seller review](docs/architecture/staff-operations.md)
- [Product onboarding and publication](docs/architecture/product-onboarding.md)
- [Catalogue search and gifting discovery](docs/architecture/catalog-discovery.md)
- [Cart and COD checkout](docs/architecture/checkout.md)
- [Order fulfilment and cancellation](docs/architecture/order-fulfillment.md)
- [Returns, refunds, and complaints](docs/architecture/returns-refunds-complaints.md)
- [Seller earnings and maker-checker payouts](docs/architecture/seller-earnings-payouts.md)
- [Customer accounts, reviews, wishlists, and discovery](docs/architecture/customer-accounts-discovery.md)
- [Operations, shipping, notifications, privacy, and resilience](docs/architecture/operations-governance.md)

The public storefront is deliberately local until legal registration, approved policy text, final carrier pricing, production credentials, production Super Admin identity, and provider monitoring are configured. Customer accounts, saved addresses, order history and account-owned aftercare, wishlists, verified-purchase reviews, public maker profiles, catalogue and occasion management, cart, COD ordering, fulfilment tracking, item-level returns/refunds, complaints, seller analytics, pickup/return coordination, seller payout requests, maker-checker payouts, promotions, user controls, privacy requests, incident records, and backup-verification records are implemented. Email/SMS messages are stored in a provider-neutral outbox, while live carrier booking, message delivery, automated bank transfer, provider-created backups, and online payment remain intentionally disabled until real contracts and credentials exist.
