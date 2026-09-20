# Hastabazaar Staging-First Design v1.2.1

Status: approved for staging-only implementation on 2026-09-21. Production deployment, production migrations, real messages, real payments, and live commercial activation remain unapproved.

## Mandatory financial correction

The sale-linked Managed Maker demonstration uses a **platform retention rate**, not a maker-entitlement rate.

```text
platform_retained_amount = eligible_base × platform_retention_rate
maker_entitlement = eligible_base − platform_retained_amount
```

The staging default is `managed_sale_linked_platform_retention_bps = 900` (9%). For an eligible base of NPR 1,000, the platform-retained amount is NPR 90 and the maker calculated entitlement is NPR 910. Half-up minor-unit rounding is applied to the retained amount; entitlement is subtraction from the original base so the two values reconcile exactly. Expected entitlement may be calculated before delivery, but it becomes earned only when the configured delivered-and-paid conditions are satisfied.

This setting is separate from independent-seller commission. Fixed supplier-price purchasing has no automatic percentage deduction.

## Environment boundary

Implementation begins in disposable local staging with a separate database, media root, queues, recipients, accounts, mail capture, and simulated payments. Fictional issuer, agreement, receiving-account, invoice, payment, and settlement records are allowed only when the immutable runtime environment is `test` or `staging` and must be visibly marked `SIMULATED — NOT VALID FOR PRODUCTION`.

Company-registration fields stay incomplete. No setting or ordinary admin action may bypass production readiness, turn staging into production, publish a simulated agreement, or send a simulated record to production.

## Supported Managed Maker models

1. `managed_sale_linked_percentage_v1`: sale-linked platform retention and maker entitlement; calculated, earned, held, eligible, allocated, and paid are separate states. Customer payment, rider-held cash, remittance, company receipt, and maker payout remain separate records.
2. `managed_fixed_supplier_price_v1`: the accepted supplier amount becomes owed at documented supply acceptance and does not depend on resale. Possession, quantity acceptance, quality acceptance, ownership, risk, and responsibility remain separate concepts.

Both share onboarding, profiles, product review, agreement/version records, configuration, adjustments, settlement infrastructure, and immutable transaction snapshots. Only implemented and tested capability codes may be activated.

## Configuration design

The typed registry is the only authoritative source for mutable business configuration. Every definition declares validation, sensitivity, publication workflow, effective dating, affected surfaces, required capability, and snapshot behavior. Unknown keys, executable formulas, raw SQL, balance editing, and security bypass switches are rejected.

Ordinary content uses draft, preview, publish/schedule, active, and superseded versions. Financial, contractual, and sensitive settings require proposal by one authorized actor and approval by another. Reversal creates a new version; it never edits history.

## Baseline preservation

The source baseline was archived before worktree creation at `outputs/baseline-snapshot-v1.2.1-2026-09-21/hastabazaar-working-source-ca43301.zip` in the original checkout.

- Original HEAD: `ca433018a7b62689817904a18c069230916c0a1b`
- Archive SHA-256: `854B6F5C83C1B4CD63CC680D9E9D98F4B621E9275007260E64AF85CE9486F5C3`
- Source files verified byte-for-byte after extraction: 2,234
- Original working files were not reset, moved, deleted, or overwritten
- Three local package-cache database files were intentionally excluded
- Credentials, environment files, production data, backups, and generated outputs were excluded

## R01–R15 traceability

| Requirement | Milestone | Required acceptance coverage |
| --- | --- | --- |
| R01 private commission and settings | M1 foundation; M2/M3 finance | private-only independent commission; separate managed retention; effective versions; older orders unchanged |
| R02 suspension/deletion | M3 | timed/indefinite seller restriction, cart/server enforcement, obligations preserved, deletion preflight |
| R03 conditional onboarding/maker information | M1 | Yes/No server validation, registered and managed routes, optional craft experience/social/video, city-only public location, private addresses |
| R04 private terms/acceptance | M1 foundation; M2/M3 final | authenticated pre-submission access, immutable acceptance version/language/time, no public seller terms |
| R05 invoices, barcode and QR | M2 simulated record; M3 complete | issuer-grouped immutable invoice, barcode decoding, verified QR access, no commission leakage |
| R06 seller profile/logo | M1 | stable maker ID, logo/photo and fallback, owner permissions, no false verification or private-address exposure |
| R07 materials and product story | M3 | optional multiple normalized materials, optional product story, blank sections hidden, no invented claims |
| R08 checkout/saved addresses/other recipient | M3 | prefill without profile mutation, saved-address CRUD, purchaser/recipient separation, order snapshot |
| R09 customer counts/traffic | M3 | role-aware distinct counts, test exclusion, first-party labelled analytics, privacy-safe events |
| R10 open-box/returns | M2 clay whole-parcel demo; M3 full | parcel contents, accept/refuse/report issue, later valid complaint retained, sealed-item handling |
| R11 rider/COD/settlement | M2 demonstration; M3 complete | mobile lifecycle, parcel OTP, customer payment separate from remittance, maker/checker reconciliation and payout |
| R12 automated emails | M2 captured journey; M3 operational completion | outbox claiming, OTP priority, retries/backoff, stale suppression, no duplicate independent senders |
| R13 monetary savings | M3 | NPR 200→100 shows 50% and NPR 100 saved; variants/cart/checkout remain consistent |
| R14 Recently Viewed | M3 | 12 items, 90-day per-entry expiry, no guest merge, clear history, current availability/prices |
| R15 official social links | M1 setting; M3 presentation completion | supplied six URLs validated, enabled/reordered through admin, accessible safe links |

Ordinary missing functionality remains unfinished development work. Only genuine live-business, legal, tax, contractual, retention, production-access, or infrastructure facts may remain production-readiness gates.

