# Consolidated Babal maintenance and acceptance runbook — LOCAL CANDIDATE, NOT DEPLOYED

This is a preparation document, not deployment authorization. R003/R007/R019/R021, R018 Option 1 and the later distinct-store delivery revision are implemented and cumulatively accepted locally. Preserve every previous ZIP and report. The concrete candidate is `outputs/hastabazaar-consolidated-delivery-revision-2026-09-14.zip`, SHA-256 `5b908944bc289a20be2704206e77a7c7615a6c76ef1ca9b87d7b053017e4ad3a`; its adjacent per-file manifest and verification record cover all 3,425 archive files. The 13 September ZIP is a preserved superseded local attempt, not the deployment candidate.

## Target and hold

Babal.Host cPanel only, Node.js 22.23.2, MariaDB, application root /home2/hastabaz/hastabazaar-app, startup app.cjs. Local verification uses Windows Node 22.23.1 and MariaDB 11.4.9. Exact hosted runtime/native dependency, request-size, memory and media compatibility require later authorized acceptance. Do not enable cron or manually process real email queues during local preparation.

## Ordered additive migration inventory

Inspect actual installed migration markers, tables, columns, triggers and retained previous deployment evidence before choosing pending files. Never infer production installation from a local readiness result. The manifest contains hashes and readiness requirements; its base schema is empty-database-only and is excluded here. Do not import reset/base schemas or development seeds into existing data.

1. `deployment/babal/mariadb-referrals-wallet.sql`
2. `deployment/babal/mariadb-order-updates.sql`
3. `deployment/babal/mariadb-review-photos-replies.sql`
4. `deployment/babal/mariadb-referral-offer-fifty.sql`
5. `deployment/babal/mariadb-password-reset.sql`
6. `deployment/babal/mariadb-product-deletions.sql`
7. `deployment/babal/mariadb-delivery-locations.sql`
8. `deployment/babal/migrations/2026-09-09-email-login-otp.sql`
9. `deployment/babal/mariadb-identity-purchase-security.sql`
10. `deployment/babal/mariadb-parcel-operations.sql`
11. `deployment/babal/mariadb-product-identity-taxonomy.sql`
12. `deployment/babal/mariadb-staff-permissions.sql`
13. `deployment/babal/mariadb-delivery-rates-costs.sql`
14. `deployment/babal/mariadb-business-notifications.sql`
15. `deployment/babal/mariadb-exception-work.sql`
16. `deployment/babal/mariadb-guest-business-notifications.sql`
17. `deployment/babal/mariadb-gift-cards.sql`
18. `deployment/babal/mariadb-seller-registration.sql`
19. `deployment/babal/mariadb-verified-riders.sql`
20. `deployment/babal/mariadb-partial-cancellation.sql`

The identity-purchase-security and parcel-operations files belong to sections 1 and 2 respectively. Section 3 adds no migration. The following ten files belong to consolidated work, ending with additive migration 0039's MariaDB counterpart. Earlier prerequisites must be confirmed installed, not blindly assumed or reset. The delivery pricing revision adds no schema: it uses the existing delivery snapshot JSON and cancellation amount columns. `drizzle/meta/_journal.json` remains the generated Drizzle journal through 0029; hand-authored 0030–0039 files and their MariaDB counterparts are enumerated explicitly by the release tooling and must not be inferred from that journal.

Current fresh synthetic MariaDB verification applied the entire prerequisite chain only to newly created empty databases, then repeated all six new migrations across the native acceptance harnesses; the guest-outbox extension also passes legacy-row/FK/unique preservation and missing-constraint readiness checks. Repeat success is not permission to apply them to production. MariaDB DDL may auto-commit: record each completed file and inspect partial failure before retrying. Stop on an error; do not continue into an inconsistent schema.

## Backup and maintenance review before any separately authorized deployment

- Verify recoverable database export and matching application archive, private media backup and environment configuration custody. Keep secrets outside release archives and reports. Document backup timestamp and a restoration rehearsal in a disposable environment.
- Confirm a maintenance method that actually stops marketplace writes, payment/COD actions, queue processors and uploads. Preserve sessions, existing privileges, private media, logs and runtime environment. Do not run a second background Node process beside Passenger.
- Verify the candidate ZIP hash and every adjacent manifest entry; ensure `app.cjs` is at the root and no secrets, synthetic data, uploads or test runtime are bundled. Local generation reopened and SHA-256 checked all 3,425 entries with zero mismatches.
- During the later authorized window, apply only confirmed pending additive migrations in order, record results, install the matching candidate and restart through cPanel. Do not run a production build on the hosting account as a substitute for the verified standalone artifact.

## Rollback and forward fix

Keep the prior matching application and database backups. If application acceptance fails before reopening writes, evaluate application rollback against newly added schema and triggers using a disposable restoration; do not assume old code is compatible. Do not drop new tables, erase audit/ledger records or reverse posted financial entries. Prefer an explicit additive forward fix for schema/data incompatibilities. A database restoration after any new writes requires reconciliation of all intervening orders, money, evidence and notifications and separate approval; do not silently discard them.

## Pending production acceptance

- Correct Node/runtime startup, protected readiness including all tables/triggers, HTTPS origin, private media path/permissions and actual bounded image/video uploads/playback.
- Existing owner/privileged login, mailbox verification, seller/customer switching, individual Admin permission revocation on an existing session and reserved controls.
- New listing SKU/angles/warranty, preserved legacy listings, current delivery rates for future orders and immutable historical totals, separate parcel courier costs, COD/remittance/payout controls with small positive seller balances.
- Exception ownership/next action/history and authorized record links. Verify rider, cancellation, gift and seller-document flows against authorized production test accounts without changing unrelated live records.
- Designated inbox testing requires separate permission to send real mail; distinguish queued, accepted by SMTP and delivered to inbox. Interrupted sends may duplicate after lease recovery. No real order or cash mutation merely to speed up a test.
- Mobile 320/390/1440 layouts, keyboard/zoom, operational resource limits and representative performance. Local timings are not production Core Web Vitals.

Public support remains support@hastabazaar.com. Referral reward/friend discount remain Rs. 50 under existing eligibility. Customer deposits/withdrawals remain disabled; seller earnings payouts remain separate.

## Four approved recommendations: upgrade acceptance additions

- Gift migration preserves existing wallet/referral entries and makes order references nullable only for constrained gift credit. Verify the wallet kind/source CHECK constraints, source trigger and unique redemption linkage. Do not rewrite historic promotional policy.
- Seller migration leaves earlier applicant types unclassified and preserves certificates and genuine registration identifiers. Check Individual and Company flows, PAN/VAT/Both evidence privacy and existing seller access.
- Rider migration grants no historical rider approval automatically. Super Admin must review identity before assignments. Proof/open-box/OTP are separate: handover proof required, open-box and OTP initially off. No evidence deletion job is installed. Existing delivery history remains.
- Verify private evidence authorization, suspension/reassignment revocation, staff-confirmed cash collection versus separate remittance, immutable policy/evidence history and optional protected-receipt prepaid codes. COD never needs OTP.
- Product closure has no new migration. Check product-specific unresolved obligations without blocking solely for an unused return window; retain aftercare and historical records.

## Final four-recommendation local acceptance update

The four approved recommendations and R018 have passed combined local acceptance; see approved-four-local-2026-09-13.md and consolidated-local-completion-2026-09-14.md. The release manifest contains one explicitly excluded empty-database-only base plus 20 ordered additive files. Gift wallet integrity and cancellation totals are required by readiness/native checks. This document remains preparation only, not deployment authorization.
