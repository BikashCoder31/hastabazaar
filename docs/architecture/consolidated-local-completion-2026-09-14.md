# Consolidated local completion — 14 September 2026

## Outcome

Sections 1–3, consolidated R002–R022, the four approved recommendations, R018 Option 1 and the final distinct-store delivery revision are implemented in the preserved local workspace. No deployment, cPanel upload, production migration, cron enablement, live-data mutation or real message occurred.

The current delivery policy charges one destination base fee for the first distinct store and 50% of that base for each additional store. At a Rs. 150 base: one/two/three/four stores are Rs. 150/Rs. 225/Rs. 300/Rs. 375. Same-store products share the fee. Eligible whole-store cancellation recalculates from remaining distinct stores; all-store cancellation removes delivery. Historical orders retain their recorded policy and amounts.

## Local verification

- 230/230 automated tests passed with no failures, skips or cancellations.
- TypeScript passed with `--noEmit --incremental false`; application-scoped lint passed.
- Fresh isolated Babal build passed from `C:/Users/abinash/.codex/visualizations/2026/09/13/01a09bc4-23b3-72a3-9df3-e7022a24133a/hastabazaar-final-build`. It generated 92 required tables, 38 triggers and 21 manifest migration entries (one empty-database-only base plus 20 additive files).
- Fresh timestamped synthetic MariaDB databases on loopback port 13316 passed ordered/repeated migrations, readiness, deliberate constraint removal/restoration, permission/rate concurrency, immutable history and cancellation integrity checks.
- Cumulative operations Playwright passed with exit 0: two-store Rs. 225 snapshot, isolated parcel visibility, rider reassignment, COD allocation, concurrent cash idempotency, independent remittance approval, preserved totals, 1440/390/320 rendering and no browser exceptions/overflow.
- Cumulative customer Playwright passed with exit 0 at 1440/390/320 and zero overflow findings: guest/signed-in checkout, receipt privacy, maps fallback, keyboard/zoom, returns/reviews and the unchanged Rs. 50 referrer/Rs. 50 friend offer.
- Cancellation Playwright passed with exit 0: Rs. 225 original two-store delivery, Rs. 150 after one-store cancellation, zero after all stores, proportional wallet restoration, discount handling, private authorization, immutable originals, custom-production staff review, fake notification transport, repeated migration and invalid-total rejection.

Browser plugin was unavailable, so the repository's constrained Playwright harness used installed Chrome. External requests were blocked and email delivery disabled. Local runtime was Node.js 22.23.1 and MariaDB 11.4.9; exact Babal Node.js 22.23.2/native behavior remains production acceptance, not a local claim.

## Candidate

- ZIP: `outputs/hastabazaar-consolidated-delivery-revision-2026-09-14.zip`
- SHA-256: `5b908944bc289a20be2704206e77a7c7615a6c76ef1ca9b87d7b053017e4ad3a`
- Size: 24,744,984 bytes
- Files: 3,425; every archive file reopened and SHA-256 matched against `outputs/hastabazaar-consolidated-delivery-revision-2026-09-14.manifest.json`
- Verification: `outputs/hastabazaar-consolidated-delivery-revision-2026-09-14.verification.json`
- Startup: `app.cjs`; Babal.Host only

The ZIP includes the cumulative standalone runtime and all manifest-declared migrations. `deployment/babal/mariadb-schema.sql` is empty-database-only and must never run over existing data. Apply only confirmed pending additive migrations in the order documented by [consolidated-babal-maintenance-2026-09-13.md](consolidated-babal-maintenance-2026-09-13.md).

The earlier `outputs/hastabazaar-consolidated-delivery-revision-2026-09-13.zip` is preserved as a superseded local attempt; it is not the deployment candidate.

## Still pending production authorization and acceptance

- Recoverable application/database/private-media backups and a rehearsed disposable restore.
- Exact cPanel Node.js 22.23.2 startup, native dependency, memory/request-size and protected readiness checks.
- Inventory of already-installed migration markers; maintenance stop; only missing additive migrations; no base/reset schema.
- Existing privileged authentication, customer/seller/rider switching, private evidence/media, current order/cancellation and finance controls using authorized production test records.
- Designated mailbox acceptance separately distinguishing queueing, SMTP acceptance and inbox delivery; no real mail until separately authorized.
- Production 320/390/1440 and representative performance checks. Local timing is not production Core Web Vitals.

On failure, keep writes closed and compare the prior application/database/media backups. Do not drop additive schema or erase ledger/audit/history. Prefer an additive forward fix. Restoring a database after new writes requires explicit reconciliation and approval.

## Subsequent production deployment update

The local-only statements above describe the candidate-preparation checkpoint. The owner later explicitly authorized production deployment and confirmed the exact final delivery rule. Backup-first deployment completed on 14 September 2026: additive migrations 9-20, the verified cumulative ZIP, Node.js 22.23.2 startup, 92/92 tables, 38/38 triggers, 4/4 required checks, public readiness and anonymous responsive smoke checks passed. See `docs/deployment-consolidated-delivery-revision-2026-09-14.md` for the production evidence and remaining acceptance limits.
