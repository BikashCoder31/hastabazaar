# R017 local implementation — 2026-09-13

Approved scope: one customer delivery charge per order; Super Admin-managed district/zone tariffs for future orders; actual courier cost per seller parcel remains operational expense only. Initial NPR 150/180/250 tariffs remain.

## Implementation

- New immutable delivery_rate_versions records and singleton delivery_rate_current pointer. Each version includes full zone rates/district overrides, creator, reason and timestamp. Both repository and HTTP handler reserve changes to active Super Admin. Saving uses a transactional current-version assertion; stale settings never overwrite a newer version. No per-order override endpoint exists.
- New /admin/delivery-rates page provides zone prices in NPR, optional district overrides, required reason and recent history. API uses same-origin checking, a 16 KB bounded body and no-store responses. Navigation is coordinated with the permissions agent.
- Product and checkout server pages load current configuration. District override wins over its existing zone. Preparation/transit estimates stay unchanged. Checkout explains the selected destination band and single-charge rule. Static shipping copy directs customers to product/checkout for current rates instead of publishing stale amounts.
- Public checkout requests carry the displayed deliveryRateVersion and must reload if absent or stale. Order creation locks/checks the current tariff inside the checkout transaction; a concurrent change rolls back inventory/order/cart operations. The order stores delivery_rate_snapshot_json and accepted terms include the selected tariff. Idempotent repeats return the existing order before consulting current rates. Historic rows remain null in the new column and all original prices remain unchanged.
- Existing shipping_jobs/shipping_parcels and parcel operation/idempotency/version checks are reused. No existing carrier-cost ledger was found; seller shipping_charge entries represent seller settlement, not an operational expense ledger. A dedicated immutable parcel_courier_costs record stores actual amount, evidence reference, actor, note and timestamp, linked to the existing parcel. Parcel administration shows accumulated costs and evidence records separately from COD. Cost-only operations return before any fulfillment, cash, receipt or seller earning calculation and do not send customer updates. No automatic customer surcharge or seller deduction.

## Migration and files

Apply drizzle/0032_delivery_rates_costs.sql to SQLite fixtures through the existing migration runner. Babal additive deployment/babal/mariadb-delivery-rates-costs.sql uses native triggers, repeat-safe seeds/table/column creation and preserves the current pointer on reapplication. Root coordinates release manifest/native test harness. No existing database was accessed.

Core files: lib/checkout/delivery-rates.ts, lib/db/repositories/delivery-rates.ts, lib/checkout/validation.ts, lib/db/repositories/orders.ts, lib/operations/parcels.ts; app/admin/delivery-rates/page.tsx, app/api/admin/delivery-rates/route.ts, components/admin/delivery-rate-settings.tsx, components/admin/parcel-controls.tsx; checkout/product pages and client forms, checkout/parcel API routes, lib/content/public-pages.ts.

## Verification and limits

Focused tests in tests/delivery-rates.test.ts run on disposable in-memory SQLite with real transaction rollback and the full migration chain. Checks cover original tariffs and district precedence, ordinary/revoked Admin rejection, stale saves, invalid rates, mixed-seller single charge, original immutable snapshot/idempotency after tariff changes, future order prices, concurrent save between quote and checkout commit with inventory/cart rollback, immutable courier costs, evidence visibility, duplicate retries and stale/negative cost rejection. An initial integration failure caught missing snapshot persistence and was fixed before delivery.

The existing returns/complaints suite was run: 41/42 passed at that point; its sole failure was the concurrent approved Others category addition requiring an expected-list update by root. Broad TypeScript/build/browser results are deferred to root after concurrent agents finish. No browser QA or native MariaDB verification is claimed by this subtask. No server startup, deployment, messages, live records, production connection, reset, checkout or commit was performed.
