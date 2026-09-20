# Customer accounts and discovery

## Identity and ownership

Customer accounts use the Sites sign-in identity already used by staff and sellers. The stable authentication subject is linked server-side to one active `users` row. A matching email cannot be rebound when it already belongs to another authentication subject. Every new account receives the `customer` role, and all account mutations derive the user ID on the server.

Guest checkout remains available. Orders placed while signed in snapshot the same contact and delivery information as guest orders and additionally store `orders.customer_id`, which powers the account order list. Older guest orders are not automatically claimed by email because email alone is not sufficient proof of ownership.

## Customer workspace

The protected `/account` workspace includes:

- profile name and Nepal phone (the interface is currently English-only; bilingual-ready storage remains);
- account-owned order history;
- reusable Nepal delivery addresses with a default address;
- a durable product wishlist; and
- direct links back to secure order receipts;
- return, refund, complaint, reply, and pre-packing cancellation access without requiring the original guest cookie;
- in-app notification history, with external email/SMS queues kept separate; and
- access, correction, deletion, and retention-objection requests.

Saved addresses are owned by one customer. Update and delete statements always include that owner ID. Profile and address changes append audit records and accept idempotency keys.

Order receipts and aftercare accept either the unguessable guest receipt token or the authenticated `orders.customer_id` owner. Email alone never grants access. Privacy requests append immutable events; Admin can investigate, while a Super Admin must approve, reject, or complete them.

## Customer interface

`/account` is an overview with the customer's three most recent orders, saved-item and address counts, default delivery address, and help shortcuts. Profile editing is at `/account/profile`. The responsive account navigation highlights the current page and keeps orders, wishlist, addresses, in-app notifications, privacy, and support accessible. All data still comes from the authenticated customer ID; dashboard summaries do not claim a total from a capped order list.

Product details include an accessible thumbnail gallery and place price, availability, cart quantity, and wishlist actions before the full maker/material/care disclosures. Cart updates prevent concurrent UI mutations, show line totals, and provide a load retry. Checkout preserves stock validation, accepted terms, and its existing idempotency key while presenting saved addresses, delivery charges, COD payment, and progress more clearly. Choosing a new delivery address clears the previous district.

Customer receipts render their current status instead of always announcing confirmation, label the immutable total as the order total, and show each item's fulfilment status. Returns and complaints use separate expandable forms; return quantity is bounded to the selected item. Server-side policy eligibility, item ownership, guest-token access, maker-checker approval, and append-only records are unchanged.

Profile, address, wishlist, notification, review, and privacy forms handle network errors without getting stuck in a pending state. Address deletion has a confirmation and editing another address remounts the form with the correct values. Customer notifications display in-app messages; queued external messages are not presented as sent. Account loading, page-error, and not-found states provide a path to retry or continue browsing.

### Validation of the customer interface update

TypeScript, lint, Drizzle metadata checks, the production build, and all 17 automated tests pass. Workflow fixtures replay the append-only SQL migrations into fresh in-memory SQLite databases and exercise ownership, repeat submissions, and maker-checker controls. Receipt tests also verify each item's fulfilment status projection. No new migration is required for this interface update.

Local HTTP checks cover the account overview, profile, orders, addresses, wishlist, notifications, privacy, cart, checkout, and shop. Guest account access redirects to sign-in, an unauthenticated profile mutation returns 401, and missing receipts return 404. The local database currently has no published products or customer orders, so populated product/order screens, photo selection, and the complete customer click-through still require a hands-on test with local sample data. Nothing was deployed for this update.

## Reviews

A review can be submitted only when the authenticated customer owns a delivered order containing that exact delivered order item. One order item can produce at most one review. New reviews are pending until an Admin publishes or rejects them. Published reviews can later be hidden, and every moderation decision is appended to the audit log.

Public product pages show only published reviews and label them as verified purchases.

## Maker discovery

Approved sellers have a public maker page containing their public trading name, maker story, workshop district/province and published products. Legal, tax, identity and payout data never appear there. Sellers can edit public story, specialty, support and workshop fields; reviewed legal and payout fields remain locked.

## Catalogue controls

The shop supports safe text, category and occasion filtering plus newest, price and name sorting with bounded pagination. Admins can create, rename, order, activate or retire bilingual categories and occasions. They can also correct the category and 1–5 occasion assignments on an existing product. Taxonomy rows are retired instead of deleted so historical relationships remain intact.
