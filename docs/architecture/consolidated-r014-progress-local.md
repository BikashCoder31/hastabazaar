# R014 — per-person recorded work progress

Local implementation, 13 September 2026. Current queues remain distinct from recorded historical work.

## Scope

- Super Admin /admin/activity includes per-person grouped counts by exact known action and recorded outcome, plus recognized source records. /admin/progress gives Admins only their own recognized history under their current audit and source/action permissions. Changing the actor query cannot expose another Admin's records.
- Date counts use Nepal calendar boundaries, default to 30 days and reject ranges above 366 days. Counts are grouped directly in SQL, not estimated from the 100-row history sample. The UI explicitly flags a 500 actor/outcome-group display cap and asks for narrower filters; source history is capped at 100 rows.
- recordedActionMatrix in business-activity.ts lists exact source-emitted action/type pairs, outcome labels, current permissions and whether the named step completed. Approval/rejection/revision request/publication, complaint resolution/closure, replacement/return/refund completion, payout preparation/decision/payment recording, order/parcel dispatch/delivery/cancellation and exception follow-up resolution are supported. Review-start actions appear only as in-progress history.
- Source evidence: products.ts and seller-applications.ts transition auditAction maps; complaints.ts complaint.admin actions; returns.ts return.admin and return.operations actions; payouts.ts payout operation audit actions; fulfillment.ts order action records; parcels.ts and exception-work.ts transaction audit mirrors.
- Unknown action names, mismatched action/subject-type pairs, unrecorded history and unattributed events are never counted as completion. return.admin.approve is deliberately excluded because it may enter pending high-value approval. payout.request.prepared is excluded from grouped completions to avoid counting a single preparation again when payout.prepared already records it.
- Counts describe recorded steps, not distinct orders, a staff performance score, current approved-seller totals or assurance that every related obligation settled. An approval, rejection, refund record and later follow-up can each be distinct recorded steps. No historical backfill or current-state inference was added.

## Files

lib/db/repositories/business-activity.ts; components/admin/recorded-progress.tsx; app/admin/activity/page.tsx; app/admin/progress/page.tsx; lib/admin/navigation.ts; tests/recorded-progress.test.ts; scripts/verify-exception-native.ts. The earlier R014/R004 report now correctly describes direct customer order links.

## Verification

Focused tests first failed because getRecordedProgress was absent. Final recorded-progress plus business-activity suites pass 9/9. They exercise actor separation, exact completed-action/type allowlisting, review-start exclusion, unknown action exclusion, Nepal date limits, effective permission revocation, mandatory audit access and bound filter text. Targeted oxlint passed.

A fresh synthetic native MariaDB verifier run passed all 8 groups, including a new per-person progress count from a real exception resolution audit and exclusion of assignment events. Output: outputs/consolidated-local-20260913-042936/exception-native-current.json. No existing business database, sender, production change or deployment was used. Parent owns final rendered/browser and cumulative build checks.
