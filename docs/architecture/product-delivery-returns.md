# Product delivery and return disclosures

## Current superseding delivery rule — 14 September 2026

The 10 September single-fee description below is retained as historical release documentation and no longer defines future checkout behavior. The approved current policy charges one destination base fee for the first distinct store and 50% of that base for every additional distinct store. Multiple products or units from the same store share that store's fee contribution. Examples at a Rs. 150 base are Rs. 150 / Rs. 225 / Rs. 300 / Rs. 375 for one through four stores.

New orders snapshot `base_plus_half_per_additional_store_v1`, the base charge, distinct-store count and final delivery amount. Eligible whole-store cancellation recalculates against remaining distinct stores; all-store cancellation removes delivery. Historical orders retain their recorded policy and amount. The cumulative local evidence and deployment hold are recorded in [consolidated local completion](consolidated-local-completion-2026-09-14.md) and [Babal maintenance](consolidated-babal-maintenance-2026-09-13.md).

## What changed locally

The shared product page now places a delivery calculator and return summary between the price/seller information and Add to cart. It replaces the old generic checkout-only delivery notice and the lower duplicate return summary. Existing product preparation details remain in the specifications.

Customers enter a full delivery district in English, using the same district input convention as checkout. No district means no displayed charge or arrival range, and no claim of free delivery. The existing manual tariff is unchanged: NPR 150 / 1–3 transit days for the Kathmandu Valley, NPR 180 / 2–5 transit days for the configured Terai districts, and NPR 250 / 3–7 transit days for other districts. These are the current checkout charges, not a live carrier quote. The existing district matching and nationwide fallback remain unchanged; accurate spelling matters. Full address details are collected at checkout.

`getDeliveryEstimate` wraps the existing `getManualDeliveryQuote`. For a product, it adds that product's preparation days to the transit range. For checkout, it adds the longest preparation time in the cart, because products can be prepared in parallel. The server reads current product preparation values again when creating the order and saves the resulting range on the shipment. Existing shipments and idempotent order retries keep their previously saved estimates.

Delivery continues to be charged once per order, without multiplying by quantity or seller count. Separate seller shipments can arrive separately. Product estimates describe that item; a cart containing slower items can have a later checkout estimate. Both interfaces explain preparation, separate arrivals and that estimates are not guaranteed dates.

Return eligibility combines the current marketplace change-of-mind setting and the product eligibility flag. The request window and visible-damage evidence window come from the existing policy. Seller-entered return conditions and exclusions are shown for both returnable and non-returnable products. Missing legacy terms are disclosed as having no additional item-specific conditions listed; no new restrictions are invented. Expandable guidance explains problem-item review, optional photos, late damage reports and the secure return-request path.

No policy values, policy versions, saved order return-policy JSON or item eligibility snapshots were changed. No migration is needed for this feature.

## Local verification — 10 September 2026

- 62 automated tests passed, including shipping-zone rates, preparation, mixed-seller/quantity charging, saved estimate retries and historical return snapshot preservation.
- TypeScript passed and the Babal standalone production build succeeded.
- MariaDB 11.4.9 integration passed on a disposable localhost database, including preparation-inclusive COD estimates, additive migrations/reimports, wallet/referral integrity, order-email queue concurrency and fulfillment/tracking. One initial run encountered a deadlock during concurrent testing; a fresh run passed. This remains an observed concurrency caveat in the existing test flow.
- Existing standalone HTTP checks passed for moderated review photos/replies, private tracking, wallet, checkout, Admin access, hostile-origin rejection, login/Google entry and hosting proxy behavior.
- Headless Chrome / Playwright passed at 1440×1000 and 390×844 against `http://127.0.0.1:43872`. Tested empty district, Kathmandu/Dhanusha/Dolpa charge changes, preparation-inclusive ranges, returnable/non-returnable disclosures, expanded guidance, Add to cart and matching checkout. No horizontal overflow or browser runtime/console errors were observed. Browser plugin skill was unavailable, so the bundled Playwright library used installed Chrome.
- A read-only independent code review found no substantive issues in the scoped feature.

The local runtime was Node.js 24.19.0; the deployment target remains Babal.Host Node.js 22.23.2 with `app.cjs`. Exact target-runtime execution and live external Google/SMTP flows were not verified locally. No production database, media, accounts, settings or website were changed. Live product behavior has not been verified for this release.

## Deployment when requested

Use `outputs/hastabazaar-product-delivery-returns-2026-09-10.zip`. It is a cumulative standalone build from the existing workspace and includes the preceding order updates, guest tracking, review photos/replies, authentication and promotional wallet/referral features.

1. On Babal.Host, back up the existing application, MariaDB database and media. Retain all existing cPanel environment values, authentication/Super Admin configuration, SMTP and Google settings. Never share credentials or session links.
2. Confirm the earlier referrals/wallet migration is already installed. In the existing database, apply the pending `deployment/babal/mariadb-order-updates.sql`, then `deployment/babal/mariadb-review-photos-replies.sql`. Both are included in this ZIP and preserve existing rows on repeat import. **Do not import the full schema or any reset SQL.** No additional delivery/returns migration is required.
3. Extract the ZIP contents directly into `/home2/hastabaz/hastabazaar-app`, replacing application code while retaining `private-media` (or configured `MEDIA_ROOT`) and existing environment configuration. There is no enclosing release folder. Do not delete the application root or use a synchronization option that deletes media. The package contains runtime dependencies; do not replace them with a development install.
4. Keep Node.js 22.23.2, startup file `app.cjs`, and the existing `APP_ORIGIN=https://hastabazaar.com`. Restart the cPanel Node application.
5. Verify health; password login, Google sign-in and email OTP; Super Admin access; COD; promotional wallet/referrals; and disabled deposits/withdrawals. Use authorized test accounts and purchases only. Confirm recent tracking/email/review functionality using the companion instructions below.
6. On desktop and mobile, check a ready-to-dispatch item, a made-to-order item and a non-returnable item. Test Valley, Terai and other delivery districts. Match the product quote to checkout, then test a cart with multiple sellers and different preparation times. Confirm one delivery charge and the longest preparation time. Old order receipts/tracking and return eligibility must retain their saved terms.
7. If rollback is necessary, restore the backed-up application code while keeping current database records, additive tables, media and environment values. Do not roll back the database over orders received after the backup. Restart and recheck health/authentication.

Order-email scheduling and mailbox verification: `docs/architecture/order-updates.md`. Review moderation and private-media verification: `docs/architecture/review-photos-replies.md`. Deployment has not been performed.
