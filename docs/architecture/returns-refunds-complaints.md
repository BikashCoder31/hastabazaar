# Returns, refunds, and complaints

## Scope and ownership

Post-delivery support is item-scoped. A return request belongs to one `order_item`, which preserves seller ownership and prevents one seller's case from changing another seller's fulfilment record. The original item remains `delivered`; return, refund, replacement, and return-to-origin progress lives in dedicated case records. The order payment state becomes `part_refunded` or `refunded` only after a refund is recorded as paid.

Customers use either the private receipt cookie or their authenticated account ownership link; email alone is never accepted as proof. Sellers authenticate through their approved seller profile and can read or respond only to cases whose item belongs to that profile. Seller case queries deliberately omit customer name, email, phone, and street address. Staff actions require the deny-by-default `support.manage`, `refund.approve.standard`, or `refund.approve.high_value` permission as applicable.

## Snapshotted eligibility

Checkout stores both the effective return-policy JSON on the order and the product's return-eligibility flag on each order item. Existing rows receive the Phase 1 snapshot through migration `0013`; migration `0014` permits sequential partial-quantity cases while preventing overlapping open requests in application logic. Future commercial changes require a new policy version and affect only new orders.

Eligibility is evaluated against `delivered_at` and the stored snapshot:

- Change-of-mind requests require an eligible item and must be inside the snapshotted general window.
- Wrong, damaged, defective, counterfeit, materially misdescribed, and unreasonably late goods retain statutory review even when the product is not change-of-mind returnable.
- Visible damage reported after the evidence window is marked for manual review, not automatically rejected.
- Photos are optional. Missing evidence alone cannot defeat a statutory claim.

The working high-value threshold is **NPR 10,000** (`1_000_000` paisa). It is policy configuration, not route logic, and should be owner-confirmed before production.

## Return workflow

1. A customer selects one delivered item, quantity, reason, refund or replacement preference, details, and up to five JPG, PNG, WebP, or PDF evidence files. The current interface is English-only.
2. Evidence bytes are stored in private R2 objects; D1 stores opaque object keys and verified metadata. Access is limited to the receipt holder, the owning seller, or staff.
3. The owning seller may submit one factual recommendation without seeing unrelated customer information. The seller does not decide the case.
4. Admin can request customer changes, reject, or approve a refund, replacement, or return-to-origin outcome and assign buyer, seller, carrier, or platform responsibility.
5. A refund at or above the snapshotted threshold enters `pending_high_value_approval`. A different Super Admin must approve or reject it; the proposing reviewer cannot self-approve.
6. Approved physical returns can move through `in_transit` and `received`. Operations can then complete the approved outcome.
7. Refunds move from `approved` to `processing` and then `paid` or `failed`. A paid seller-responsible refund creates exactly one negative seller-ledger entry. Liability allocation remains separately auditable for every responsible party.
8. Replacement and return-to-origin outcomes store manual references. No carrier API is called. Optional restocking and replacement stock consumption use the original item/product boundary and an exactly-once outcome guard.

Return creation, seller response, every review, high-value decision, physical movement, refund transition, and final outcome adds a `return_request_events` row and an `audit_logs` row. Idempotency keys have unique constraints. `return_outcomes` and the seller refund-ledger hook are unique per return/refund.

## Complaint workflow

Customers can create an order-wide or item-specific complaint in English. Safety complaints start at urgent priority. Item complaints snapshot the seller boundary so only that seller can respond, again without customer contact data. Bilingual-ready event fields remain populated with the English message until translation is re-enabled.

Staff can assign a case to themselves, investigate it, request customer information, escalate it to an active Super Admin, resolve it, reopen it, and close it. Customer replies move a waiting case back to investigation. Every change appends a bilingual-ready `complaint_events` record plus an audit record; case history is never updated or deleted in place.

## Controlled-launch boundaries

- COD refunds record a verified manual transaction reference; no bank, wallet, card, or carrier integration is guessed.
- Bank/wallet destination capture and verification are not implemented. Operations must use an approved off-system verification procedure before entering a payment reference.
- Manual outbound and return shipping jobs now record labels, tracking, pickup, transit, claims, and reconciliation per order/seller boundary. Live Nepal Can Move booking and webhooks remain blocked on the merchant contract and provider-issued documentation.
- Production Super Admin identity, policy publication, malware scanning, challenge-based abuse controls, notification delivery, accounting reconciliation, and legal retention schedules remain launch gates. Internal same-origin validation, file limits/signature checks, and D1 request throttling are implemented.

## Verification

`tests/returns-complaints.test.ts` applies every migration through `0020` to isolated clean SQLite databases and covers product disclosures, checkout policy acceptance, order/payment documents, request throttling, policy decisions, idempotent retries, cross-seller denial, Admin rejection, ordinary seller-liability refund completion, exactly-once stock/ledger effects, high-value maker-checker enforcement, complaint assignment, customer and seller responses, escalation, and resolution.
