# Local marketplace testing — 8 September 2026

## Scope

Interactive testing of the existing Customer, Seller, Admin, and Super Admin interfaces on `http://localhost:3000`, followed by local HTTP authorization/retry checks and read-only D1 verification. Earlier fixture preparation and account/catalog checks occurred on 7 September. No deployment, real shipment, payment, staff invitation, or external notification was made. Existing source changes were preserved; this report does not implement the findings below.

## Retained local fixtures

- Customer: Maya Customer (`local-test-customer`); saved address labelled `QA Home 2026-09-07`, with fictional contact details and locality `LOCAL QA ONLY - do not deliver`.
- Seller: Janakpur Craft Studio (`local-test-seller-profile`).
- Published product: `LOCAL QA - Straw Tote`, SKU `LOCAL-QA-20260907-TOTE`, ID `8c82c07a-b9ee-4716-a1a2-73414ccc076a`.
- Pending product: `LOCAL QA - Embroidered Clutch`, SKU `LOCAL-QA-20260907-CLUTCH`; deliberately not published.
- Order: `HK-20260908-C1B672DEA8`, ID `22387b90-0b40-4597-8c48-f937c389ef1a`.
- Return: `RET-20260908-4ED9E3C3`, ID `eb7d7749-ac23-47ce-af62-eb8e4b2f4260`.
- Complaint: `CMP-20260908-E8C714A9`, ID `283d882e-9e6d-4031-86f3-8708e5754d1d`.
- Published three-star review: `LOCAL QA - review moderation test`, explicitly described as synthetic and not a real recommendation.

These records remain in the active local database for inspection. They must not be promoted into production data.

## Browser workflows passed

1. Local role switching for all four roles. Customer access to Seller workspace was denied. Super Admin could view Staff access; ordinary Admin was redirected to access-denied.
2. Saved customer address creation and persistence, default-address use at checkout, wishlist persistence, and durable cart with two units across the pause.
3. Seller empty-product-form validation, inventory change from 8 to 9, Admin review note validation, separate review/approval/publication steps, and moderation history. Product fixture photo upload used the local API, not the browser file chooser.
4. Shop excludes the pending product. Wedding occasion filter and ascending-price sort produced the correct empty result; clearing filters restored the published product.
5. Checkout placed one COD order: 2 × NPR 1,500 + NPR 180 delivery = NPR 3,180. Order confirmation, accepted-policy version, order statement, and customer order-list entry appeared.
6. Return form was unavailable before delivery.
7. Seller confirmed packing and ready-for-pickup through confirmation dialogs. Admin queue and order history reflected both transitions.
8. Admin dispatch rejected a missing note. Simulated dispatch and delivery succeeded; shipment became delivered, COD became paid, and a payment receipt link appeared. No live carrier call or payment transfer occurred.
9. Customer requested a damaged-item refund for **one of two units**, without evidence. Seller case pages omitted customer contact/address fields. Seller acceptance moved the case into investigation without granting final approval.
10. Admin approved NPR 1,500 with seller responsibility. Return moved through in-transit, received, refund-processing, and paid/resolved. Zero units were restocked because the test return was damaged.
11. Customer created an item-linked packaging complaint. Admin assigned and escalated it; Super Admin resolved it with a required resolution message. Customer could see the resolved complaint and paid refund.
12. Seller finance showed NPR 3,000 gross delivered sales, NPR 360 commission, NPR 1,500 refund liability, and policy holds. Payout request remained unavailable with the current balance.
13. Delivered-purchase review submission entered moderation; Admin publication made the labelled three-star review visible on the product page.
14. Order-confirmation notification appeared and could be marked as read.

## HTTP and database checks passed

- Guest POSTs to order fulfilment, return operations, and high-value refund approval: **401**.
- Customer and Seller POSTs to those same staff endpoints: **403**.
- Ordinary Admin high-value approval POST: **403**.
- Cross-origin return mutation: **403**.
- Refund completion retried with the original idempotency key: **200**, without repeating its effects.
- Refund completion with a new key after completion: **409**.
- Delivery attempted again after delivery: **409**.
- After retries, D1 still contained exactly **1 refund, 1 return outcome, 1 refund ledger entry, 7 return events, and 1 delivered order event** for these fixtures.
- Inventory remained **7**: 9 before checkout minus 2 ordered; damaged return restock was 0.
- Order status remained `delivered`, payment state was `part_refunded`, original total was **318000 paisa**, refund was **150000 paisa**, and the seller refund ledger entry was **-150000 paisa**.

## Findings requiring fixes

1. **Partial-refund receipt presentation.** `lib/commerce/order-presentation.ts` handles `paid` and `refunded` but not the actual `part_refunded` state. After a partial refund the receipt falls back to “Cash on delivery” and the generic “No online payment has been taken” notice, losing the collected/refunded summary. The case correctly shows the paid NPR 1,500 refund; persisted amounts and payment state are correct. Add explicit partial-refund presentation and regression coverage.
2. **Admin denial wording.** `/admin/team` correctly denies ordinary Admin, but `/staff-access-denied` says the account has no staff access. Distinguish insufficient permission from absence of any staff role, and offer a return to authorized operations.
3. **Case form accessible names.** The `Field` wrappers in `components/admin/return-case-actions.tsx` and `components/admin/complaint-case-actions.tsx` render standalone labels without associations. Browser accessibility inspection exposed unnamed decision, amount, reference, note, message, and resolution controls. Associate labels with unique control IDs and verify keyboard/screen-reader use.
4. **Incomplete in-app lifecycle notifications.** Only the initial order confirmation appeared after dispatch, delivery, return/refund completion, and complaint resolution. The inspected fulfilment/returns/complaints repositories did not enqueue notification messages. Add local in-app lifecycle notifications with recipient boundaries and idempotency; email/SMS delivery remains a separate external-integration gate.

## Automated validation

- `tsx --test tests/*.test.ts`: **27 passed, 0 failed**.
- `tsc --noEmit`: passed.
- `oxlint`: passed.
- `drizzle-kit check`: passed.
- `vinext build`: passed. Non-blocking plugin-timing and route-classification notices were emitted.
- All **21 migrations, 0000–0020**, applied successfully to a separate clean local D1 store at `.wrangler/local-qa-clean-20260908`. The active test database was not reset.
- Clean-store migration count was 21 and `PRAGMA foreign_key_check` returned no violations. The local D1 interface rejected `PRAGMA integrity_check` as unauthorized, so a full integrity check is not claimed.

The existing automated suite covers multi-seller ownership, high-value independent approval, payout maker-checker controls, complaint replies, replacements/return-to-origin, eligibility decisions, and exactly-once effects. Passing tests do not cover the newly observed presentation/notification gaps.

## Still to test interactively

- Evidence file chooser/upload, invalid file rejection, and private evidence access across roles.
- Two independent sellers in one browser-created order; this walkthrough used two units from one seller.
- High-value refund proposal and independent Super Admin approval; this refund was below the NPR 10,000 threshold. Ordinary Admin API denial was tested.
- Full payout preparation/approval/reconciliation using eligible, safely isolated fixtures; current seller balance and hold periods prevent this live-local walkthrough.
- Cancellation/stock restoration, replacement and return-to-origin branches, late/ineligible returns, change requests/customer replies, complaint reopening/closure, and review rejection/hiding.
- Wider keyboard, screen-reader, mobile/desktop breakpoint, and browser coverage. A current-window screenshot check is not a full responsive/accessibility audit.

## Environment interruptions

The preview/browser was suspended or stopped across pauses. The existing server was restarted on port 3000 without resetting D1/R2. The original in-app tab was reused until it no longer existed; a replacement local testing tab was then opened. The checkout loading state eventually completed without a source change; it was not confirmed as a persistent application failure.
