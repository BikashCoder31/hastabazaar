# Hastabazaar redesign release notes

## Super Admin

- Today brings open tasks, owners, order stages and system checks together. The sidebar groups work by purpose and puts related pages in tabs. Page help sits beside the title.
- Orders and Dispatch show the parcels, courier responsibilities and next action more clearly. Delivery partners and parcel problems have dedicated views. Rider tools stay parked.
- Dispatch can book with Nepal Can Move (NCM) after the owner connects it and confirms the pickup branches. Staff can review the parcel details, print the label, or check the NCM portal when a booking response is unclear. Both couriers can be booked by hand. Today shows NCM follow-ups and warns when the scheduled check falls behind.
- Money has separate work for courier cash and bank transfers. Bank transfer review puts the customer claim next to the order and separates marking a matching bank credit from releasing an order to the seller. Approved unpaid payouts can be exported for verified bank destinations after fresh Super Admin verification. The read-only Money profile can review those money pages without approval or payment controls.
- The seller desk brings application and shop records together. Product moderation can open an unpublished preview. Categories and occasions support separate English and Nepali names. The email preview shows what customers and sellers receive.

## Sellers

- Seller Studio shows what needs doing on Today, Orders and Requests & help. The shop checklist says who acts next and links to the relevant step.
- Sellers can start an application, save progress, verify an email address and send the agreements before uploading optional documents. Before approval, Seller Studio shows the status and what to add.
- Add a product guides sellers through the listing and preview. Order packing includes parcel weight when the related database change is available. Earnings shows commission, the hold and payout schedule from settings.
- Verified NCM pickup, delivery and return updates appear on the seller's order. The seller prepares and packs the parcel using the existing Dispatch handoff.

## Customers

- Search offers suggestions from the published catalogue. The homepage, category, occasion and maker pages offer more ways to find products. The familiar storefront header remains in use.
- The bag and checkout group items into seller parcels. Customers can see delivery, payment and cash due per parcel, and a bank-transfer order shows its deadline and how to submit a payment claim.
- Account pages bring together the customer's next actions, parcel progress, documents, returns, refunds, rewards and settings. The phone tabs keep Home, Shop, Saved, Bag and You within reach.
- NCM parcels show their courier reference and verified progress in the order and tracking views. Checkout uses the delivery prices configured by Hastabazaar.

## Database changes

| Change | What it makes available |
| --- | --- |
| 0164 | Turn on a confirmation call for an individual customer's cash-on-delivery orders. |
| 0165 | Record and filter why a courier delivery failed. |
| 0166 | Add private staff notes to a seller record. |
| 0167 | Record who caused a cancellation and count seller-caused cancellations in the seller score. |
| 0168 | Record packed weight on products and seller parcels and show it in Dispatch. |
| 0169 | Show occasion groups and season dates when the data is set. |
| 0170 | Upload and assign an occasion image. |
| 0171 | Manage delivery partners and record the chosen partner on parcels. |
| 0172 | Store NCM connection setup, pickup branches, bookings, usage, webhook receipts and courier notes. Apply after 0171. |

The owner applies the MariaDB companions separately in order. 0164 needs a writer pause. Before applying any file, run the schema report generated from the exact release manifest and follow the apply instructions. The guarded features stay hidden or use their existing fallback while their schema is unavailable. [Release prep board](release-prep-board.md)

## Settings to confirm

| Setting | Expected for this release |
| --- | --- |
| Customer Platform service fee | Off in Business settings. A new checkout has no service-fee line. |
| Independent seller commission | 12% in Business settings and Seller Studio Earnings. |
| Payout processing weekday | Wednesday in Business settings and Earnings. Check the next date against the configured cutoff and hold. |
| Checkout contact policy | `CHECKOUT_CONTACT_POLICY=email_only`. Checkout verifies email and accepts a delivery phone without an SMS code. |
| Company bank account | Review the intended active destination and confirm its instructions appear on a new bank-transfer order. |
| Delivery rates | Review configured routes and charges and compare a checkout quote for a supported address. |
| Nepal Can Move (optional) | Set the protected app credentials, verify Test connection and confirm each pickup branch. Set both webhook URLs and schedule the 15-minute check. Keep Upaya in By hand mode. |

The [NCM API board](ncm-api-board.md) has the protected environment, webhook and schedule instructions. A verified NCM cash collection waits in Courier cash for staff to match the transfer.

## Smoke tests

Use approved test accounts and test orders on a non-live copy for the flows that change data. Check the main journeys at 390 and 1440 px.

1. Sign in as Super Admin. Open Today, Legal & procedures, Sellers, Dispatch and the Money tabs. Open an old bookmark. Check the permission-denied view, verify that staff two-step authentication is active, and confirm the Money view-only account has no write controls.
2. Find a product and place a two-seller cash-on-delivery order. Confirm the fee, delivery and cash totals. With 0164 present, enable a confirmation call for the test buyer and confirm the seller sees the order only after the call is recorded.
3. Pack and dispatch a parcel with a weight. Record a courier failure reason, retry, mark it delivered and match the courier cash. Verify the reason and status on the customer order. Cancel a separate unfulfillable parcel and check how it appears in the seller score and Business report.
4. Place a bank-transfer order and submit a claim. As Super Admin, record a matching credit, confirm the bank statement and release the order. Check the seller's To prepare list and the customer's payment notification. Try a short payment on another test order and verify that it stays unpaid.
5. Review an approved payout with a verified bank destination. Confirm fresh sign-in is required for the CSV and downloading leaves the payout unpaid. Check the next payout date in Seller Studio.
6. Apply as a new seller, leave and return to the saved application, verify email, submit and open the checklist. As Super Admin request a clearer document. As the seller upload it and reply. Approve the applicant and send the first product for review. Open its preview as the seller and Super Admin.
7. Open My orders. Answer a seller date question, cancel an eligible parcel and open a return or problem request. Check the customer can reply to a request for more information and follow the refund. Confirm receipts, invoices, financial notices and account settings still open.
8. Review the company bank, delivery and payout settings. Check the homepage editor, bilingual catalogue names, occasion images and all staff email previews. Make sure the subject uses `·` and the main button opens the right page.
9. Verify that the extracted production package starts and that its local test pages and role switch are inactive. Use the host's readiness procedures for the hosted security and runtime checks.
10. With migration 0172 present, use an isolated NCM fixture to verify connection, pickup mapping and API booking. Check label printing, recovery after a lost response, the webhook and scheduled status check, and the customer and seller timelines. Verify collected COD remains in Courier cash until staff match the transfer. Follow the NCM board for the owner's one real test parcel before enabling customer bookings.
