# Messages & seller checklist

Work started from `90c6057` on `admin-redesign`. The refreshed Emails, Seller record and Shop checklist references are present at all three design widths.

| Task | Status | Commit | Checks |
| --- | --- | --- | --- |
| M1 · Schedule the email sender | Done | `9fdefe53` | Typecheck and lint pass. 20 sender and job tests pass. Protected config validated offline. Checked preview shows both email pages at 390, 768, 1024 and 1440 px with no page overflow. |
| M2 · Emails and Today warning | Done | `81ebde40` | Typecheck, lint for the changed files and 32 focused checks pass. Emails and Today opened at 390, 768, 1024 and 1440 px. Filter and send confirmation checked; resend tested with disposable capture. |
| M3 · Message event coverage | Done | `e82cbc5a` | Typecheck and scoped lint pass. 82 focused checks pass, including the scheduled D1 health job with owner migrations excluded. Notifications and email previews passed at all four widths. |
| M4 · Messages on each record | Done | `eefbe064` | Typecheck, lint and five focused checks pass. Seller and customer scoped links passed in the checked preview. The order card, capture-only resend and a stopped Today warning passed in a disposable browser fixture at all four widths. |
| M5 · Shared seller checklist | Done | `ccf3bd20` | Typecheck, lint and 45 focused checks pass. Admin seller record, Seller Documents & agreement, Today and Earnings passed at 390, 768, 1024 and 1440 px. Tests covered privacy, expiry, audit, daily reminder and capture. |
| M6 · Final check | Done | This task commit | Typecheck, lint and 14 targeted admin, seller and email tests pass. Full suite recorded 5,787 passes, 38 skips and seven initial failures. All seven passed on the final rerun. Disposable browser flows passed at 390 and 1440 px. |

## For the owner

- Use the [Babal.Host sender setup](babal-host-setup.md#schedule-the-email-sender) on staging first. The guide includes the once-a-minute cPanel entries, protected config, QA inbox check and stop instructions.
- The app shows a stopped sender and old waiting messages on Today. The separate-host watchdog is optional for launch.
- Before enabling staging, review the exact sender POST route in the staging Basic Auth configuration so the job receives the bearer header, and review the staging runtime gateway for the protected sender settings. No host job has been installed or enabled.
- See the [message matrix](messages-matrix.md#for-the-owner) for channel exceptions. A routine selling-fee nudge can stay in-app under the existing preference and cadence. Guests only have email. Today can show a sender outage while the queued email waits for the sender to recover.
- Staff can resend a failed message through the existing queue once its retry time arrives. Rejected addresses and unconfirmed delivery outcomes stay on the recovery path. A captured email is labelled separately from provider acceptance. The previous order-email history remains reachable through Delivery details and recovery.
- The Emails page shows the current recipient address under the existing Super Admin email-delivery permission. Guests with no account name use the order link. Provider acceptance, local capture and in-app reading are reported separately.
- The pickup phone action uses the existing public shop phone and says so before editing. Shop-detail and early renewal requests queue the seller-facing note. Document corrections and replacement permissions still use the existing protected review flow, and the request does not add a payout hold. Reminders are limited to one per item in a rolling 24-hour period.
- The existing sender job scans for upcoming expiries and queues a privacy-scoped message pair for required documents. No migration is required for this batch.

### Verification and design differences

- The full run used all 5,832 tests from the standard suite with four workers in about 41 minutes. The seven initial failures covered the checklist form inventory, retained managed approval conflict, referral retry fixtures, delivered subject and Seller Studio menu inventory. These seven and the initial serial checkout assertion passed together on the final tree. The slower duplicate run was stopped after the complete parallel run finished. The owner-only SQL files remained excluded.
- The checked preflight passed all 107 published form checks and sign-in readiness. Browser mutations used isolated databases and local capture. The approved preview opened without page overflow at the four requested widths. Phone actions checked in the redesigned areas measured at least 44 px.

- Emails and Today were checked at 390, 768, 1024 and 1440 px. The reviewed screen keeps the existing Settings tabs and workspace breadcrumb. Real queue records supply all counts and rows. In the checked preview the sender has no successful recent run. The disposable browser fixture verified waiting, temporary failure, accepted evidence, actual local capture, and exactly one stopped sender warning. Resend captured the original failed job and kept its audit record.
- Seller, customer and order record message cards were checked at the same four widths. The Seller record keeps existing document, finance and staff notes sections below the new checklist. The history shows application messages even when the applicant received them in their customer-side inbox. Saved order response and refund sources link back to the order. Opening a card does not mark an in-app copy as read.
- The checked seller is Janakpur Craft Studio. In a disposable fixture, the Super Admin used Ask seller at both 390 and 1440 px. The seller received the exact edited note. The linked record showed one queued email and its one in-app copy. A private staff note was absent from the seller page. The checkout and payout gates still use the existing readiness evidence.
- Local capture reads Captured locally. Provider acceptance reads Delivered, with an explanation under Delivery details and recovery. Older mail without a recorded transport receipt keeps its saved sent record. Some older subjects use the recorded wording because the historical queue did not retain the exact transmitted subject.

<details>
<summary>Files changed in this batch</summary>

- `app/admin/business-emails/page.tsx`
- `app/admin/customers/page.tsx`
- `app/admin/orders/[id]/page.tsx`
- `app/admin/page.tsx`
- `app/admin/sellers/[id]/page.tsx`
- `app/admin/sellers/[id]/seller-record.tsx`
- `app/api/admin/email-delivery/resend/route.ts`
- `app/api/admin/sellers/[id]/checklist/route.ts`
- `app/seller/finance/page.tsx`
- `app/seller/page.tsx`
- `app/seller/registration/page.tsx`
- `components/admin/email-delivery-controls.tsx`
- `components/admin/email-delivery-view.tsx`
- `components/admin/overview-today-data.ts`
- `components/admin/record-messages.tsx`
- `components/admin/seller-checklist-request.tsx`
- `components/seller/seller-getting-started.tsx`
- `components/seller/seller-payout-fixes.tsx`
- `components/seller/shop-checklist.tsx`
- `docs/architecture/order-updates.md`
- `docs/babal-host-setup.md`
- `docs/messages-checklist-board.md`
- `docs/messages-matrix.md`
- `lib/cancellation/repository.ts`
- `lib/db/repositories/fulfillment.ts`
- `lib/db/repositories/orders.ts`
- `lib/db/repositories/payouts.ts`
- `lib/db/repositories/seller-applications.ts`
- `lib/db/repositories/wallet.ts`
- `lib/email/business-message-details.ts`
- `lib/email/business-message.ts`
- `lib/email/message-layout.ts`
- `lib/email/order-updates.ts`
- `lib/email/preview-fixtures.ts`
- `lib/email/send-order-updates.ts`
- `lib/operations/admin-message-history.ts`
- `lib/operations/business-notifications.ts`
- `lib/operations/courier-email-notices.ts`
- `lib/operations/email-queue.ts`
- `lib/operations/event-catalog.ts`
- `lib/operations/manual-email-audit.ts`
- `lib/operations/message-event-catalog.ts`
- `lib/operations/notification-links.ts`
- `lib/operations/order-message-statements.ts`
- `lib/operations/parcels.ts`
- `lib/operations/reminder-dispatch.ts`
- `lib/operations/wallet-notices.ts`
- `lib/sellers/bank-details.ts`
- `lib/sellers/dashboard-form-contracts.ts`
- `lib/sellers/document-review.ts`
- `lib/sellers/protected-change-events.ts`
- `lib/sellers/protected-change-policy.ts`
- `lib/sellers/protected-identity-change.ts`
- `lib/sellers/shop-checklist-evidence.ts`
- `lib/sellers/shop-checklist-notices.ts`
- `lib/sellers/shop-checklist.ts`
- `tests/admin-message-history.test.ts`
- `tests/admin-record-messages.test.ts`
- `tests/bank-transfer-workspace.test.ts`
- `tests/batch5-email-templates.test.ts`
- `tests/checkout-contact-verification.test.ts`
- `tests/complete-version-onboarding-journey.test.ts`
- `tests/email-delivery-pages-render.test.ts`
- `tests/form-catalog-policy.test.ts`
- `tests/managed-maker-identity.test.ts`
- `tests/message-event-catalog.test.ts`
- `tests/parcel-delivery-failure.test.ts`
- `tests/referral-release.test.ts`
- `tests/returns-complaints.test.ts`
- `tests/seller-payout-fix-review.test.ts`
- `tests/seller-registration-email.test.ts`
- `tests/seller-shop-checklist.test.ts`
- `tests/site-responsive-layout.test.ts`

</details>

Messages & seller checklist complete — ready for your review
