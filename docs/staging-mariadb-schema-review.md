# Staging MariaDB schema review

The verified release needs the older core schema from **manifest positions 59–136**, followed by the guarded completion and final constraint and trigger files. The expected apply set is **82 files** after the checks below. Positions refer to the package's MariaDB manifest. Owner migrations **0164–0172** remain a separate batch.

## Verified baseline and target

- Read-only cPanel review on 23 November checked MariaDB 10.11.20 in `hastabaz_staging`. The running release was `hastabazaar-release-ci-41031347464-1`. Its manifest has 58 MariaDB entries and the stage database contains all 168 tables it requires. The migration ledger has one recorded version, `0020_snapshot`.
- The verified target is `hastabazaar-release-ci-45059021181-1` from `0fdc112bce598176c6cb7ec78a1fd1297e990592`. Its generated manifest SHA-256 is `ed82aaf857f26100233b83263f2814d11cf52f6a7c576954a8263530c28882cd`. Its selected cumulative SQL SHA-256 is `aa248443d0f54096a83a11c74c6b3cda66774431417cd64be9cd127af98a3493`. All 142 listed SQL file hashes matched on the host. Source-only regeneration reproduced both hash values. [Passing package job](https://github.com/BikashCoder31/hastabazaar/actions/runs/45059021181/job/137328529002)
- The first 58 entries are shared. Four shared companion hashes differ only in whitespace at line boundaries or line endings after normalization. These are product deletions, delivery locations, parcel operations and guest business notifications. The first entry is the updated full bootstrap for an empty database. The referral-offer policy file in position 5 has no schema signature. Leave its current settings alone. The later sequence starts at 59.
- The scope comparison used exact object names from the candidate SQL and MariaDB catalogue metadata. The ordered list below identifies missing additions, intentional overlap with older definitions and replacement of an existing trigger body. Name checks alone cannot establish equivalence of every definition or detect historical data changes. Separately verified evidence and required checks for the ambiguous files are recorded below.
- All positions 59–142 occur in the order shown in the pinned cumulative SQL after normalizing line endings and trailing spaces. A static pass through positions 59–136 found no forward foreign-key or ALTER-table dependency against the observed prior tables and earlier table creations. This verifies the source ordering. It does not certify execution against retained staging rows. [Pinned SQL selection](../scripts/prepare-release-schema-input.mjs) · [Cumulative source order](../scripts/generate-mariadb-schema.mjs)

## Apply order for a separately approved maintenance window

1. Take and verify a recoverable staging-only backup. Use that baseline to rehearse this order on a separately approved disposable copy with the same MariaDB version and SQL mode. In the actual maintenance window, pause staging writers and recheck the fingerprints before the first file. Keep the running application release and existing initialized security available for rollback.
2. Apply **59–67**, then **68–76**, then **77–94**, then **95–125**, then **126–136** in the exact sequence below. The groups cover review and foundation, catalogue, payments and aftercare, recovery and money, then mail and governance. Apply a file at a time and stop at the first unexpected result. MariaDB DDL can commit independently, so inventory a partial file before resuming.
3. At **137**, check the prerequisites in `mariadb-bootstrap-prerequisites.sql`. The five columns it adds are already present in the expected type, nullability and default families. The unique ledger index already covers `refund_id, type` in that order, and the older refund-only index was absent. The staging duplicate refund/type group count was zero. Treat this as a verification checkpoint. If its complete metadata preflight differs on the copy or on the day, resolve that difference before moving on.
4. Apply **138**, the guarded bootstrap completion. Of its 39 guarded additions, four trigger names were absent on staging. Those are `managed_snapshot_no_update`, `managed_snapshot_no_delete`, `managed_settlement_entry_no_update` and `managed_settlement_entry_no_delete`. The other 35 guarded names were visible. The duplicate order-email event group count was zero. The file validates existing definitions and prerequisites before adding missing objects, so verify those checks in the rehearsal.
5. Apply **140**, then **141**, then **142**. These are CHECK parity, text-length parity and the final inventory guard, in that order. The parity companions check metadata and invalid rows before DDL. Position 142 must replace the older `order_items_require_available_inventory` definition. The current body has no exact-offer reservation guard. The verified body includes that guard and the seller eligibility and restriction checks.
6. Verify the target MariaDB definitions and required control rows, preserve retained records and existing hosted security, and record the exact result before requesting any deployment. The existing staging release was healthy during diagnosis. This review made no database or application changes and did not retry deployment.

Positions **1** and **139** are empty-database-only. The existing staging database stays on the additive path. Hold **0164–0172** for their separate owner review and verified backup.

### Data effects to verify on the copy

The source has top-level inserts, updates or guards at **63, 64, 65, 66, 69, 82, 93, 115 and 117**. These populate or backfill seller revisions, review tasks, payment and commission control records, aftercare records, payout bank identities and recovery pools. Capture the expected effects from each verified companion on the copy. Compare original rows and financial totals before advancing. These checks are part of verifying the apply order on a populated copy.

### Two intentional overlaps

- **68 · Sellable offers.** The existing `order_items_require_available_inventory` trigger is the sole visible final-schema signature in this file. The other 94 were absent, including the offer tables and `order_items.offer_reservation_id`. The file intentionally drops and recreates the earlier inventory triggers after creating their new dependencies. The last refinement is position 142. [Sellable offers SQL](../deployment/babal/mariadb-product-sellable-offers.sql#L28)
- **131 · Notification runtime compatibility.** Staging already has `business_event_key`, `required_permission`, the four delivery-attempt/lease fields, `guest_email` and `guest_order_id`. The two recipient-shape triggers are missing. Keep the additive compatibility file in sequence so the guarded column additions, nullable recipient shape, queue index and both trigger definitions are verified together. [Notification compatibility SQL](../deployment/babal/mariadb-notification-runtime-compatibility.sql#L4)

## Exact ordered file list

| Package position | Verified MariaDB companion | Staging disposition |
| ---: | --- | --- |
| 59 | [mariadb-complete-version-foundation.sql](../deployment/babal/mariadb-complete-version-foundation.sql) | Apply. New schema entries absent. |
| 60 | [mariadb-review-task-ownership.sql](../deployment/babal/mariadb-review-task-ownership.sql) | Apply. New schema entries absent. |
| 61 | [mariadb-core-form-receipt-retention.sql](../deployment/babal/mariadb-core-form-receipt-retention.sql) | Apply. New schema entries absent. |
| 62 | [mariadb-document-review-history.sql](../deployment/babal/mariadb-document-review-history.sql) | Apply. New schema entries absent. |
| 63 | [mariadb-protected-change-holds.sql](../deployment/babal/mariadb-protected-change-holds.sql) | Apply. New schema entries absent. |
| 64 | [mariadb-public-profile-revisions.sql](../deployment/babal/mariadb-public-profile-revisions.sql) | Apply. New schema entries absent. |
| 65 | [mariadb-seller-review-sources.sql](../deployment/babal/mariadb-seller-review-sources.sql) | Apply. New schema entries absent. |
| 66 | [mariadb-company-payment-accounts.sql](../deployment/babal/mariadb-company-payment-accounts.sql) | Apply. New schema entries absent. |
| 67 | [mariadb-category-contracts-intake.sql](../deployment/babal/mariadb-category-contracts-intake.sql) | Apply. New schema entries absent. |
| 68 | [mariadb-product-sellable-offers.sql](../deployment/babal/mariadb-product-sellable-offers.sql) | Apply after the foundation. The older inventory trigger is present and is replaced here. |
| 69 | [mariadb-common-fee-policies.sql](../deployment/babal/mariadb-common-fee-policies.sql) | Apply. New schema entries absent. |
| 70 | [mariadb-private-price-guidance.sql](../deployment/babal/mariadb-private-price-guidance.sql) | Apply. New schema entries absent. |
| 71 | [mariadb-product-intake-workspace.sql](../deployment/babal/mariadb-product-intake-workspace.sql) | Apply. New schema entries absent. |
| 72 | [mariadb-product-publication-versions.sql](../deployment/babal/mariadb-product-publication-versions.sql) | Apply. New schema entries absent. |
| 73 | [mariadb-product-availability.sql](../deployment/babal/mariadb-product-availability.sql) | Apply. New schema entries absent. |
| 74 | [mariadb-product-legacy-observations.sql](../deployment/babal/mariadb-product-legacy-observations.sql) | Apply. New schema entries absent. |
| 75 | [mariadb-product-priority-concerns.sql](../deployment/babal/mariadb-product-priority-concerns.sql) | Apply. New schema entries absent. |
| 76 | [mariadb-cart-selected-offers.sql](../deployment/babal/mariadb-cart-selected-offers.sql) | Apply. New schema entries absent. |
| 77 | [mariadb-manual-payment-allocations.sql](../deployment/babal/mariadb-manual-payment-allocations.sql) | Apply. New schema entries absent. |
| 78 | [mariadb-order-response-scope.sql](../deployment/babal/mariadb-order-response-scope.sql) | Apply. New schema entries absent. |
| 79 | [mariadb-cancellation-scope-holds.sql](../deployment/babal/mariadb-cancellation-scope-holds.sql) | Apply. New schema entries absent. |
| 80 | [mariadb-return-received-evidence.sql](../deployment/babal/mariadb-return-received-evidence.sql) | Apply. New schema entries absent. |
| 81 | [mariadb-return-physical-handling.sql](../deployment/babal/mariadb-return-physical-handling.sql) | Apply. New schema entries absent. |
| 82 | [mariadb-aftercare-followups.sql](../deployment/babal/mariadb-aftercare-followups.sql) | Apply. New schema entries absent. |
| 83 | [mariadb-refund-obligations.sql](../deployment/babal/mariadb-refund-obligations.sql) | Apply. New schema entries absent. |
| 84 | [mariadb-refund-execution-sources.sql](../deployment/babal/mariadb-refund-execution-sources.sql) | Apply. New schema entries absent. |
| 85 | [mariadb-original-delivery-allocations.sql](../deployment/babal/mariadb-original-delivery-allocations.sql) | Apply. New schema entries absent. |
| 86 | [mariadb-lawful-fee-refund-authorizations.sql](../deployment/babal/mariadb-lawful-fee-refund-authorizations.sql) | Apply. New schema entries absent. |
| 87 | [mariadb-private-finance-evidence.sql](../deployment/babal/mariadb-private-finance-evidence.sql) | Apply. New schema entries absent. |
| 88 | [mariadb-original-refund-cost-allocations.sql](../deployment/babal/mariadb-original-refund-cost-allocations.sql) | Apply. New schema entries absent. |
| 89 | [mariadb-refund-original-deadlines.sql](../deployment/babal/mariadb-refund-original-deadlines.sql) | Apply. New schema entries absent. |
| 90 | [mariadb-cancellation-refund-sources.sql](../deployment/babal/mariadb-cancellation-refund-sources.sql) | Apply. New schema entries absent. |
| 91 | [mariadb-cancelled-delivery-allocations.sql](../deployment/babal/mariadb-cancelled-delivery-allocations.sql) | Apply. New schema entries absent. |
| 92 | [mariadb-payout-request-policy.sql](../deployment/babal/mariadb-payout-request-policy.sql) | Apply. New schema entries absent. |
| 93 | [mariadb-payout-transfer-packets.sql](../deployment/babal/mariadb-payout-transfer-packets.sql) | Apply. New schema entries absent. |
| 94 | [mariadb-managed-actual-execution.sql](../deployment/babal/mariadb-managed-actual-execution.sql) | Apply. New schema entries absent. |
| 95 | [mariadb-seller-recovery-cases.sql](../deployment/babal/mariadb-seller-recovery-cases.sql) | Apply. New schema entries absent. |
| 96 | [mariadb-seller-recovery-allocations.sql](../deployment/babal/mariadb-seller-recovery-allocations.sql) | Apply. New schema entries absent. |
| 97 | [mariadb-seller-recovery-agreements.sql](../deployment/babal/mariadb-seller-recovery-agreements.sql) | Apply. New schema entries absent. |
| 98 | [mariadb-recovery-model-settlements.sql](../deployment/babal/mariadb-recovery-model-settlements.sql) | Apply. New schema entries absent. |
| 99 | [mariadb-recovery-model-netting.sql](../deployment/babal/mariadb-recovery-model-netting.sql) | Apply. New schema entries absent. |
| 100 | [mariadb-recovery-contact-clocks.sql](../deployment/babal/mariadb-recovery-contact-clocks.sql) | Apply. New schema entries absent. |
| 101 | [mariadb-recovery-repayment-claims.sql](../deployment/babal/mariadb-recovery-repayment-claims.sql) | Apply. New schema entries absent. |
| 102 | [mariadb-recovery-liability-corrections.sql](../deployment/babal/mariadb-recovery-liability-corrections.sql) | Apply. New schema entries absent. |
| 103 | [mariadb-recovery-response-cycles.sql](../deployment/babal/mariadb-recovery-response-cycles.sql) | Apply. New schema entries absent. |
| 104 | [mariadb-recovery-historical-attributions.sql](../deployment/babal/mariadb-recovery-historical-attributions.sql) | Apply. New schema entries absent. |
| 105 | [mariadb-recovery-source-reviews.sql](../deployment/babal/mariadb-recovery-source-reviews.sql) | Apply. New schema entries absent. |
| 106 | [mariadb-recovery-unpaid-sources.sql](../deployment/babal/mariadb-recovery-unpaid-sources.sql) | Apply. New schema entries absent. |
| 107 | [mariadb-recovery-payout-retirements.sql](../deployment/babal/mariadb-recovery-payout-retirements.sql) | Apply. New schema entries absent. |
| 108 | [mariadb-recovery-unpaid-corrections.sql](../deployment/babal/mariadb-recovery-unpaid-corrections.sql) | Apply. New schema entries absent. |
| 109 | [mariadb-recovery-carrier-reimbursements.sql](../deployment/babal/mariadb-recovery-carrier-reimbursements.sql) | Apply. New schema entries absent. |
| 110 | [mariadb-recovery-partial-sources.sql](../deployment/babal/mariadb-recovery-partial-sources.sql) | Apply. New schema entries absent. |
| 111 | [mariadb-recovery-calculation-reviews.sql](../deployment/babal/mariadb-recovery-calculation-reviews.sql) | Apply. New schema entries absent. |
| 112 | [mariadb-recovery-payout-returns.sql](../deployment/babal/mariadb-recovery-payout-returns.sql) | Apply. New schema entries absent. |
| 113 | [mariadb-recovery-carrier-unpaid.sql](../deployment/babal/mariadb-recovery-carrier-unpaid.sql) | Apply. New schema entries absent. |
| 114 | [mariadb-recovery-history-chronology.sql](../deployment/babal/mariadb-recovery-history-chronology.sql) | Apply. New schema entries absent. |
| 115 | [mariadb-recovery-company-history.sql](../deployment/babal/mariadb-recovery-company-history.sql) | Apply. New schema entries absent. |
| 116 | [mariadb-recovery-fixed-original.sql](../deployment/babal/mariadb-recovery-fixed-original.sql) | Apply. New schema entries absent. |
| 117 | [mariadb-recovery-partial-paid.sql](../deployment/babal/mariadb-recovery-partial-paid.sql) | Apply. New schema entries absent. |
| 118 | [mariadb-recovery-receipt-dispositions.sql](../deployment/babal/mariadb-recovery-receipt-dispositions.sql) | Apply. New schema entries absent. |
| 119 | [mariadb-customer-refund-reversals.sql](../deployment/babal/mariadb-customer-refund-reversals.sql) | Apply. New schema entries absent. |
| 120 | [mariadb-recovery-repayment-attributions.sql](../deployment/babal/mariadb-recovery-repayment-attributions.sql) | Apply. New schema entries absent. |
| 121 | [mariadb-receipt-return-bank-losses.sql](../deployment/babal/mariadb-receipt-return-bank-losses.sql) | Apply. New schema entries absent. |
| 122 | [mariadb-receipt-return-bank-satisfactions.sql](../deployment/babal/mariadb-receipt-return-bank-satisfactions.sql) | Apply. New schema entries absent. |
| 123 | [mariadb-funding-bank-reversal-freshness.sql](../deployment/babal/mariadb-funding-bank-reversal-freshness.sql) | Apply. New schema entries absent. |
| 124 | [mariadb-managed-live-activation.sql](../deployment/babal/mariadb-managed-live-activation.sql) | Apply. New schema entries absent. |
| 125 | [mariadb-managed-live-financial.sql](../deployment/babal/mariadb-managed-live-financial.sql) | Apply. New schema entries absent. |
| 126 | [mariadb-durable-email-delivery.sql](../deployment/babal/mariadb-durable-email-delivery.sql) | Apply. New schema entries absent. |
| 127 | [mariadb-email-service-health.sql](../deployment/babal/mariadb-email-service-health.sql) | Apply. New schema entries absent. |
| 128 | [mariadb-team-governance.sql](../deployment/babal/mariadb-team-governance.sql) | Apply. New schema entries absent. |
| 129 | [mariadb-incident-governance.sql](../deployment/babal/mariadb-incident-governance.sql) | Apply. New schema entries absent. |
| 130 | [mariadb-form-health-records.sql](../deployment/babal/mariadb-form-health-records.sql) | Apply. New schema entries absent. |
| 131 | [mariadb-notification-runtime-compatibility.sql](../deployment/babal/mariadb-notification-runtime-compatibility.sql) | Apply. Eight columns are already present and two guest recipient triggers are missing. |
| 132 | [mariadb-review-task-system-ownership.sql](../deployment/babal/mariadb-review-task-system-ownership.sql) | Apply. New schema entries absent. |
| 133 | [mariadb-complete-version-legacy-transitions.sql](../deployment/babal/mariadb-complete-version-legacy-transitions.sql) | Apply. New schema entries absent. |
| 134 | [mariadb-native-public-feedback-defaults.sql](../deployment/babal/mariadb-native-public-feedback-defaults.sql) | Apply. New schema entries absent. |
| 135 | [mariadb-product-orderable-price-history.sql](../deployment/babal/mariadb-product-orderable-price-history.sql) | Apply. New schema entries absent. |
| 136 | [mariadb-native-form-health.sql](../deployment/babal/mariadb-native-form-health.sql) | Apply. New schema entries absent. |
| 137 | [mariadb-bootstrap-prerequisites.sql](../deployment/babal/mariadb-bootstrap-prerequisites.sql) | Verify. Existing prerequisite columns and the composite unique index were observed. |
| 138 | [mariadb-bootstrap-completion.sql](../deployment/babal/mariadb-bootstrap-completion.sql) | Apply guarded completion. Four retained-record triggers are missing. |
| 139 | [mariadb-fresh-bootstrap-defaults.sql](../deployment/babal/mariadb-fresh-bootstrap-defaults.sql) | Excluded for existing staging. This file is empty-database-only. |
| 140 | [mariadb-check-parity.sql](../deployment/babal/mariadb-check-parity.sql) | Apply after guarded completion. Required CHECK additions are missing. |
| 141 | [mariadb-text-length-parity.sql](../deployment/babal/mariadb-text-length-parity.sql) | Apply after CHECK parity. Required text-length additions are missing. |
| 142 | [mariadb-native-order-stock-governance.sql](../deployment/babal/mariadb-native-order-stock-governance.sql) | Apply last. Replace the older inventory trigger body. |
