# Commerce data model

Hathkriti uses Cloudflare D1 for structured marketplace records and R2 for product images and private seller documents. The logical bindings are `DB` and `MEDIA`.

## Main ownership boundaries

- Identity: users have one or more roles. Authentication subjects remain provider-neutral until the public customer authentication path is selected.
- Sellers: a seller profile belongs to one user; legal documents live privately in R2 and only metadata/object keys live in D1.
- Catalogue: sellers own products, products belong to one category and 1–5 normalized gift occasions, publication is controlled by moderation state, and only verified order items can create customer reviews.
- Commerce: an order snapshots customer, product, seller, policy, fee, tax, and address information so later edits cannot change transaction history.
- Fulfilment: shipments and provider events are separate from orders so Nepal Can Move can be replaced or supplemented.
- Finance: payments, refunds, seller ledger entries, payout batches, and payout evidence remain separate and auditable.
- Customer discovery: saved addresses and wishlist items are customer-owned; product reviews are tied to one delivered order item and moderated before publication.
- Governance: policy versions, moderation decisions, complaints, and append-only audit events preserve who changed what and why.

Returns are item-scoped. Orders snapshot the effective return policy and order items snapshot product return eligibility. Private evidence bytes live in R2 while `return_evidence` stores metadata. `return_request_events`, `complaint_events`, refund-liability entries, and audit logs are append-only. A unique final `return_outcome` prevents repeated stock or replacement effects.

Seller finance is ledger-based. Delivered order items append sale, commission, and applicable reserve entries; refunds and paid payouts append separate negative entries. `payout_entries` locks available ledger entries to a prepared payout while retaining released associations after rejection. Payout state changes append `payout_events`, and maker-checker constraints prevent the preparer from approving the same settlement.

## Data rules

- IDs are application-generated UUIDs. Public order, complaint, and payout references use separate human-readable numbers.
- All money is integer paisa and every transaction currency is explicitly NPR.
- Times are UTC epoch milliseconds; the interface renders them in `Asia/Kathmandu`.
- JSON is used only for immutable snapshots and policy documents, not for relational records that need querying.
- R2 object keys are unique, opaque, and never expose original identity-document filenames.
- Seller document uploads are size-limited and signature-checked as PDF, JPG, or PNG before private storage. Production security review must still add malware scanning and upload abuse controls.
- Payment creation, carrier webhooks, and other retryable integrations require idempotency keys.
- Schema changes are generated with Drizzle and committed as append-only migrations. Production never creates tables during a request.

## Authentication boundary

The database is ready to associate a user with a stable external authentication subject, but no customer authentication provider is hard-coded yet. Public marketplace authentication must support ordinary Nepal customers and sellers; ChatGPT-only sign-in is therefore not being used as the storefront identity system. Authorization is always checked server-side against `user_roles` and the permission matrix.
