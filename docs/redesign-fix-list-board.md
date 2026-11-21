# Hastabazaar Batch 3 fix list

Fix list complete — ready for your review

Base commit `086a930` on `admin-redesign`. The checked preview uses the canonical checkout at `http://localhost:3018`. Select existing Super Admin and Seller fixtures through `/local-testing` in separate browser sessions. Use isolated fixtures for data changes and schema-state tests.

| Task | Owner | Waits for | Status | Commit | Checks |
| --- | --- | --- | --- | --- | --- |
| F0 · Small fixes | fix_f0 | — | Done | `025688a` | Typecheck, lint and 97 focused checks passed. 80 rendered views passed at all four widths. 140 first-document logo checks passed. |
| F1 · Customer COD confirmation | fix_f1 | F0 | Done | `042c291` | Typecheck, lint and 38 focused checks passed. 36 four-width browser measurements passed across the checked preview and applied-state fixture. Checkout hold, confirm, native cancellation and bank exclusion verified. |
| F2 · Delivery failure reasons | fix_f2 | F1 | Done | `0d16dc7` | Typecheck, lint and 87 focused checks passed. Missing-column preview and structured failure, filter and retry fixture passed all four widths. |
| F3 · Private seller notes | fix_f3 | — | Done | `aa89b16` | Typecheck, lint and 23 focused checks passed. Missing-table preview and populated fixture passed all four widths. Add, pin, unpin, audit, restriction timeline and access denial verified. |
| F4 · Cancellation cause | fix_f4 | F2 and F3 | Done | `4f373a9`, `f3687ae` | Typecheck, lint, 94 focused checks, 12 checked-preview measurements and 164 populated fixture measurements passed. The Business report CSV recorded one Seller cancellation. |
| F5 · Packed parcel weight | fix_f5 | — | Done | `ca1724f` | Typecheck, lint and 26 focused and regression checks passed. The checked preview and populated product, packing and Dispatch views passed all four widths. |
| F6 · Payout bank file | fix_f6 | — | Done | `1804282` | Typecheck, lint and seven focused checks passed. Checked preview and populated download fixture passed all four widths. CSV, exclusion list, fresh sign-in and audit verified. |
| F7 · Unpublished product preview | fix_f7 | — | Done | `5608c43` | Typecheck, lint and 49 focused checks passed. Seller and Super Admin preview fixtures passed all four widths. Actual local unauthorized preview returned 404, noindex and no-store. |
| F8 · Money view-only role | fix_f8 | — | Done | `3f9325b` | Typecheck, lint and 14 focused checks passed. Team plus six routes passed all four widths. Tested Money actions returned 403 for the view-only role. |
| FINAL · Whole-project verification | Main agent | F0–F8 | Done | `90e48d4` verified | Typecheck, lint, local preflight and 76 browser measurements passed. The full suite finished with 5,728 passing and 38 skipped. Three fixture failures, reported as four including the parent test, passed in the final focused rerun. |

Every task requires fresh typecheck, lint, focused tests and browser evidence before its local commit. The main agent coordinates edits to shared files and updates this board.

## For the owner

### F0 preview and fee display

- The eager mark was present in the first document at 390 and 1440 px on 70 reachable Admin and Seller Studio routes. The checked preview's `/local-testing` session followed a sign-in redirect loop on `/admin/legal-policies` and `/admin/legal-policies/active`. Both protected pages and their eager mark passed at 390, 768, 1024 and 1440 px in a disposable, authorized session. In 80 primary rendered views, the image had loaded by the document load event and the header fit. A cold first contentful paint can precede image decoding by a frame.
- The disposable Off fixture checked the cart, checkout totals, customer receipt and invoice, seller order and fee breakdown, Admin order detail, Earnings, Business report, Business settings, All offers and the fee-program preview. Current Off fees are hidden or labeled Off. Previously charged amounts and separate selling fees still show their saved amounts. The live marketplace fee setting was left alone.

### Unapplied migrations

The reserved D1 migrations are 0164 customer COD confirmation, 0165 delivery failure reasons, 0166 seller notes, 0167 cancellation cause and 0168 packed parcel weight. The MariaDB companions follow the convention in `deployment/babal`. The apply commands will be listed here for owner-approved database copies. The checked local database remains on its original schema.

- **0164 customer COD confirmation.** The SQLite table swap needs one transaction. `test -f "$HASTABAZAAR_REVIEW_D1" && printf '%s\n' 'PRAGMA foreign_keys=ON;' 'BEGIN IMMEDIATE;' '.read drizzle/0164_customer_cod_confirmation.sql' 'COMMIT;' | sqlite3 -bail "$HASTABAZAAR_REVIEW_D1"`
  - MariaDB, with writers stopped. `mariadb --defaults-extra-file="$HASTABAZAAR_REVIEW_MARIADB_CONFIG" --database="$HASTABAZAAR_REVIEW_MARIADB_DB" < deployment/babal/mariadb-customer-cod-confirmation.sql`
- **0165 delivery failure reasons.** `test -f "$HASTABAZAAR_REVIEW_D1" && sqlite3 -bail "$HASTABAZAAR_REVIEW_D1" < drizzle/0165_delivery_failure_reasons.sql`
  - MariaDB. `mariadb --defaults-extra-file="$HASTABAZAAR_REVIEW_MARIADB_CONFIG" --database="$HASTABAZAAR_REVIEW_MARIADB_DB" < deployment/babal/mariadb-delivery-failure-reasons.sql`
- **0166 seller notes.** `test -f "$HASTABAZAAR_REVIEW_D1" && sqlite3 -bail "$HASTABAZAAR_REVIEW_D1" < drizzle/0166_seller_staff_notes.sql`
  - MariaDB. `mariadb --defaults-extra-file="$HASTABAZAAR_REVIEW_MARIADB_CONFIG" --database="$HASTABAZAAR_REVIEW_MARIADB_DB" < deployment/babal/mariadb-seller-staff-notes.sql`
- **0167 cancellation cause.** `test -f "$HASTABAZAAR_REVIEW_D1" && printf '%s\n' 'PRAGMA foreign_keys=ON;' 'BEGIN IMMEDIATE;' '.read drizzle/0167_cancellation_cause.sql' 'COMMIT;' | sqlite3 -bail "$HASTABAZAAR_REVIEW_D1"`
  - MariaDB. `mariadb --defaults-extra-file="$HASTABAZAAR_REVIEW_MARIADB_CONFIG" --database="$HASTABAZAAR_REVIEW_MARIADB_DB" < deployment/babal/mariadb-cancellation-cause.sql`
- **0168 packed parcel weight.** `test -f "$HASTABAZAAR_REVIEW_D1" && sqlite3 -bail "$HASTABAZAAR_REVIEW_D1" < drizzle/0168_packed_parcel_weight.sql`
  - MariaDB. `mariadb --defaults-extra-file="$HASTABAZAAR_REVIEW_MARIADB_CONFIG" --database="$HASTABAZAAR_REVIEW_MARIADB_DB" < deployment/babal/mariadb-packed-parcel-weight.sql`

### Preview fixture coverage

- The checked Seller account had no active order for the packing action and no eligible saved Catalog candidate. The enabled weight controls and populated product previews were checked using disposable fixtures. The preview uses the live storefront detail layout and a private preview banner.
- The checked Buyer account had no linked receipt for the COD message. The isolated checkout verified the held state and release with the existing confirmation workflow. The old high-value first-order rule remains in effect.
- COD risk counts distinct cash orders with a recorded refusal or no contact. A retry and a duplicate courier report for the same order do not count twice. The suggestion opens the existing audited control.

### Payout bank file format

The run exports a generic CSV from the verified bank details of approved, unpaid payouts. Which bank and bulk-upload specification should a future export follow? The download records the run, included payout IDs and total in the audit log. The existing transfer workflow records payment separately.

The payout-run walkthrough used a payout prepared through the existing Admin preparation path. One Super Admin approved it in the run and recorded the verified transfer. Direct Super Admin preparation still approves immediately under the existing rule. Those directly approved payouts are outside the run export.

### Final verification

The opening `npm run local:check` passed on `086a930` with 107 of 107 forms and the sign-in schema ready. The existing preview opened the Super Admin fixture through `/local-testing` and showed the local-only two-step notice. The check initially treated the newly written migration files as required storage. Commit `c0f2085` makes it compare against the exact historical schema and recognize each optional upgrade when all its definitions are present. Typecheck, lint, 3 new schema tests and 23 readiness regressions passed. The read-only check passed again with all five Batch 3 migration files present and the original database untouched.

The early F0 run started after 0168 was written and before the test exclusion guard was in place. Its generic in-memory fixture setup could pick up that file. I reran the F0 checks with the guard in place. The checked preview database and all retained databases stayed on their original schema. Subsequent generic test runs exclude 0164–0168 from automatic fixture setup. Focused applied-state tests declare disposable schemas independently.

The complete isolated browser story passed at 390 and 1440 px. Across 76 screen measurements, every page fit the viewport. The fixture placed and confirmed a COD order, recorded a 0.55 kg parcel in Dispatch, saved and retried a courier failure for a customer who could not be reached, delivered the parcel, matched its cash, and downloaded the approved payout's bank file before marking it paid separately. The second order recorded Seller as the cancellation cause, showed it on the order's Records tab, and increased the seller's score from 0 to 1. The fixture added a private note, opened an unpublished product as its owner and as Super Admin, and confirmed that public access returned 404. Seven Money (view only) screens rendered without money-action controls. All 11 protected requests returned 403, including a bank-file request from a signed-in Money (view only) user. No browser runtime errors were reported.

The courier return-receipt workflow records an inferred Customer or Courier cause in its audit when the failure reason identifies one. Recording physical receipt follows the existing custody and refund checks. The business report counts committed cancellations. Completed cancellation history on the order shows the structured cause. The staff reason remains in the existing audit record.

An early full-suite run found that the admin hydration test's Node sandbox lacked `Headers`. Commit `f5fdd5b` supplies the same API the app uses when it reads the product-preview request path. The hydration test and 15 related checks passed before the full suite restarted.

The full run also found that the checkout fee test's isolated bundle did not account for the COD preference dependency. Commit `3bc5a77` supplies that dependency and asserts that the anonymous fee view never calls it. All eight focused fee and COD regressions passed. The full run is continuing to check the remaining tests.

The full run reached the historical release inventory and public gallery checks. Commit `90e48d4` verifies that the five owner-applied MariaDB files stay outside automatic release maintenance and that the storefront gallery retains its public-media fallback alongside the private preview source. All 14 focused release, media, preview and fee checks passed. These final fixture corrections leave application code unchanged during the full run.

The full suite finished at 11:50 Nepal time on 21 November after about 98 minutes. It reported 5,770 tests, 5,728 passes, 38 skips, four failures including the parent of one failed subtest, and zero cancellations. The three corrected test files and their related checks passed on `90e48d4` in a 21-test rerun. The final commit also passed fresh typecheck, lint and local preflight. The preflight found 107 of 107 forms ready, with sign-in storage available. The Batch 3 diff contains no URL deletions.

The owner controls the saved marketplace fee and the local-only 2-step switch. Remove `HASTABAZAAR_LOCAL_SKIP_STAFF_MFA` before any deploy.

## Changed files


<details><summary>View all 159 changed files</summary>

- `app/admin/analytics/business-report-data.ts`
- `app/admin/analytics/business-report.tsx`
- `app/admin/analytics/page.tsx`
- `app/admin/customers/customer-cod-confirmation.tsx`
- `app/admin/customers/page.tsx`
- `app/admin/layout.tsx`
- `app/admin/orders/[id]/page.tsx`
- `app/admin/orders/dispatch/packing-summary.ts`
- `app/admin/orders/dispatch/page.tsx`
- `app/admin/orders/dispatch/read-dispatch.ts`
- `app/admin/page.tsx`
- `app/admin/payments/page.tsx`
- `app/admin/payments/recoveries/[id]/page.tsx`
- `app/admin/payments/recoveries/claims/[id]/page.tsx`
- `app/admin/payments/recoveries/page.tsx`
- `app/admin/payments/refunds/page.tsx`
- `app/admin/payouts/[id]/page.tsx`
- `app/admin/payouts/page.tsx`
- `app/admin/payouts/run/bank-file-download.tsx`
- `app/admin/payouts/run/bank-file/route.ts`
- `app/admin/payouts/run/page.tsx`
- `app/admin/payouts/run/run-data.ts`
- `app/admin/payouts/run/run-workspace.tsx`
- `app/admin/products/preview/[id]/media/[mediaId]/route.ts`
- `app/admin/products/preview/[id]/page.tsx`
- `app/admin/products/preview/[id]/preview-data.ts`
- `app/admin/sellers/[id]/page.tsx`
- `app/admin/sellers/[id]/seller-notes-card.tsx`
- `app/admin/sellers/[id]/seller-record-data.ts`
- `app/admin/sellers/[id]/seller-record.tsx`
- `app/admin/shipping/page.tsx`
- `app/admin/shipping/parcel-problem-action.tsx`
- `app/admin/shipping/parcel-problem-queue.tsx`
- `app/admin/shipping/parcel-problems.ts`
- `app/api/admin/cancellations/route.ts`
- `app/api/admin/customers/[id]/cod-confirmation/route.ts`
- `app/api/admin/orders/[id]/first-cod-confirmation/route.ts`
- `app/api/admin/orders/[id]/fulfillment/route.ts`
- `app/api/admin/orders/[id]/parcels/route.ts`
- `app/api/admin/sellers/[id]/notes/route.ts`
- `app/api/seller/orders/[id]/fulfillment/route.ts`
- `app/api/seller/product-intakes/workspace/route.ts`
- `app/checkout/page.tsx`
- `app/orders/[orderNumber]/documents/[id]/page.tsx`
- `app/orders/[orderNumber]/page.tsx`
- `app/products/[slug]/page.tsx`
- `app/seller-access-denied/page.tsx`
- `app/seller/layout.tsx`
- `app/seller/orders/order-detail.tsx`
- `app/seller/products/new/page.tsx`
- `app/staff-access-denied/page.tsx`
- `components/admin/admin-navigation.tsx`
- `components/admin/business-settings-manager.tsx`
- `components/admin/cancellation-cause-field.tsx`
- `components/admin/cancellation-review-control.tsx`
- `components/admin/cod-courier-cash.tsx`
- `components/admin/commercial-combination-preview.tsx`
- `components/admin/delivery-failure-reason-field.tsx`
- `components/admin/dispatch-booking-form.tsx`
- `components/admin/dispatch-parcel-list.tsx`
- `components/admin/dispatch-workspace.tsx`
- `components/admin/first-cod-confirmation.tsx`
- `components/admin/order-fulfillment-actions.tsx`
- `components/admin/overview-today-data.ts`
- `components/admin/overview-today-model.ts`
- `components/admin/overview-today.tsx`
- `components/admin/parcel-controls.tsx`
- `components/admin/payout-workspace.tsx`
- `components/admin/product-intake-review.tsx`
- `components/admin/product-publication-review.tsx`
- `components/admin/refund-funding-review.tsx`
- `components/admin/refund-review-summary.tsx`
- `components/admin/seller-recovery-review.tsx`
- `components/admin/setting-value-preview.tsx`
- `components/admin/staff-invitation-presets.ts`
- `components/catalog/product-gallery.tsx`
- `components/catalog/product-offer-selection.tsx`
- `components/catalog/storefront-product-detail.tsx`
- `components/commerce/approved-billing-document.tsx`
- `components/commerce/cart-view.tsx`
- `components/commerce/checkout-form.tsx`
- `components/commerce/customer-service-fee-breakdown.tsx`
- `components/layout/site-header.tsx`
- `components/seller/order-fulfillment-actions.tsx`
- `components/seller/packed-weight-input.tsx`
- `components/seller/product-intake-workspace.tsx`
- `components/seller/use-product-intake.ts`
- `deployment/babal/mariadb-cancellation-cause.sql`
- `deployment/babal/mariadb-customer-cod-confirmation.sql`
- `deployment/babal/mariadb-delivery-failure-reasons.sql`
- `deployment/babal/mariadb-packed-parcel-weight.sql`
- `deployment/babal/mariadb-seller-staff-notes.sql`
- `docs/redesign-fix-list-board.md`
- `drizzle/0164_customer_cod_confirmation.sql`
- `drizzle/0165_delivery_failure_reasons.sql`
- `drizzle/0166_seller_staff_notes.sql`
- `drizzle/0167_cancellation_cause.sql`
- `drizzle/0168_packed_parcel_weight.sql`
- `hooks/use-public-cart-storage.ts`
- `lib/admin/customers-cod-confirmation.ts`
- `lib/admin/customers.ts`
- `lib/admin/fee-program-workspace.ts`
- `lib/admin/finance-work-items.ts`
- `lib/admin/navigation.ts`
- `lib/admin/seller-notes.ts`
- `lib/auth/staff.ts`
- `lib/cancellation/attribution.ts`
- `lib/cancellation/causes.ts`
- `lib/cancellation/repository.ts`
- `lib/commerce/order-presentation.ts`
- `lib/db/repositories/fulfillment.ts`
- `lib/db/repositories/orders.ts`
- `lib/db/repositories/staff-mutation-guard.ts`
- `lib/forms/registry.ts`
- `lib/marketplace/permissions.ts`
- `lib/operations/parcels.ts`
- `lib/operations/runtime-schema-readiness.mjs`
- `lib/orders/first-cod-review.ts`
- `lib/payments/manual-payment-lifecycle.ts`
- `lib/payments/manual-payment-workspace.ts`
- `lib/payments/payout-bank-file-access.ts`
- `lib/payments/payout-bank-file-scope.ts`
- `lib/payments/payout-bank-file.ts`
- `lib/payments/recovery-workspace.ts`
- `lib/payments/refund-workspace.ts`
- `lib/payments/seller-recovery.ts`
- `lib/products/intake-workspace.ts`
- `lib/products/preview-path.ts`
- `lib/products/publication.ts`
- `lib/shipping/delivery-failure.ts`
- `lib/shipping/packed-weight-storage.ts`
- `lib/shipping/packed-weight.ts`
- `lib/staff/access.ts`
- `lib/workflows/contracts.ts`
- `tests/admin-autofill-hydration.test.ts`
- `tests/billing-render.test.ts`
- `tests/cancellation-cause.test.ts`
- `tests/customer-cod-confirmation.test.ts`
- `tests/customer-fee-ui.test.ts`
- `tests/fee-waiver-page.test.ts`
- `tests/finance-navigation-browser.test.ts`
- `tests/first-cod-review.test.ts`
- `tests/helpers/customer-cod-fixture.ts`
- `tests/money-view-only.test.ts`
- `tests/off-customer-marketplace-fee.test.ts`
- `tests/packed-parcel-weight.test.ts`
- `tests/parcel-delivery-failure.test.ts`
- `tests/payout-bank-file.test.ts`
- `tests/payout-scope-browser.test.ts`
- `tests/platform-service-fee-ui.test.ts`
- `tests/product-storefront-preview.test.ts`
- `tests/product-story-materials.test.ts`
- `tests/public-checkout-browser.test.ts`
- `tests/release-manifest-completeness.test.ts`
- `tests/responsive-media-account.test.ts`
- `tests/responsive-media-public.test.ts`
- `tests/runtime-schema-optional-batch.test.ts`
- `tests/seller-staff-notes.test.ts`
- `tests/staff-access.test.ts`

</details>
