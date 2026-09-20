# R014 audit coverage follow-up

Local source review and synthetic verification, 13 September 2026.

## Concrete gaps found and repaired

- lib/db/repositories/operations.ts createShippingJob and operateShippingJob previously wrote shipping_job_events only. They now mirror shipping.request_pickup and shipping.<action> into audit_logs in the same batch, selected from the matching source event. Includes label recording, pickup scheduling, pickup, transit, delivery, claim opening/resolution and reconciliation.
- The same file createDataRightsRequest and operateDataRightsRequest previously wrote data_rights_events only. They now mirror privacy.submit and privacy.<action> (assign, request_information, approve, reject, complete) transactionally.
- app/api/admin/order-emails/retry/route.ts previously invoked the processor without recording the requesting staff actor. lib/operations/manual-email-audit.ts now records attempted before calling it and a separate finished, finished_with_failures, pending or thrown-failed outcome. Only the actor, generated request correlation, fixed action/reason and timestamp are stored; no recipient, message, notes, identity details, provider exceptions or counts. An attempted row without outcome remains possible after interruption/audit failure. This trace does not promise exactly-once mail or delivery. The existing processor can return pending on configuration/internal failure; the wrapper preserves that uncertainty.

The SA viewer links these sources to existing staff queues. Recorded progress adds only shipping delivery/claim resolution and privacy completion/rejection, restricted by current source permission and actor. Mail processing attempts/results are not completed business-work counts.

## Source inventory checked

Already central-audited: product submission/revision/review/classification/inventory/archive/delete (including consolidated SKU changes); seller application submission/review and seller profile change; taxonomy changes; fulfillment and cancellation; delivery assignment; parcel setup/operations/courier cost/cash/remittance; payout preparation/review/payment/request operations; return/complaint source actions; review replies/moderation; staff invitations and permission proposals/decisions; governance promotion, incident, user-status and backup actions; delivery-rate versions; referral-offer configuration; exception creation/assignment/update/resolution. The generic business email manual endpoint now uses the same attempt/outcome wrapper with a distinct business queue/action prefix. New consolidated business actions in this reviewed set have audit entries; no additional missing consolidated mutation was identified in this bounded review.

## Exact remaining limits

- Shipping/privacy actions recorded before this patch remain in their dedicated event tables and are not backfilled into the central viewer. No historical reconstruction was performed.
- Previously executed manual order-email requests have no recoverable actor trace in this endpoint. New requests have the separate attempt/outcome trace above.
- Both manual email endpoints now record an attempt before invoking their processor. External processing and its outcome audit cannot be one transaction: an interruption or failed outcome write leaves the attempt as explicit incomplete evidence. Historical generic-business processing records retain their old result-only format.
- Recorded progress deliberately counts only the explicit action matrix, not every central audit row. Inventory edits, configuration edits, assignments and review-start events are not equated with completed orders or settlements. Queue counts remain current state, not historical work counts.
- Routine notification-read flags, rider location telemetry, and automatic wallet/referral ledger entries are separate source records, not staff completed-action counts. This is not a claim to central-audit every marketplace read or automatic event.

## Verification

Shipping/privacy regression first failed with zero audit rows versus four expected. It now passes and verifies an injected audit failure rolls back both privacy source status and event. Fake-only email tests cover success, pending, partial failure, thrown provider failure, and failure to record an initial attempt preventing processor invocation. Progress regression verifies capability and actor restrictions and excludes email results from completion counts. Combined returns/complaints, exception-work, activity helpers and progress suites: 72 passed. Touched lint passed. No real sender or existing business database was used.

Final generic-business follow-up: fake-only regression initially found the missing business attempt inside the processor. It now verifies the attempt exists before processing finishes and survives a deliberately failed outcome audit. Shared order and business wrapper tests both pass; no sender was invoked.
