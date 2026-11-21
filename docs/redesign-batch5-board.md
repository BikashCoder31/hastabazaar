# Hastabazaar Batch 5

Batch 5 starts from the completed Batch 4b at `13ebd63` on `admin-redesign`. The checked preview is at `http://localhost:3018`.

| Task | Owner | Waits for | Status | Commit | Checks |
| --- | --- | --- | --- | --- | --- |
| E1 · Bank transfers | Bank transfer helper | Batch 4b | In progress | | |
| E2 · Joining as a seller | Seller onboarding helper | Batch 4b | In progress | | |
| E3 · Emails | Email helper | Batch 4b | Done | This task commit | Typecheck, lint, 43 focused checks, and all 17 templates at 390, 768, 1024 and 1440 px passed. |
| E4 · Final check | Main agent | E1–E3 | Queued | | |

## For the owner

The approved Batch 5 references are under `docs/design-reference/batch5/`. Batch 4b used migration number 0169 for optional discovery storage. The next available number is 0170.

The checked launcher passed its 107-form and sign-in preflight. Super Admin, Seller, Buyer and applicant sessions opened in separate browser contexts. The checked Seller is already approved, so the pre-approval workflow needs a disposable applicant fixture.

The first native browser fixture placed and claimed a bank-transfer order, matched the verified credit, released it to the seller's To prepare queue, and captured the buyer's Payment received email. It also confirmed the unpaid short-transfer state and expiry with no outstanding amount. The email preview opened all 17 subjects at all four widths with the correct middle dot.

Email delivery links to the staff-only template preview. The byte-level regression verifies the UTF-8 middle dot. The 17 previews use the same renderers as the queued emails, with escaped fixture data and one clear action. Seller and Buyer contexts cannot reach the preview. Courier pickup and missed delivery use existing recorded parcel events. On-the-way and delivered use existing order-level events. Seller emails keep English and Nepali, and guest links retain the privacy-safe tracking route.
