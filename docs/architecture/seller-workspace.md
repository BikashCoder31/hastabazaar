# Seller workspace

## Scope

The English-only seller interface reuses the existing UI primitives and Hastabazaar theme. The dedicated workspace header, responsive navigation, active-route indicators, skip link, and loading state cover overview, orders, products, earnings, shipping, cases, analytics, notifications, and shop profile. Production publication and external integrations are not part of this update.

## Daily work and vendor boundaries

The overview uses whole-shop aggregate counts for confirmed orders to pack, orders being packed, pickup-ready orders, and listings needing changes. Counts use distinct order IDs for the authenticated seller, not the length of a capped recent-order list. Product and ledger summaries reuse existing owner-scoped repositories.

Seller order cards show the seller's own item status separately from the overall order. A mixed item status is shown explicitly rather than guessing a uniform state. Seller order-list queries no longer select customer email, customer phone, or the whole-order monetary total. The existing authorised order detail retains the contact information needed for fulfilment. Other sellers' item values and preparation states never enter the seller's subtotal or own-item status.

Order preparation still follows confirmed → packing → ready for pickup; Admin dispatch and delivery confirmation remain unchanged. Preparing one seller's items cannot update another seller's allocation.

## Product and stock management

Product rows retain review status, SKU, price, media, and requested revision notes. Stock controls have product-specific accessible labels, whole-number bounds, pending/error handling, and disabled controls for rejected, archived, or unknown states. Server ownership and optimistic-concurrency checks remain authoritative.

The submission form retains all compliance disclosures and photo validation. Revision uploads are additional images only, bounded by the five-photo maximum; existing images are not represented as replaceable. After revising, “Add another product” opens a new listing rather than trying to reuse the revised record.

## Finance and support

The payout form explains the configured minimum balance and prevents a second visible request while one awaits review. It retains its request identifier across retries, handles connection failures, and explains that a request is not a money transfer. Admin processing notes appear on requests. Payout preparation, independent Super Admin approval, immutable ledger entries, and verified off-system payment references are unchanged.

The seller shipping view has labelled outbound/return request fields, retry-safe request identifiers, recorded tracking/label references, and pickup windows in Nepal time. Pickup confirmation is offered only for a scheduled pickup and asks for confirmation of physical collection. These are internal coordination records, not carrier API calls. The Admin shipping console is unchanged.

Case responses show previously recorded seller text and do not claim a response exists merely because a case is closed to further responses. Private customer contact details remain excluded from case views. Profile and case-response forms recover from network errors without clearing entered text or staying pending.

## Analytics correctness

Delivered sales and units are aggregated directly from owned order items. Return count is calculated separately so multiple historical return cases on one item cannot multiply money or units. Analytics distinguish gross delivered sales from the payout balance. Monthly rows show up to 12 months containing deliveries, grouped by the existing UTC month query; inventory shows up to 50 lowest-stock listings. No missing months or data points are fabricated.

## Validation and remaining QA

TypeScript, lint, the production build, Drizzle metadata checks, and all 22 automated tests pass. New tests cover vendor-isolated summary counts, multi-vendor item status, order-list data minimisation, repeated-return analytics, payout availability, inventory affordances, and NPR/date presentation. Existing tests continue to cover returns, complaints, inventory/ownership boundaries, idempotency, and maker-checker payouts on fresh SQLite migration fixtures.

Local HTTP smoke checks return 200 for all ten seller entry pages; missing order/return/complaint details return 404. Guest seller access redirects to sign-in and its profile mutation returns 401; customer-role seller access redirects to access denied and its profile mutation returns 403.

All 21 existing migrations (0000–0020) also apply successfully to a separate clean local D1 database, leaving the active preview database untouched.

The active local preview has no populated sales catalogue or seller order journey, so hands-on responsive, photo upload, packing, case reply, and payout click-through testing with sample records remains necessary. Admin/Super Admin workspace improvements are the next UI stage. No new schema migration, production credentials, external service, or deployment was introduced.
