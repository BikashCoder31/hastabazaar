# Approved billing formats and dual SKU integration

> Execution: main agent implements in the canonical checkout; separate GPT-6.1 Sol extra-high reviewers review code and test safety. User approved the invoice/receipt samples and requested implementation. No commits, pushes, migrations, seeding, resets, production actions, or real account/data changes during verification.

**Goal:** Use the user-approved Order Invoice and Receipt layouts for new documents, show both SKU values, and identify each item's supplier/store/legal seller in a single combined order invoice.

**Design:** Reuse existing product submission answer JSON and order document snapshot JSON. Existing platform SKUs remain immutable. New optional seller stock codes are validated, recorded with product submissions, and copied into new order snapshots. Missing historical values remain missing. Existing document numbers, snapshots, fees, agreements, and financial calculations remain unchanged. Old documents retain their historical renderer.

**Approved presentation:** Plain white/black print layout, company logo, billing@hastabazaar.com, www.hastabazaar.com, Gregorian Date, S.N.; Order Invoice has a compact header barcode, Order confirmation no., order placed NPT, payment mode/status, customer contacts, bill/delivery blocks, per-item Product/shop and references, platform/seller SKU, variant/quantity/prices/totals. No extra order-number line, BS date, fiscal year, registration number, VAT wording, prepared-by field, received/balance section, or sample footer. Receipt has no barcode and the company stamp only when HastaBazaar is the recorded issuer. Independent legal sellers have their own receipt identity and authorization area.

## Constraints

- Preserve launch baseline d9056dc10fee13dc11d15f24a14f63b003befe0b and canonical C:/Users/abinash/Desktop/HastaBazaar.
- Port 3018 was already occupied; keep existing server and only restart via npm run local:check then npm run dev if needed.
- Preserve local_staging/development, captured mail and simulated payments. Keep legal/accounting commercial activation guards; visual approval does not enable official tax issuance.
- No database schema migration. Form and document JSON extensions apply prospectively only.
- A combined order invoice contains all shops; seller receipts contain only the relevant legal seller's goods and allocated recorded amounts, without duplicating order fees/discounts.
- Receipt numbering uses per-issuer reservations in existing transaction/audit storage; never renumber old records or reset counters. New local-format sequences start at 01; commercial starting numbers remain subject to reviewed opening balances.
- Tests write only in-memory/temporary fixtures. Disable native/external browser test opt-ins and redirect FRONTEND_RECOVERY_EVIDENCE_ROOT to unique temporary storage.

## Tasks

- [x] Add behavior tests for validated optional seller SKU, product submission snapshot round-trip/clearing, immutable platform SKU, and legacy values.
- [x] Add code-owned productIdentity to product-only answer snapshots; wire seller field, revision/list/admin/catalog reads and checkout capture using allowlisted extraction. Preserve request replay and ownership guards.
- [x] Add versioned billing snapshot types/builders; capture stable line IDs, exact legal seller identity, both SKUs, variant/reference data, customer/address/contact, original prices and actual recorded monetary values at checkout.
- [x] Preserve new line metadata in cancellation-adjusted receipts and use one builder in direct/parcel fulfillment. Group per legal seller in the existing single payment receipt snapshot; implement retry-safe numbering in the same guarded batch.
- [x] Add shared approved invoice/receipt rendering, compact barcode and authenticated company stamp. Preserve historical routes/rendering and simulated/live readiness statuses. Update document labels/links so new records use one invoice format and per-seller receipts.
- [x] Add isolated local preview fixtures for desktop/mobile browser verification without real orders/account mutations.
- [x] Review focused tests, full isolated suite, lint, typecheck, build and local preflight. Independent code/test review, resolve findings, verify normal Chrome desktop/mobile, leave localhost:3018 running.

## Review focus

1. A changed/deleted product or seller must not change an issued document.
2. Cancelled lines, partial returns, wallet credit and platform vouchers must preserve identity and avoid double discounts or duplicated fees.
3. Missing old seller codes, legal identity, billing address or clearance must never be invented.
4. Wrong customer/order/document/group and public stamp access remain denied server-side.
5. Number reservation replay, concurrent issue and transaction rollback preserve per-issuer sequences and old records.

## Decisions implemented after review

- New operational orders record `pending_clearance`; official numbering/stamping cannot activate from a personal PAN, business PAN or visual template approval. Only explicit simulated fixtures reserve new sequences, starting at 01 per issuer.
- Registered-only orders retain a separate company receipt for delivery/service charges. The allocation is operational evidence pending accountant approval; it does not make HastaBazaar the legal seller of independent goods.
- Unsupported or incomplete issuer/discount evidence retains an aggregate operational payment receipt, with a printed review notice. Money capture continues without inventing a tax bill.
- Receipt discount/credit groups sum sealed line allocations from the existing COD/cancellation helper. No fee, commission or payout arithmetic is changed.
- Product answer revision ordering is server owned, including two edits in the same millisecond. Clear means clear; missing historical stock codes stay missing.
- Existing simulated invoice records and adjustments remain accessible historically; new approved-format orders do not create a second legacy invoice.
