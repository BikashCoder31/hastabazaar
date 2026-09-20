# R022 — staff exception follow-up, local bounded implementation

13 September 2026. Source-linked work annotations supplement existing parcel/cash evidence. Existing operational_incidents and its Super Admin governance restrictions remain untouched.

## Implemented

- Additive SQLite 0034_exception_work.sql and Babal mariadb-exception-work.sql add exception_work_items and immutable exception_work_events. No historical records are fabricated or imported. Native tables use InnoDB with utf8mb4_unicode_ci; events reject UPDATE/DELETE.
- Failed-delivery and cancelled-parcel source queues appear at /admin/exceptions without silently manufacturing work records. Staff record report details/evidence references, a next action, and optional active permitted owner; no owner displays Unassigned operations queue.
- /admin/orders/[id] displays per-order follow-up, source reference, responsible reviewer, next action and append-only history. Staff can report customer-unavailable only for dispatched/failed parcels and incorrect cash only with a posted same-parcel cash record.
- Active order.manage authorization is checked at the route and freshly in the repository; incorrect cash also requires payout.prepare for reporter, owner and reader. Assignment commits guard exact permission profiles and current active role; stale task versions, reused conflicting request IDs and source changes fail. Request replay is stable across server timestamps.
- Assignment changes queue one recipient-specific in-app and email notification through the existing business notification helper inside the same transaction as work/event/audit creation. The sender is not invoked here. Its source and permission checks are owned by the notifications agent. Reassigned/resolved follow-ups disappear from previous-owner notification reads.
- Resolving a follow-up requires an existing assigned reviewer or Super Admin, current source progression, explicit source/obligation/next-action attestations and evidence references of at least 30 characters. This closes the annotation only, never a parcel, refund, payment or payout. Incorrect cash remains unresolved until an approved correction workflow exists; posted cash is never changed.

## Files

New: drizzle/0034_exception_work.sql; deployment/babal/mariadb-exception-work.sql; lib/operations/exception-work.ts; app/api/admin/exception-work/route.ts; app/admin/exceptions/page.tsx; components/admin/exception-order-section.tsx; components/admin/exception-work-form.tsx; tests/exception-work.test.ts.

Integration: app/admin/orders/[id]/page.tsx; notification mapper/list/read projection and staff read endpoint; root owns release-manifest/readiness registration and cumulative native/build verification; permissions agent owns navigation and generic sender integration.

## Tests and limits

Initial tests failed on absent implementation. Six isolated synthetic SQLite tests pass: source/idempotency, posted-cash rules, evidence resolution, active owner validation, immutable history, atomic audit failure rollback and assignment permission race. The combined exception-work/business-activity/returns-complaints suites passed 57 tests before the final additional report-detail requirement; all six focused exception tests passed again after that change. Touched-file oxlint passes. No production database, emails, deployment, cron or rider identity changes were made. Native migration and browser rendering were not executed in this bounded agent task.

Rider-side report/proof/rejected-proof integration depends on the business-gated rider identity/evidence workflow and remains pending. The annotation is not a competing financial ledger or automated settlement engine. Resolution evidence is an authorized reviewer attestation linked to the source; it does not calculate financial settlement. Comprehensive notification history for every older incident remains unavailable unless originally recorded.

## Additional R004 navigation correction

Notification reads now obtain customer order numbers only through an order/customer ownership match and link directly to /orders/[orderNumber]. A missing or unverified number falls back to the account order list. Seller product results route to a stable product-list anchor except needs_changes, which opens the authorized revision form. Operational notification destinations use allowlisted internal queues. Tests cover invalid external/path values, customer ownership projection and seller outcome destinations.

## Independent native follow-up verification

A separate scripts/verify-exception-native.ts run created a new exception_verify_* synthetic MariaDB database on local port 13316, applied the full manifest plus repeat R022 migration, and used the actual Node MariaDB/D1 adapter. Seven grouped checks passed: readiness/repeated migration; reporter/owner permissions and timestamp-independent replay; concurrent assignment single winner with one history update and exactly two queued notification channels; immutable history UPDATE/DELETE rejection; source progression and explicit resolution evidence; incorrect-cash resolution blocked with posted record unchanged; revoked operations permissions denying reads/writes. No sender was invoked and no existing business database was used. Machine-readable result: outputs/consolidated-local-20260913-042936/exception-native-current.json.

The first seed attempt failed on a SQLite-specific SQL numeric literal (15_000); only the synthetic verifier fixture was corrected to 15000. No R022 application defect was found in this native pass. The synthetic databases were retained as isolated test artifacts; credentials were not logged. Touched verifier lint passed.

Read-only UI wording review confirmed the form states that follow-up does not change cash or parcel status, resolution requires source/obligation/next-action evidence, and incorrect cash must stay unresolved pending an approved correction workflow. No misleading settlement-completion promise was found; no UI edit was needed during the parent's browser rebuild.
