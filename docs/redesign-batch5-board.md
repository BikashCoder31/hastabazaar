# Hastabazaar Batch 5

Batch 5 starts from the completed Batch 4b at `13ebd63` on `admin-redesign`. The checked preview is at `http://localhost:3018`.

| Task | Owner | Waits for | Status | Commit | Checks |
| --- | --- | --- | --- | --- | --- |
| E1 · Bank transfers | Bank transfer helper | Batch 4b | Done | `dc8f9ce` | Typecheck, lint, 32 focused checks, 10 final focused checks, four browser regressions and all four viewport widths passed. |
| E2 · Joining as a seller | Seller onboarding helper | Batch 4b | Done | `f4dd90d` | Typecheck, lint, 43 focused checks, four browser regressions and all four viewport widths passed. |
| E3 · Emails | Email helper | Batch 4b | Done | `b94ae3c` | Typecheck, lint, 43 focused checks, and all 17 templates at 390, 768, 1024 and 1440 px passed. |
| E4 · Final check | Main agent | E1–E3 | Done | This task commit | Typecheck, lint, four-width browser checks and the visual comparison passed. The full run completed and all 18 initial failures passed in the final 80-check rerun. |

## For the owner

The approved Batch 5 references are under `docs/design-reference/batch5/`. Batch 5 uses existing storage and requires no migration. The next available migration number is 0170.

The checked launcher passed its 107-form and sign-in preflight. Super Admin, Seller, Buyer and applicant sessions opened in separate browser contexts. The checked Seller is already approved, so the pre-approval workflow needs a disposable applicant fixture.

The first native browser fixture placed and claimed a bank-transfer order, matched the verified credit, released it to the seller's To prepare queue, and captured the buyer's Payment received email. It also confirmed the unpaid short-transfer state and expiry with no outstanding amount. The email preview opened all 17 subjects at all four widths with the correct middle dot.

The guided bank-transfer flow saves a verified match before the same Super Admin releases the order. A short credit leaves the order unpaid and extra money stays in its own review case. The list sorts by the saved payment deadline. When the original bank review window extends past that deadline, the order shows both saved times and the remaining review time. The workspace includes the existing evidence and audit reason fields, and the More actions area keeps the native recovery and exception paths.

Email delivery links to the staff-only template preview. The byte-level regression verifies the UTF-8 middle dot. The 17 previews use the same renderers as the queued emails, with escaped fixture data and one clear action. Seller and Buyer contexts cannot reach the preview. Courier pickup and missed delivery use existing recorded parcel events. On-the-way and delivered use existing order-level events. Seller emails keep English and Nepali, and guest links retain the privacy-safe tracking route.

The seller fixture saved a partial application, verified the updates email, submitted with documents deferred, and showed the recorded changes request. A replacement upload went back to the existing Super Admin review. After approval, the seller submitted a first product through the existing review workflow. For a general review note, the Reply action opens the existing secure Contact Us form. Document-specific requests keep the private replacement link.

### Browser checks

- At 390 and 1440 px, the customer placed a bank-transfer order, submitted a claim, and saw payment verified after the Super Admin matched and released it. The order appeared in Seller To prepare and the isolated mail transport captured Payment received. Separate cases confirmed that short payment stays unpaid and expiry closes with nothing owed. A submitted claim also exercised the existing review window between the payment deadline and expiry.
- At 390 and 1440 px, the seller saved a partial draft, verified the updates email, submitted, replaced a document requested by the existing Super Admin review, received approval and sent a first product for review.
- The checked preview used separate browser contexts from `/local-testing`. The rendered pages, seller application steps, bank transfer controls and all 17 staff email templates fit at 390, 768, 1024 and 1440 px. Changed phone controls met the 44 px target. The email preview preserved the UTF-8 middle dot and required staff access.

### Differences from the approved pictures

| Pictures | Difference in the preview |
| --- | --- |
| 01–03 · Bank transfers | The controls keep payer reference, bank evidence, matching explanation and release reason fields for the existing audit trail. The More actions area retains the original recovery and exception tools. A short amount appears beside the entered credit first and moves to Problems once the part payment is saved. Account details are masked and amounts and dates use the saved order. |
| 04 · Sell with us | The existing storefront header, Help button and phone bottom bar frame the new content. The commission caption identifies registered seller sales. Signed-in applicants with a draft get a Continue your application link. |
| 05–06 · Seller application | The form retains the saved draft status, a single input for the email code and the existing country, municipality and locality fields. The sidebar stacks below the form on smaller screens. Its Written seller guide link jumps to the existing bilingual guide below the form. The existing header and the application's policy footer frame the page. |
| 07–08 · Seller Studio | The existing Seller Studio shell surrounds the checklist. The request shows the staff member's saved wording and actual upload link. Empty draft lists invite the seller to start a product and saved drafts use an icon. |
| 09–12 · Emails | The email cards sit inside the staff Settings shell and may require scrolling on phones. The message facts use available records, preview values are fictional, and seller messages include the existing Nepali copy. The calls to action lead to the appropriate secured page or the guest tracking route. |

The full-suite run flagged the former page-help wording, an email recovery fixture that omitted existing order columns, and four assertions for the previous seller application controls. Those pass in the 50-check focused rerun. The seller terms regressions verify the approved public commission and payout summary, the explicit route choice, and the private agreement gates. The registration recovery browser test also found that pickup guidance had become part of the field label. The guidance is now an accessible description and the seven draft recovery, phone and account scope checks pass.

The written seller guide remains available at the original bookmark and outside the form. Both phone and desktop fixture journeys followed its link and opened it by keyboard. The 19-check guidance and agreement rerun passed. The Today fixture now includes the new bank count source, and its 14-check rerun includes a populated summary at phone and desktop widths plus a check that narrowly scoped staff never read bank transfer counts.

`npm run test` completed in 92 minutes and 50 seconds. The initial run recorded 5,803 checks, with 5,747 passed, 18 failed and 38 skipped. The final focused run covered each of those 18 checks and passed all 80 with zero failures or skips. The final typecheck and lint both exited successfully. Browser and write-path tests used the checked preview for signed-in read checks and disposable fixtures for changes, with mail captured in isolation.

### Changed files

```text
app/admin/business-emails/page.tsx
app/admin/business-emails/preview/page.tsx
app/admin/layout.tsx
app/admin/page.tsx
app/admin/payments/orders/[id]/page.tsx
app/admin/payments/page.tsx
app/sell/apply/page.tsx
app/sell/page.tsx
app/seller/layout.tsx
app/seller/page.tsx
app/seller/registration/page.tsx
components/admin/admin-navigation.tsx
components/admin/admin-review-data.ts
components/admin/admin-section-tabs.tsx
components/admin/admin-sections.ts
components/admin/admin-task-context.tsx
components/admin/bank-transfer-workspace.tsx
components/admin/manual-payment-review.tsx
components/admin/page-help-copy.ts
components/admin/use-incoming-recovery.ts
components/seller/registration-application-overview.tsx
components/seller/registration-email-verification.tsx
components/seller/registration-guide.tsx
components/seller/seller-registration-intake-form.tsx
components/seller/start-seller-registration.tsx
docs/redesign-batch5-board.md
lib/email/business-message-details.ts
lib/email/business-message.ts
lib/email/message-layout.ts
lib/email/order-updates.ts
lib/email/preview-fixtures.ts
lib/operations/business-notifications.ts
lib/operations/courier-email-notices.ts
lib/operations/event-catalog.ts
lib/operations/parcels.ts
lib/payments/bank-transfer-queue.ts
lib/payments/incoming-command-outcomes.ts
lib/payments/incoming-outcome-contract.ts
lib/payments/manual-payment-lifecycle.ts
lib/payments/manual-receipts.ts
lib/payments/payment-http.ts
tests/automatic-delivery-recovery.test.ts
tests/bank-transfer-workspace.test.ts
tests/batch5-email-templates.test.ts
tests/business-notifications.test.ts
tests/customer-fee-commercial-terms.test.ts
tests/first-cod-confirmation-route.test.ts
tests/helpers/seller-registration-runtime.ts
tests/parcel-delivery-failure.test.ts
tests/seller-commercial-terms.test.ts
tests/seller-guidance-links.test.ts
tests/super-admin-marketplace-summary-page.test.ts
```

Batch 5 complete — ready for your review
