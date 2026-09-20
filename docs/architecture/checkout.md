# Cart and COD checkout

## Customer flow

Visitors can add published, in-stock products to a durable guest cart. The cart is identified by an opaque, HTTP-only, same-site cookie; the database stores only its SHA-256 hash. A cart supports at most 20 different products and 10 units of one product.

Checkout collects a Nepal delivery address, customer email, and contact number. The customer must accept the marketplace, privacy, cancellation, and return terms. Phase 1 checkout offers cash on delivery only, so no card, wallet, or bank credentials are requested or stored.

## Commercial rules

- Currency: NPR, stored as integer paisa.
- Buyer platform fee: NPR 0.
- Tax collected by the platform: NPR 0 while operating under the current PAN policy.
- Seller commission: 9% by default, loaded from the marketplace setting and snapshotted on each order item.
- Kathmandu Valley provisional delivery: NPR 150, estimated 1–3 days.
- Terai priority districts provisional delivery: NPR 180, estimated 2–5 days.
- Other Nepal districts provisional delivery: NPR 250, estimated 3–7 days.

These delivery rates are controlled-launch defaults. Replace them with carrier-issued serviceability and quotes after the Nepal Can Move merchant contract is signed.

Delivery is based on distinct stores, not product quantity. Products from the same store share one destination base fee. Each additional distinct store adds 50% of that same base fee: a Rs. 150 destination is Rs. 150 for one store, Rs. 225 for two, Rs. 300 for three and Rs. 375 for four. The server counts stable seller identities, calculates the authoritative amount, and snapshots the pricing policy, base fee, store count and charged fee on the order. Historical orders keep their recorded delivery policy and amount.

After an eligible whole-store cancellation, new-policy orders recalculate the delivery fee from the distinct stores still present: three stores to two becomes Rs. 300 to Rs. 225, two to one becomes Rs. 225 to Rs. 150, and cancelling all stores removes delivery. Legacy orders without the new snapshot retain their recorded delivery accounting. The above ranges are transit time; product pages, checkout and newly created shipments include product preparation time. The full-order estimate uses the longest preparation time in the cart. Estimates are not guaranteed, and seller shipments may arrive separately. See [product delivery and returns](product-delivery-returns.md) for the shared calculation and current release boundary.

## Integrity and privacy

Every checkout has an idempotency key. Retrying the same request returns the same order instead of creating a duplicate. Database triggers verify that every product remains published and in stock, then reserve inventory inside the same D1 batch that creates the order. A failure rolls back the complete order. High-frequency checkout attempts are also bounded by a D1-backed fixed-window limit keyed by a one-way request fingerprint.

The customer must affirmatively accept the displayed cancellation, return, privacy-use, and support terms. The accepted policy version, exact English snapshot, acceptance method, actor when signed in, request ID, and timestamp are written to `order_policy_acceptances` in the same batch as the order. The record is append-only and unique per order.

Order receipt access requires both the order number and a separate HTTP-only receipt token. The database stores only the token hash. Customer details are available only on that receipt and inside protected operations views.

The order snapshots product names, seller names, prices, commission, policy version, and delivery address so later catalogue or policy edits cannot rewrite historical commercial terms.

## Launch boundary

Order creation produces a confirmed COD order, a pending manual COD payment record, a pending manual carrier shipment, an immutable order statement snapshot, and an audit/status event. Confirmed delivery and COD collection create a separate immutable payment-receipt snapshot. Customers can print either document or save it as PDF from the secure order page. These operational documents are clearly marked as not being PAN/VAT tax invoices; legal tax invoicing remains disabled until the company identity and approved invoice format are configured. The workflow does not contact a carrier, collect money online, or send transactional email.
