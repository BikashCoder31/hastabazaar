# Customer accounts and discovery

## Identity and ownership

Customer accounts use the Sites sign-in identity already used by staff and sellers. The stable authentication subject is linked server-side to one active `users` row. A matching email cannot be rebound when it already belongs to another authentication subject. Every new account receives the `customer` role, and all account mutations derive the user ID on the server.

Guest checkout remains available. Orders placed while signed in snapshot the same contact and delivery information as guest orders and additionally store `orders.customer_id`, which powers the account order list. Older guest orders are not automatically claimed by email because email alone is not sufficient proof of ownership.

## Customer workspace

The protected `/account` workspace includes:

- profile name, Nepal phone and English/Nepali preference;
- account-owned order history;
- reusable Nepal delivery addresses with a default address;
- a durable product wishlist; and
- direct links back to secure order receipts;
- return, refund, complaint, reply, and pre-packing cancellation access without requiring the original guest cookie;
- bilingual in-app notification history and queued email/SMS delivery status; and
- access, correction, deletion, and retention-objection requests.

Saved addresses are owned by one customer. Update and delete statements always include that owner ID. Profile and address changes append audit records and accept idempotency keys.

Order receipts and aftercare accept either the unguessable guest receipt token or the authenticated `orders.customer_id` owner. Email alone never grants access. Privacy requests append immutable events; Admin can investigate, while a Super Admin must approve, reject, or complete them.

## Reviews

A review can be submitted only when the authenticated customer owns a delivered order containing that exact delivered order item. One order item can produce at most one review. New reviews are pending until an Admin publishes or rejects them. Published reviews can later be hidden, and every moderation decision is appended to the audit log.

Public product pages show only published reviews and label them as verified purchases.

## Maker discovery

Approved sellers have a public maker page containing their public trading name, maker story, workshop district/province and published products. Legal, tax, identity and payout data never appear there. Sellers can edit public story, specialty, support and workshop fields; reviewed legal and payout fields remain locked.

## Catalogue controls

The shop supports safe text, category and occasion filtering plus newest, price and name sorting with bounded pagination. Admins can create, rename, order, activate or retire bilingual categories and occasions. They can also correct the category and 1–5 occasion assignments on an existing product. Taxonomy rows are retired instead of deleted so historical relationships remain intact.
