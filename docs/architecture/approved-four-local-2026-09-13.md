# Four approved recommendations — completed local acceptance, 2026-09-13

R003, R007, R019 and R021 are implemented and locally verified. This includes their affected notification, audit and exception integrations. R018 partial-cancellation accounting remains unresolved; no partial cancellation adjustment has been implemented. The full consolidated release is therefore not deployment-ready, and no new cumulative release ZIP has been prepared. Separate explicit deployment authorization remains mandatory.

## Final source and verification

Evidence directory: outputs/approved-four-2026-09-13T05-17-00-125Z.

- Final automated suite: 211 passed, zero failures/skips (tests-final-four.txt).
- TypeScript with incremental compilation disabled passed (types-final-complete.txt); application, middleware and new/touched verification script lint passed (lint-final-complete.txt). This is not a claim that older full-repository script lint issues are resolved.
- Independent cumulative Babal build passed (build-final-four.txt). It contains earlier sections 1–3 and consolidated work. Only two required-field asterisks changed after the first accepted browser build; gift and optional-code workflows were rerun against the final build and passed.
- Native gift cards: five groups; product closure: three groups; rider repository: seven groups passed. These cover one-time/concurrent credit, safe money limits, preservation, closure attribution/races, immutable rider evidence/policy, revoked assignments, failure follow-up, OTP eligibility/attempts and staff-confirmed cash without remittance. See individual feature reports.
- Fresh native readiness passes for 90 tables, 34 triggers and 20 manifest entries (one empty-database-only base plus 19 additive files). Removing either required gift-wallet CHECK makes readiness fail; restoring it recovers readiness (readiness-wallet-fault.txt). The inherited operations harness also faults/restores every required table/trigger.
- Seller browser: all six Individual/Company × PAN/VAT/Both submissions pass, required missing certificate rejects without account creation, selected private evidence is reviewer-only, and 320/390/1440 layouts have no overflow (seller-registration/browser-resumed/integration.json). The initial hidden-checkbox test selector failed; using the visible accessible control corrected the harness, with no application workaround.
- Gift browser: Super Admin exact amount issuance, code displayed once, ordinary Admin denial, one wallet credit without a fabricated order and duplicate-redemption rejection pass (gift-browser/integration.json; gift-browser-final.txt). Codes were not logged or included in screenshots.
- Rider browser: identity privacy, approval, assignment, required proof, pending reports leaving delivery/cash untouched, staff confirmation, separate remittance, retained accepted proof access and suspension revocation pass (rider-browser/integration.json).
- Optional-code browser: configured prepaid-only receipt ownership, anonymous/rider denial, COD denial, six-digit one-time current-rider verification, followed by normal proof/staff confirmation pass (rider-otp-browser/integration.json; otp-browser-final.txt). This used synthetic prepaid fixtures, not a connected online payment provider. No SMS/email transport was added or invoked. Defaults remain off.
- Inherited operations and customer journey pass on the combined build (inherited-operations/integration.json and inherited-journey/integration.json), including two sellers, financial idempotency, independent confirmation, saved-address/error focus, shopping credit/friend discount totals, aftercare, keyboard/zoom checks and 320/390/1440 layouts. Journey reports zero overflow findings. Representative rider, gift-wallet and seller mobile captures were visually inspected.

## Preserved policies and deployment review

Gift value is selected by Super Admin, within safe integer-paisa limits; random unique bearer codes redeem once, no expiry, shopping-only wallet credit. Customer deposits/withdrawals remain disabled; seller payouts are separate. Rs. 50 referrer reward and Rs. 50 friend discount keep existing eligibility.

Individual registration uses legal/contact/address details and the selected PAN/VAT certificates; Company additionally needs registration details/certificate. Existing applications and genuine identifiers remain preserved. Product archive/delete stays blocked for attributable unsettled obligations and uncertain attribution needing staff review; an unused return window alone does not block, and aftercare/history survives.

Rider approval is reserved to Super Admin, assignment to authorized staff. One private photo OR video is required for handover. Staff confirms delivery/COD reports; remittance stays separate. Open-box and optional prepaid codes default off, COD never requires OTP, and no automatic evidence deletion is installed. Browser location sharing needs an active page/device. No courier booking/webhook/background GPS integration is connected.

Ordered additive migration, backup, maintenance, rollback/forward-fix and production acceptance preparation is in consolidated-babal-maintenance-2026-09-13.md. Sections 1–2 remain in that inventory; section 3 has no migration. Never run the base/reset schema on an existing database. Production Node 22.23.2/native/media compatibility and actual inbox acceptance remain pending; local Node is 22.23.1 and MariaDB 11.4.9. Local performance is not production Core Web Vitals.

All 960 entries of the pre-four baseline ZIP were read and matched to their per-file SHA256 manifest; no mismatches. Prior local/deployed release hashes remain unchanged (preservation-final.json). Earlier ZIPs, source changes, data and uploads remain preserved. No live system was accessed or changed.

## Remaining decision

Only R018 partial-cancellation accounting remains for owner discussion. The documented example retains the single Rs. 150 delivery charge when one Rs. 1,000 item remains, uses Rs. 50 of the original Rs. 100 shopping credit and Rs. 25 of the Rs. 50 friend discount, and restores Rs. 50 wallet credit. Remaining COD becomes Rs. 1,075. This increases the original remaining-parcel allocation by Rs. 75; owner must choose recalculation or an explicitly funded marketplace adjustment. Neither is assumed. Custom work after production starts requires staff review, cancellation cutoff is parcel ready-for-pickup, and no 24-hour hold is authorized.

After that decision: implement and verify R018, reconcile final cumulative acceptance, then prepare the new release ZIP, adjacent per-file manifest/SHA256 and deployment review. Deployment remains separately held.

---

## Earlier safe-stop record (historical)

# Safe local checkpoint — 2026-09-13

Stopped at the owner's explicit request. All source edits saved. No deployment, production migration, real messages, cron or live-record changes. Partial cancellation R018 remains pending and was not implemented.

## Saved implementation

The four approved recommendations now have local source implementation: R003 product-attributable settlement restrictions and historical aftercare preservation; R007 Super Admin chosen one-time gift cards and shopping-only wallet credit; R021 Individual/Company and PAN/VAT/Both document matrix; R019 verified rider applications, private evidence, assignments, staff-confirmed handover/COD, immutable evidence/policy history, failure exceptions, contextual notifications and optional protected-receipt prepaid codes. Proof required; open-box and OTP default off; COD never requires OTP. Prior consolidated work and section 1–3 changes remain in the workspace.

## Actual verification at stop

- Combined automated suite: 206/206 passed (tests-combined.txt). Later rider/OTP hardening has focused 9 rider repository + 3 customer-code boundary passes; a final combined suite after those additions remains pending.
- Application lint passed after rider-form corrections (lint-combined-second.txt). Final OTP touched-file lint and TypeScript passed as recorded by the responsible agent.
- Independent Babal build completed with exit 0 during safe shutdown (build-combined.txt). Build path: C:/Users/abinash/.codex/visualizations/2026/09/12/01a097c9-16d0-7e33-9232-dd269993eb08/consolidated-build/dist/standalone. This is a local build, not a release candidate.
- Native isolated MariaDB: gift cards 5 groups; product closure 3 groups; rider repository 7 groups passed. Seller registration native migration/matrix checks passed; see feature reports for precise coverage. No existing business database was used.
- Fresh browser verification for these four recommendations has NOT run. Seller/rider/inherited operations/customer harnesses are prepared and guarded. Gift browser harness remains to be written. Earlier browser results are historical only.

## Resume sequence

1. Read this checkpoint and feature reports approved-r007-local.md, approved-r003-closure-local.md, approved-seller-registration-local.md, approved-rider-repository-local.md and approved-rider-upload-routes-local.md. Inspect saved source and new OTP routes/components.
2. Restart only the isolated MariaDB data directory under outputs/approved-four-2026-09-13T05-17-00-125Z/mariadb-data on loopback13316. Verify process/datadir ownership first. No production environment or sends.
3. Run final combined tests/types/lint and native readiness, including the newly required wallet constraints. Run prepared browser harnesses sequentially (ports43873/43874), add gift and optional-code UI/route checks, inspect responsive screenshots, and fix findings. Do not use stale build if source changes.
4. Reconcile final evidence, update chronological register and additive Babal runbook. Discuss R018 financial allocation explicitly with the owner; do not infer approval.
5. A final cumulative release ZIP/per-file manifest and deployment review remain pending required completion. Do not label the project deployment-ready. Separate explicit deployment authorization remains mandatory.

## Preservation

Fresh pre-four baseline: outputs/approved-four-2026-09-13T05-17-00-125Z/source-before.zip, SHA256 48e372b80a7e06a63d0f0e975dd09dc8f84518cce2827abd0ae281fc52910d6e. Prior ZIPs and reports remain preserved. Safe-stop source hash inventory: outputs/approved-four-2026-09-13T05-17-00-125Z/safe-stop-source.manifest.json (source snapshot inventory, not a deployable artifact). No credential values are included.
