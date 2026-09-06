# Architecture

## Current foundation

Hathkriti is a Vinext/React application written in TypeScript and styled with Tailwind CSS. It is independent of WordPress and structured so the storefront, catalogue, account flows, and administration can evolve without mixing presentation and data-access concerns.

## Boundaries

- `app/` owns routes and page composition.
- `components/` owns reusable presentation and interaction.
- `lib/catalog/` owns catalogue types and data access. Static sample data is temporary; future storage code should preserve the same typed boundary.
- `lib/auth/` owns staff identity-to-role resolution. Authentication never grants a marketplace role by itself.
- `lib/db/repositories/` owns prepared D1 queries and workflow persistence.
- `lib/marketplace/` owns versioned commercial policy, workflows, and authorisation rules.
- `lib/shipping/` owns carrier-neutral contracts. Carrier adapters must not leak provider-specific details into checkout or order logic.
- `public/` contains only assets intentionally shipped to visitors.
- `reference/` is migration input, not runtime application data.

## Phase 1 decisions

The approved working baseline is documented in `docs/product/phase-1-marketplace-rules.md`. Nepal launch gates and authoritative source links live in `docs/legal/nepal-launch-checklist.md`.

Commercial policy is effective-dated and must be snapshotted onto each order. Monetary values use integer paisa. Permissions default to deny, high-risk actions use maker-checker approval, and audit history is append-only. Allowed seller, product, and order state changes are centralized in `lib/marketplace/workflows.ts`.

## Planned rollout layers

1. Foundation: persist the Phase 1 policy, bilingual content model, audit model, and Nepal address/serviceability model.
2. Catalogue: normalized products, bilingual categories and gift occasions, public search/filtering, pricing, inventory, media, moderation, public maker profiles, wishlists, prohibited-product guidance, and maker-checker featured promotions are implemented.
3. Identity: protected customer, approved-seller, Admin, and Super Admin access are implemented. Account and role mutations derive identity server-side and default to deny.
4. Commerce: durable guest carts, customer accounts, saved addresses, wishlists, account order history and aftercare, verified reviews, sorted/paginated discovery, COD order creation, commercial snapshots, inventory reservation, cancellations, item-level returns, COD refund records, replacement outcomes, seller earnings, seller payout requests, reserve accounting, and maker-checker payout records are implemented. PAN invoices, online payments, automated payout transfer, and provider reconciliation imports remain launch integrations.
5. Operations: seller/product moderation, multi-seller fulfilment, manual carrier labels and pickup state, return shipping, carrier claims/reconciliation records, complaints, marketplace analytics, bilingual notification outbox, data-rights review, user status controls, incident response, and backup-verification evidence are implemented. Live Nepal Can Move calls, email/SMS delivery, actual provider backup creation, and monitoring integrations remain deliberately unconfigured.

Each layer should be completed and tested in staging before production credentials are introduced.

The customer, seller, and admin route groups shown in product planning references are a sequencing guide, not permission to expose unfinished or legally unapproved pages. Navigation and footer links are added only when their destination is real and reviewed.
