# T29 reminder and operational producer evidence

Scope: canonical source checkout only. No canonical database migration, seed, reset, restore, job enablement, deployment, SMTP/provider call or real payment. Fixtures inspect `:memory:` and use fictional accounts. Mail checks use an explicit capture transport. Root owns shared0147/schema, routing/recipients, scheduler and final integration; delivery owner owns transport/attempt protocol. This note does not independently sign off whole T29.

## Controlling requirements

Read T29 in implementation part5; complete Email delivery sections1–8; System health sections1–10; T29 preparation; relevant existing native worker/source implementations. Approved Team policy line95 explicitly defines midpoint of the original first-action allowance, including a one-hour backup alert for a two-hour cancellation target; discovering overdue work skips obsolete midpoint catch-up. Existing backup-program deferral remains unchanged.

## Reused and completed producer map

| Source | Implemented connection |
|---|---|
| Order preparation | Bounded source-scoped wrapper around original6/12/absolute24-hour evaluator and case supervision. Original release/hold clocks, customer grouping, milestone uniqueness and progressed/resolved suppression retained. |
| Manual bank payment | Original reminder/expiry maintenance, with optional exact order scope. Original24-hour window, claim suppression and buffer remain; no second timer or money execution. |
| Fee terms | Existing bounded durable fee scan, original acceptance/replacement/notice/courtesy clocks and hold summaries. No parallel fee clock. |
| Aftercare | Native first-review,24/48-hour clarification and explicit promised/substantive updates produce immutable due milestones. No late24-hour clarification catch-up at48 hours. |
| Recovery | Original provider-contact observer and review/contact adapters, actual day3/day7/instalment/owned-next-action facts. Captured mail cannot create provider-contact proof or start a response window. No automatic collection, deduction or transfer. |
| Other owned review work | Reuse exact existing review-task source/authority adapters. First-action original due and approved unclaimed midpoint; specialized families excluded to avoid duplicate clocks. Payment/recovery claims use their native review-task allowance. |
| Optional price advice | Reuse original day23/day29 evaluator and permanent sent/skipped/dismissed cycle state. No price/discount change, expiry, required response, repeated cycle or new overdue task. |
| Refunds | Authorization/obligation, destination verification and exact packet preparation/approval/processing/uncertain/paid/failed/void/funding-blocked notices are saved with native source event and current-marker CAS. |
| Actual payouts | Original native preparation, held-earnings release and retirement; exact bank-packet transitions across native models. Release has its own real seller/retained entitlement audit source, never a fabricated payout row. |
| T28 evidence | Actual clearance record/revocation and reviewed financial issuer/series scope. Expired/superseded activation advice is suppressed while original invoices/money remain unchanged. |
| Other standalone finance | Exact lawful fee authorization, actual original invoice-credit artifact and current company-funding-statement notices. Authorization/credit/statement verification never claims bank payment. Older statement notices follow the current funding pointer. |
| Programmes | Legacy governance promotion producers preserved. Separate actual promo publish/pause and loyalty publish/pause/schedule-cancel native audit hooks; internal policy/Super Admin only. Read-only original campaign expiry and existing effective-loyalty projection generate current milestones without publishing, consuming promotions or crediting rewards. |

## Durable dispatch and current-source protocol

`processReminderDispatch(db,{now?,limit?,deadlineMs?})` returns scanned/created/cancelled/cursors/failures/busy/budgetExhausted. Deadline is an absolute wall-clock deadline; default budget15s. Limit bounds selected source records across families. One expiring dispatch lease plus per-family durable cursor rotates work fairly; unresolved first pages cannot permanently starve later sources. Maria `cursor` identifiers are quoted. Existing evaluator defaults remain unchanged.

Immutable reminder identities contain original family/source/milestone/anchor/dueAt, never mutable assignment revision or retry time. Milestone creation has native source/CAS and original due-clock guards. Durable milestone→common-outbox handoff retries the same identity after interruption. Current assigned/backup eligibility and original parties are rechecked; reassignment preserves age, suppresses former-owner work and reaches the newly eligible owner without duplicating mandatory oversight.

Programme first observation records current native revision/scheduled provenance without replaying historical publish/pause mail. Existing future schedules notify at their original deadline. Already-past transitions are retained as `observed_past:*` metadata and never become retrospective alerts. Final natural-event marker/outbox batches repeat exact source and due-clock guards, so a concurrent genuine publish/pause wins over stale expiry work.

New finance event IDs use the same collision-safe actor/request/action/kind/source digest as their new native event/audit, or the exact immutable native authorization/statement/document ID. Existing historical IDs are unchanged. All converted refund-event callsites await their statements, including return loss/satisfaction history helpers; no Promise enters a D1 batch. Replays return before hooks. Native decision/money guards and notice-marker revision fences share the original transaction.

Financial staff eligibility excludes current and retained original parties. Bank packets validate retained model/id/sellerId/nonempty owner and reject retained owners for all models. Returned-refund outcomes additionally exclude retained returned-receipt interests, retained/latest logical-account conflicts and original recovery parties. Bodies are fixed safe summaries; private reasons, account numbers, evidence and costs are not copied.

## Proactive obsolete work

Bounded stale-notice reconciliation uses complete shared current-source checks and current authority, plus atomic queue lease and delivery-owner no-handoff fences. It cancels obsolete queued/retrying work even during valid backoff. Accepted, captured, uncertain and handoff-started attempts are never rewritten. Legacy attempt counters without complete durable history remain held. A same logical never-accepted row may resume after validated source/grant restoration; attempts and backoff are preserved, and no new logical copy is created. Security/delivery codes, unknown legacy message families and valid contact-only/guest records stay with their owning delivery paths. An absent account recipient alone cannot establish resolved work or lost access.

## Observed focused evidence

- Dispatcher: intended missing-module red, then2/2 green; concurrent scheduled calls at12h create one escalation and no stale6h reminder, no outgoing money; expired budget performs no scan.
- Current aftercare:2/2 green; exact same milestone/deadline across assignment and grant changes, safe bodies, current48h-only clarification discovery.
- Finance producers: missing adapter/empty queues red, then3/3 green; actor-SA and owner once/channel, packet status separation, standalone actual customer refund.
- Actual finance capture:1/1 green through real common sender with explicit capture result; eligible actor-SA and owner both reach captured status. Fictional staff sign-in identity was completed in the test; production staff checks unchanged.
- Retained registered-owner privacy: red produced2 unauthorized staff copies, then1/1 green for new copies and current-marker historical eligibility denial.
- Standalone finance/T28:4/4 green; exact fee authorization, new funding pointer, original credit artifact, held release without payout, revocation and superseded scope advice.
- Programme:4/4 green; pre-existing future baseline/original expiry, permanently silent already-past baseline, genuine pause race preserves new marker, scheduled loyalty observation changes no programme/audit/wallet/claim facts.
- Backoff cancellation:2/2 green; obsolete retry, handoff/accepted/captured retention, restored access same-row resume, competing sender lease CAS.
- Final bounded guest/contact assertion:2/2 green again after preserving valid nullable-recipient guest rows for the original sender adapter; `.test-artifacts/t29/obsolete-notice-final.tap`. Fictional guest shape satisfies the native recipient/contact CHECK; no send occurs.
- Root-reported native financial-hook regressions2/2 and customer-return reversals2/2 passed in nonpersistent D1. Root owns their artifacts, final typing, source parity and actual protected-destination/capture integration.

Final serialized producer artifact: `.test-artifacts/t29/producer-final-memory.tap` — observed exit0,18/18 passed,106.82s. No test result establishes actual host scheduler capacity, provider inbox receipt or a configured independent outage contact; those remain separately controlled operational evidence.

