# Order fulfilment and cancellation

## Seller workflow

Fulfilment is tracked on each order item, not only on the overall order. This allows sellers in a multi-vendor order to prepare their own products independently.

1. A confirmed order begins with every item in `confirmed`.
2. Each seller marks all of their items `packing`.
3. Each seller marks all of their items `ready_for_pickup` after the parcel is sealed and labelled.
4. The overall order becomes `ready_for_pickup` only when every seller's items are ready.

Seller endpoints always resolve the authenticated approved seller and update only order items belonging to that seller.

## Operations workflow

Staff with `order.manage` access can view the complete order, commercial totals, customer delivery details, seller items, shipment state, and immutable status history.

- A pickup-ready order can be marked dispatched only with a tracking or manual consignment reference and an operations note.
- A dispatched order can be marked delivered. For COD, this also records the payment as captured and the order payment state as paid.
- An order can be cancelled by operations before dispatch with a required reason.

Every transition checks the current order and item states, writes item/order/shipment events, and adds an audit record inside one D1 batch.

## Customer cancellation

A customer with the private receipt cookie may cancel while the order remains `confirmed`. This implements the Phase 1 rule that cancellation is free before packing. After a seller begins packing, the customer must contact operations.

Cancellation closes the order, COD payment, and shipment records. Each reserved product quantity is restored exactly once. State guards prevent a repeated request from restoring stock twice.

## Controlled-launch boundary

Dispatch uses a manually entered consignment reference. No Nepal Can Move request is sent until merchant credentials and authoritative API documentation are available. Delivery confirmation is an internal operational record; the provider webhook and reconciliation process remain future work.

Post-delivery cases do not rewrite item fulfilment. Returns, replacements, return-to-origin outcomes, refunds, and complaints are item-scoped in their own state machines, documented in `returns-refunds-complaints.md`. This keeps a partial return from changing unrelated sellers or their delivered items.
