# Phase 1 marketplace rules

Status: approved working baseline  
Policy version: `phase-1.0`  
Effective for implementation from: 2026-09-05

These are configurable launch defaults. Every future commercial change must create a new effective-dated policy version. An order keeps the exact fee, tax, return, and payout terms that applied when it was placed.

## Market and experience

- Operate throughout Nepal, with seller acquisition and delivery operations prioritised in the Terai during launch.
- Use Nepalese rupees (NPR) only. Store money as integer paisa; format it as NPR at the interface boundary.
- Support English (`en-NP`) and Nepali (`ne-NP`) from the first release. English is the working default until the owner confirms otherwise.
- Accept addresses and searchable names in both Latin and Devanagari text.
- Operate as an intermediary multi-vendor marketplace. A Hathkriti-owned store is disabled for Phase 1 but may be introduced later without changing the vendor model.

## Tax and invoicing

- Launch in PAN mode. Hathkriti must not collect or represent VAT until VAT registration is complete and a Super Admin activates a new tax-policy version.
- Keep Nepal's current 13% standard VAT rate as inactive reference data only. Revalidate it with the Inland Revenue Department before VAT activation.
- Display the customer's final product price and all delivery or other charges before order confirmation.
- Generate a sequential invoice and payment receipt containing the legal business name, PAN/VAT number as applicable, invoice and order numbers, date, item details, quantity, price, discounts, delivery charge, total, and payment method.
- Obtain Nepal-qualified accounting and legal review before accepting production orders.

## Roles and control

The system has four roles: Customer, Seller, Admin, and Super Admin. Exact permissions live in `lib/marketplace/permissions.ts`.

- Customers manage only their own profile, orders, complaints, and seller application.
- Sellers manage only their own profile, draft listings, stock, fulfilment, and financial statements. They cannot publish directly.
- Admins review sellers and products, manage categories and orders, resolve support cases, approve ordinary refunds, and prepare payouts.
- Super Admins control admin access, permissions, tax and commercial policies, legal publishing, integrations, high-value refunds, seller suspension, and payout approval.
- No person may approve their own submission or financial action. Payout preparation and approval require different people.
- High-risk actions require a reason, a second approval, and an append-only audit event.

## Seller approval

Workflow: `draft -> submitted -> under_review -> needs_changes -> approved/rejected -> suspended`.

Collect and privately verify:

- legal and trading names, phone, email, and full address;
- business registration certificate and registration number;
- PAN certificate, or VAT certificate if the seller is VAT registered;
- authorised representative identity and authority;
- verified bank account or supported wallet for payouts;
- grievance, return, refund, and warranty details;
- acceptance of the current marketplace seller agreement.

Sensitive documents are never public. Access to them must be permission-controlled and audited. Approval expires for re-verification when core legal, tax, ownership, or payout details change.

## Product approval

Workflow: `draft -> submitted -> under_review -> needs_changes -> approved -> published/rejected -> archived`.

Every listing must provide the information applicable to that product: name, accurate description and images, category, final price, inventory, maker/producer, country of origin, materials, dimensions, care/use/safety instructions, delivery estimate, return eligibility and conditions, warranty, manufacture/expiry dates, and any required licence.

Admins check prohibited or regulated goods, misleading claims, image ownership, price clarity, duplicate listings, quality, and completeness. Critical edits such as identity, materials, price, safety claims, licences, or origin return a published listing to review. Stock-only updates do not.

Seller and product self-approval is prohibited. Sponsored ranking is disabled at launch; if introduced later, it must be clearly disclosed to customers and must not create undisclosed discrimination between comparable sellers.

## Fees

- Seller commission: **12%** of the item subtotal after seller-funded discounts. It excludes delivery charges and taxes.
- Customer platform fee: **NPR 0** at launch.
- Digital payment gateway cost: absorbed by Hathkriti during launch.
- Delivery price: shown separately to the customer and passed through according to the carrier quote.
- Featured placement fee: disabled.

All percentages and fixed fees are configuration, not constants scattered through checkout code. Changed terms apply only to new orders after their effective time.

## Payouts

- A seller balance becomes eligible seven calendar days after confirmed delivery, subject to unresolved claims.
- Payouts run weekly. The minimum is NPR 1,000; smaller balances carry forward.
- For a seller's first 90 days, hold a 5% rolling risk reserve and release each reserve amount after 30 days if no claim, refund, chargeback, or return-to-origin liability is open.
- Seller payout equals item subtotal after seller discount, less commission, reserve, seller-responsible refunds, return-to-origin or delivery costs, and authorised adjustments, plus released reserve.
- Every amount is an immutable ledger entry. Admin prepares a payout; Super Admin approves it; only confirmed provider/bank evidence may mark it paid.

## Cancellation

- Customers may cancel without charge before packing begins.
- After packing but before carrier pickup, cancellation may be accepted; any actual preparation charge is allowed only when disclosed before purchase.
- After dispatch, use the return/return-to-origin process and refund after receipt and inspection.
- Seller-caused cancellation counts against seller quality metrics. Three repeated seller cancellations trigger administrative review; fraud or safety concerns may trigger immediate suspension.

## Returns and refunds

- Wrong, damaged, defective, counterfeit, materially misdescribed, or unreasonably late goods qualify for full refund or replacement, including applicable tax. Statutory consumer rights always override shorter marketplace windows.
- Ask customers to report visible delivery damage or wrong items within 48 hours with photos where reasonably possible. Lack of a photo does not automatically defeat a valid statutory claim.
- General return requests are accepted within seven days of delivery. Change-of-mind returns require an eligible, unused item in original condition; the customer pays return delivery.
- Customised, perishable, intimate/hygiene, or customer-damaged products are not change-of-mind returnable, but remain returnable when defective, unsafe, counterfeit, or not as described.
- Refund the original delivery charge when the seller, platform, or carrier is at fault. Otherwise it is not refundable.
- Initiate an approved refund within two business days after required inspection. Set the customer expectation to 5–10 business days for digital-payment reversal and 3–7 business days for COD refund to a verified bank account or wallet.
- Working high-value refund threshold: **NPR 10,000**. This is configurable and requires a different Super Admin to approve the Admin proposal. Confirm the threshold before production launch.

## Shipping

- Nepal Can Move is the intended initial delivery partner for nationwide delivery, COD, and tracking.
- Hathkriti remains responsible to the customer for delivery even when the carrier performs it.
- Build against the generic interface in `lib/shipping/provider.ts`, keeping manual shipment handling and future carrier adapters possible.
- Do not use guessed or unofficial Nepal Can Move endpoints. Complete merchant onboarding and obtain provider-issued API/webhook documentation first.
- Shipping must support serviceability checks, transparent quotes, pickup, labels, tracking events, cancellation, return to origin, COD settlement, retries, and reconciliation.

## Operational rules

- Preserve invoices, order events, agreements, moderation decisions, complaints, refunds, and payout ledgers according to the legally reviewed retention schedule.
- Keep personal and seller verification data private, encrypted where appropriate, least-privilege controlled, and access logged.
- Allow users to view, correct, and request deactivation of identity-related data, subject to legal retention duties.
- Use one complaint record with owner, timestamps, evidence, status, resolution, and escalation path.
- No production credential, identity document, or bank detail belongs in source control.
