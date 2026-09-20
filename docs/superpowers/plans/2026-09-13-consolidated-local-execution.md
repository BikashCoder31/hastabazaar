# Consolidated local execution ledger

Goal: implement R002–R022 cumulatively over existing sections 1–3, using the approved staged scope.
Spec: docs/architecture/consolidated-scope-2026-09-13.md and chronological change register.
Architecture: extend current repositories, ledger, outboxes, parcel states and authorization. Babal cPanel only, Node 22.23.2/MariaDB/app.cjs. No live activity, deployment, real email, cron or base/reset migration over existing data.
Workspace: owner explicitly authorized implementation in existing dirty checkout; source snapshot outputs/consolidated-local-20260913-042936/source-before.zip and manifest preserve actual source, not HEAD. No reset/checkout/commit. Shell requires elevated execution because Windows sandbox helper fails before command startup.

- [x] Read handoff and preserve source-before ZIP/per-file manifest; original release hashes freshly unchanged.
- [x] R002 exact client/server signup confirmation; native rejected requests create no accounts; browser mismatches checked.
- [x] R005 same-session customer/seller switching under existing eligibility guards,320/390/1440 browser passed.
- [x] R006 positive small seller payouts; zero/ineligible blocked; native1-paisa concurrent preparation single winner; no payments executed.
- [x] R008/R009 generated globally claimed SKU, Others taxonomy, preserving historic duplicate SKUs; repeated MariaDB migration verified.
- [x] R010/R013 flexible warranty/removed fields/labels; legacy values preserved. Browser caught Materials field, corrected and render regression passes.
- [x] R012 four new-listing angles/optional fifth and separate20MB60-second MP4; actual H264 playback and legacy one-photo/stale+concurrent revision checks pass.
- [x] R016 derived discount display and seller preview; no changes to stored commercial snapshots.
- [x] R017 versioned future delivery rates and separate parcel courier costs; native authorization/concurrency and immutable history pass.
- [x] R020 per-Admin effective permissions/presets with independent SA approval; native approval/revocation checks pass. Parcel commit authorization review continues.
- [x] R015 mail-monitor state explanations and order links; corrected interrupted-send duplicate limitation.
- [x] R011 static required labels/explanation on reviewed forms; dynamic/browser review evidence in product workstream.
- [x] R004 transactional recipient outbox and affected/actionable event coverage; fake transports and authorization checks pass.
- [x] R014 audit/current queues, per-person recorded progress and browser acceptance pass.
- [x] R022 staff exception ownership/evidence/version workflow and rider/report/proof integration pass.
- [x] R003 approved closure predicate implemented and accepted locally.
- [x] R007 approved Super Admin amount/bearer gift-card policy implemented and accepted locally.
- [x] R018 approved proportional cancellation accounting, readiness cutoff, custom-production review and remaining-store delivery recalculation pass locally.
- [x] R019 approved rider verification/evidence rules implemented and accepted locally; optional OTP and open-box remain initially off.
- [x] R021 approved Individual/Company and PAN/VAT/Both document matrix implemented and accepted locally.
- [x] Final 230-test regression, types, scoped lint, isolated Babal build, synthetic MariaDB/browser acceptance and cumulative candidate completed. Deployment remains separately held.

Evidence directory outputs/consolidated-local-20260913-042936. Checkpoint151/151 tests and current product build/browser pass; inherited operations/journey passed earlier snapshots. Native permission/rate/exception/outbox/small-payout checks recorded separately. Full source remains under active changes; no result is represented as final-source acceptance. Maintenance supplement and pending-decision brief under docs/architecture preserve deployment hold.

First fresh npm test run after signup and initial product changes: 104 pass, no failures/skips. Historical baseline 100 is not claimed as fresh. All later edits require renewed verification.
Ruling: retain previously declared dual approval for admin.permissions.manage using proposal plus a different active Super Admin; no self-approval or single-SA bypass.

Final local checkpoint:180/180 tests, TypeScript, application/touched-script lint and separate Babal build pass. Progress browser4groups, staffbrowser5groups, productbrowser7groups, refreshed operations/customer journeys pass at their recorded snapshots. All875 baseline ZIP entries hash-match, original releases unchanged. Browser/apps and isolated MariaDB stopped; no test listeners remain. Current-source report: docs/architecture/consolidated-local-checkpoint-2026-09-13.md. All-scope completion/candidate remains blocked by five unanswered business decisions; no deployment authorization.
