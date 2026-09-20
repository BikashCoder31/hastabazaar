# Hastabazaar v1.2.1 Milestone 3 Implementation Plan

**Goal:** Complete the remaining ordinary R01–R15 development while preserving the Milestone 1/2 configuration, authorization, commercial snapshots and disposable-staging boundaries.

**Method:** Extend existing product, address-book, checkout, analytics, returns, rider, document and notification code. Each work package starts with acceptance tests, uses additive migrations, snapshots transaction-specific facts, and ends with focused/full regression verification. Live legal, tax, company, provider and operating facts remain production-readiness gates—not hardcoded staging assumptions.

## Work package 1 — Product truth, savings, maker identity and official links (R06, R07, R13, R15)

- Make product materials optional, normalize multiple entries and preserve the saved product value.
- Add an optional product-origin story distinct from the maker biography; hide blank public sections.
- Keep maker/shop identity stable across product cards, product detail, storefront and admin views.
- Show exact monetary savings alongside the existing percentage for valid comparison prices.
- Resolve official social links from the authoritative published setting in safe accessible footer links.
- Test invalid/duplicate materials, blank fields, sanitization/limits, NPR 200→100, and no private/commercial leakage.

## Work package 2 — Purchaser, recipient and saved-address checkout (R08)

- Reuse the existing owner-scoped server address book and checkout selector.
- Add explicit For myself / For someone else state, optional delivery-only recipient email, and purchaser profile prefill without silently mutating the profile.
- Add an explicit save-for-future choice for new addresses and distinguish one-order edits from saved-entry updates.
- Recalculate delivery when destination changes and preserve purchaser/recipient/address snapshots on the order.
- Ensure recipient email never grants account/invoice access; changing material delivery details invalidates an OTP challenge.
- Test ownership, defaults, cross-device persistence, another-person checkout, snapshots and deletion/edit history.

## Work package 3 — Seller restriction and deletion governance (R02)

- Add seller-role suspension until a Kathmandu timestamp, indefinite disable and controlled reactivation without automatically removing buyer access.
- Enforce unavailable state in search, recommendations, cart, checkout and direct product views while preserving customer history.
- Add reasoned existing-obligation controls and explicit unsafe/fraud fulfillment decisions.
- Add deletion preflight and category-specific retention/purge records; never cascade transaction/evidence history.
- Test stale sessions/direct requests, automatic expiry with concurrent restrictions, open obligations and non-destructive deletion.

## Work package 4 — Customer overview and privacy-safe first-party traffic (R09)

- Add role-aware customer counts/directory from account records, excluding configured test accounts and avoiding dual-role duplication.
- Add minimal first-party page/session/product/funnel events without checkout PII, advertising IDs, cross-site tracking or session replay.
- Label sessions/page views/registered accounts accurately, expose last-updated time and configurable retention.
- Test authorization, count definitions, bot/internal/test exclusion, event allowlists and retention.

## Work package 5 — Invoice rendering and corrections (R05)

- Render a scannable stable barcode and verified-access invoice QR in screen, print and PDF-compatible output.
- Preserve issuer grouping, scan margins, readable fallback references and immutable invoice snapshots.
- Add linked correction/credit/debit records rather than editing issued invoices.
- Test encode/decode, authorization, mixed issuers, print dimensions and absence of private commission/OTP/address payloads.

## Work package 6 — Open-box, returns and rider finance completion (R10, R11)

- Consume configured category/area/rider open-box eligibility and distinguish outer package from protected inner seals.
- Record whole-parcel accepted/refused/wrong/damaged/inspection-impossible outcomes and retain later valid complaint rights.
- Add configurable cash-exposure checks over cash held plus proposed assignments, next-business-day alerts and safe assignment limits.
- Add configurable, explicitly simulated rider compensation rules for completed/failed/return trips, separate from customer cash/delivery charges.
- Test partial remittance, overdue limits, already-held parcels, staff exception evidence and maker-checker controls.

## Work package 7 — Automated outbox operations (R12)

- Keep one claiming path for immediate and scheduled processing; add a hosting-neutral bounded job entrypoint.
- Add priority, backoff, lease recovery, backlog/failure monitoring and explicit obsolete-message review outcomes.
- Provide local scheduler simulation and documented hosted scheduler requirements without selecting an unverified provider.
- Test concurrent workers, interruption, expired OTP, stale order state and capture-only recipients.

## Work package 8 — Recently Viewed (R14)

- Implement 12-item recent-first history, de-duplicated by product, with per-entry 90-day expiry from last view.
- Keep guest history in browser-local storage and signed-in history owner-isolated on the server; never auto-merge.
- Show current price/availability and provide clear-history controls.
- Test shared-device sign-out isolation, expiry, duplicates, missing/unavailable products and configurable settings.

## Work package 9 — Fixed-price acceptance and route transition (R03, R04, R01)

- Complete fixed supplier-price documented supply acceptance, rejection/cancellation/defect adjustments and independent obligation timing with no automatic 9% deduction.
- Add prospective Managed Maker → Registered Seller application/effective-date transition preserving identity, products, reviews and historical issuer/financial facts.
- Complete agreement renewal and future-effective independent commission notification/acceptance behavior.
- Test both models, transitions while orders remain open and immutable historical records.

## Work package 10 — Milestone 3 and owner handoff

- Update R01–R15 traceability from evidence, leaving only genuine production dependencies as gates.
- Run focused tests, full suite, lint, typecheck, both builds, MariaDB generation and guarded staging seed/demo/reset.
- Provide Milestone 3 customer/seller/rider/admin self-test package with fictional fixtures and expected outcomes.
