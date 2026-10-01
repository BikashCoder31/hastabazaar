# Consolidated local implementation checkpoint — incomplete

This checkpoint carries forward the existing uncommitted sections1–3 source and implements substantial R002–R022 work. It is not the final cumulative release or deployment review. No new release ZIP is prepared because required business decisions and dependent implementation remain unresolved. No deployment, cPanel upload, production migration, cron activation, real email or live record change occurred.

## Implemented source

- Signup confirmation; approved seller/customer same-session switching.
- Generated unique new-product SKUs with preserved history; Others taxonomy; flexible warranty; required-field markers; removed maker/material inputs; revised labels; calculated discounts; four new-listing angles plus optional fifth photo and bounded optional MP4. Legacy media/values remain preserved.
- Seller payout minimum removed only from operational eligibility; positive available balances, approved destination, allocation and independent approval remain. Recorded historical policy and customer wallet restrictions remain unchanged.
- Super Admin future delivery-rate versions retain initial150/180/250 settings until explicitly changed, preserve past order snapshots and record courier expenses separately per parcel.
- Individual Admin permission profiles/presets with independent Super Admin decisions, current-session enforcement and repository commit guards. Empty/malformed profiles fail closed; mutation and notification regressions pass.
- Actionable scoped notifications through the existing outbox and a fake-tested general sender distinct from the existing order email processor; guest aftercare outbox extension retains receipt authorization. Existing return/complaint/governance lifecycle additions are implemented and fake-transport tested.
- Clearer Order emails status/next-action copy; current staff queues and safe Super Admin audit filtering; bounded per-person recorded outcomes and Admin own-history view.
- Source-linked staff exception ownership, next action and immutable evidence history. Resolution annotates follow-up only; it does not settle cash, refunds or parcel state. Incorrect cash remains unresolved without the approved correction workflow.

## Per-request status

| Request | Local status | Boundary |
| --- | --- | --- |
| R002 | Implemented and browser/native checked | Exact signup confirmation |
| R003 | Blocked by pending business rule | Final settlement/archive/delete predicate |
| R004 | Existing source workflows implemented; dependent hooks pending | Scoped transactional email/in-app; guest outbox; gated workflows not present |
| R005 | Implemented and browser checked | Same-session approved seller/customer switching |
| R006 | Implemented and native checked | Positive available seller payouts; no customer withdrawals |
| R007 | Blocked by pending business rule | Gift issuance/redemption policy |
| R008 | Implemented and native/browser checked | Unique generated new SKU; legacy strings preserved |
| R009 | Implemented and repeat migration checked | Others category/occasion |
| R010 | Implemented and browser checked | Flexible warranty units and old free-text retention |
| R011 | Implemented on reviewed forms | Static plus rendered conditional required markers |
| R012 | Implemented and native/browser checked | Four new-listing photos, optional bounded video; hosted limits pending |
| R013 | Implemented and browser checked | Removed inputs and revised labels |
| R014 | Implemented reporting and bounded source audit coverage | Explicit own/per-person outcomes, safe business log, concrete legacy audit mirrors |
| R015 | Implemented and browser checked | Accurate Order emails states/actions/links |
| R016 | Implemented and browser checked | Derived paisa-based discount presentation |
| R017 | Implemented and native checked | Future rates, immutable historic order snapshots, separate parcel costs |
| R018 | Blocked by pending financial decision | Partial accounting and full readiness-based cancellation integration |
| R019 | Blocked by pending identity/evidence rules | Verified rider/dashboard/proof/staff confirmation/OTP configuration |
| R020 | Implemented and hardening regressions passed | Per-Admin permissions, independent SA approval, current/commit guards |
| R021 | Blocked by pending document matrix | Individual/Company/PAN/VAT private evidence |
| R022 | Staff workflow implemented; rider integration pending | Owner/next action/history; incorrect-cash correction never fabricated |

## Required decisions and incomplete scope

The exact recommendations and financial example are in [consolidated-pending-decisions-2026-09-13.md](consolidated-pending-decisions-2026-09-13.md). No response has been inferred.

- R003 product-settlement closure predicate: return-window and attributable reserve/payout boundary.
- R007 gift-card policy before issuance/redemption persistence.
- R018 partial cancellation money allocation and related race-safe whole/partial eligibility, with no24-hour hold.
- R019 rider identity/evidence/OTP/channel/retention rules before verified rider workflow.
- R021 Individual/Company private document matrix.
- R004/R014/R022 dependent event/audit/rider integration cannot be final until those source workflows exist. Final all-scope regression, cumulative ZIP/per-file SHA-256 manifest and complete deployment review remain pending.

## Verification evidence at this checkpoint

Evidence directory: outputs/consolidated-local-20260913-042936. Do not substitute historical100-test results for this phase.

- Final local checkpoint:180 automated tests passed, zero failures/skips (tests-final-local.txt). TypeScript, application plus touched-script lint, and separate cumulative Babal build passed with exit0 (types-final-local.txt, lint-final-local.txt, build-final-local.txt). These verify implemented source only; unresolved features are not claimed implemented.
- Fresh synthetic MariaDB17-file prerequisite/migration manifest; base schema used only for newly created empty fixtures. Six new additive migrations include35guest outbox. Native checks cover permission/rate concurrency, small payouts, exception history, current authorization, business-outbox claims/retries/recipient changes and preservation.
- Nine native fake-mail guest groups include legacy message/FK/unique retention and guest shape enforcement. A deliberate missingCHECK regression initially failed and now readiness detects the partial migration; red/green logs retained.
- Product native/browser7 groups passed at320/390/1440, including actual H264 playback, new generated SKU/four photos/month-only warranty, legacy one-photo preservation and stale/concurrent revision rejection. Render testing caught remaining Materials input and conditional asterisk gaps, corrected with regressions.
- Staff browser5 groups passed at320/390/1440: role-scoped navigation/access, independent permission change on unchanged Admin cookie, exception owner/history and unchanged money/parcel values. Updated progress browser checks passed four groups at320/390/1440, including explicit counts, current permission/actor restrictions, navigation and catalogue marker.
- Inherited operations and customer journey harnesses passed earlier source snapshots with keyboard/zoom and zero horizontal overflow. The refreshed operations-checkpoint and journey-checkpoint passes also succeeded on the cumulative build, including zero horizontal overflow. Later audit-only processor/mirror patches are covered by regression/build checks; those browser journeys were not misrepresented as rerun after those final patches.
- Local Windows Node22.23.1/MariaDB11.4.9 is not exact Babal Node22.23.2/native compatibility. No production Core Web Vitals or inbox delivery claim. Full-repository lint includes previously documented older script issues; application/touched-file checks are the relevant scope.

## Preservation and deployment preparation

Fresh initial baseline source-before.zip/per-file manifest/worktree-before.txt remains in the evidence directory. Current source-change-inventory.json compares actual bytes to that baseline, not clean Git HEAD; its first comparison found no missing baseline source files. All875 entries of source-before.zip were opened and SHA-256 checked against its per-file baseline manifest, with zero mismatches (baseline-archive-verification.json). Baseline archive SHA-256:57321a61ee99d37b55001e5c6f8fb73c6bcc0c4069e1811493fffec60f96c199. Original customer-section-three and delivery-maps ZIP SHA-256 values were freshly verified unchanged. No prior ZIP is replaced.

The ordered additive migration, backup/maintenance, rollback/forward-fix and pending production acceptance preparation is [consolidated-babal-maintenance-2026-09-13.md](consolidated-babal-maintenance-2026-09-13.md). It marks the work incomplete and supersedes older empty-database instructions for an existing installation. The manifest release remains consolidated-local-in-progress-2026-09-13. Separate explicit deployment authorization is still required after a completed candidate review.

Synthetic browser/app processes are stopped. The root-owned MariaDB process was verified against its exact isolated data directory before stopping; no listeners remain on13316/43873/43874, and test data files remain preserved (test-service-cleanup.json). Original source/data/uploads/authentication and privileged access are preserved; no new hosting or paid service is introduced.

Detailed audit coverage and historical limitations: consolidated-r014-audit-coverage-local.md. Both manual email processors now audit attempts before processing and sanitized outcomes; interruption leaves a recorded incomplete attempt. No real transport was invoked during verification.
