# T30 shared assignment and coverage evidence — 2026-11-03

Scope: the canonical local checkout only. All executed fixtures allocated disposable in-memory SQLite databases. No canonical database, mail/provider, deployment, installer or live data was used. Root coordinates native/global verification separately.

## Implemented contract

`assignReviewTask` retains the original command receipt and executes native source ownership, shared task CAS, receipt and common notices in one batch. Current native permission, reserved status, personal conflicts, source state, assigned incident scope and availability are proved again at commit. Exact replay creates no second receipt/message; unchanged ownership creates no invented assignment transition. A failing notice insertion rolls back assignment and receipt.

The single common family is `workflow.assignment` / `business.workflow.assignment`, related type `review_task_assignment`. Its immutable source is the original assignment audit command key. Current target plus Super Admin oversight receive the assigned-work notice; the former owner receives a separate minimal release with no source/customer/private case detail and only a protected link to their own responsibilities. Current active staff authority is still required for a release. Superseded target notices are suppressed; an old release cannot revive after the person regained that work. The current native source and economic-party/conflict rules govern target links. No separate notification store/family bypass was added.

`reconcileReviewTaskCoverage(db, {taskId, formerOwnerId, now, requestId?, expectedSource?})` returns `settled`, `gap` or `stale` with committed `ownerId` and `changed`. The optional immutable snapshot binds source type/id/revision, original started/due clocks and calendar version. Actual current native permission, Team coverage, availability, personal reader scope and task/source CAS determine candidates. A newly eligible current owner wins over a stale child journal. Native incident ownership is synchronized through the trusted incident helper without impersonating a staff member. Priority concerns use their actual existing native backup, preserving their separate triage/promise contract.

A prior gap receipt cannot claim a later candidate was committed. Receipt identity binds each actual expected task revision; an unchanged real NULL-owner gap writes no new audit/version/notice. A returning eligible backup must be committed before `settled` can be returned. Root owns the additional accepted-handoff/fair coverage scan integration; Finance owns durable access-change snapshot children and retry journal.

## Truthful native system history and source0152

Parent explicitly approved using a NULL-actor shared system audit receipt for automatic source ownership maintenance, rather than attributing it to the human who earlier initiated a grant/offboard action or inventing a financial/triage event. Interactive source behavior remains separate.

`0152_review_task_system_ownership.sql` preserves the original `product_priority_case_revision` human-event branch and adds a strict system-receipt branch. It requires the exact task/source/current and prior native revisions, owner, backup, original human event and original state/triage/next-update facts. The shared owner and real immutable system receipt exist before the native case update. System receipts cannot be rewritten or deleted. There is no table/column addition and source0149/0150 were not edited. Root owns Maria source generation/parity for0152.

Authorized priority staff history now projects a clearly labeled system coverage record alongside retained original native human events. Seller history does not expose the internal system assignment. The shared queue links to a protected assignment-history page, including work reached through the manual payment workspace. That page labels the system actor and explicitly makes no payment, approval, substantive review or repair claim. Original case/product facts and human-event identities remain intact.

## Actual API boundary

The assignment API authenticates current staff through `account.self.manage`, then delegates exact native source/party/permission/scope and transaction authority to the domain command. This removes the stale static map that incorrectly required seller review permission for an explicitly granted incident manager. No global view/management grant is inferred. Task and owner identifier bounds match the191-character stored identifier contract.

The real route test injects session identity and an unused page-navigation boundary only; actual staff role/profile reads, source/party guards, receipt logic and database transactions run. RED: a retained191-character task was rejected400. After the bound correction, RED: its legitimate manage-only incident responder was rejected403 by the stale map. After delegating native authority, GREEN:200 with exact replay retaining one receipt. Revoked domain grant409, suspended account403, unauthenticated401, foreign origin403, over-bound identifier400.

## Executed evidence

- Assignment/native-priority/existing product-priority regression: **12/12 passed**, true process exit0,41.8s. Captured at `.test-artifacts/t30/assignment-notices-regression.tap`.
- Actual assignment API route: **1/1 passed**, true process exit0,4.5s. Console evidence retained in the tool transcript.
- Priority focused native guard cases: **2/2 passed**. Actual publish → report → human triage → grant loss → automatic reroute preserved original state, created/triaged/next-update timestamps, last human event, product row and native event count. Absent receipt, human-attributed system receipt, mismatched prior revision/owner, and attempted state-changing receipt were rejected by the actual trigger.
- Initial assignment RED had no common notices (expected4); the common-family integration made target/oversight, replay and release assertions pass. Commit-time source/permission races and forced notice insertion failure leave no owner transition, receipt or messages. Initial priority history RED exposed the missing authorized system-history projection; the protected projection made it pass.

No global typecheck, browser, native D1 or Maria claim is made by this note. Parent root/Finance own those serialized final checks. Runtime source was frozen for their coordinated native run; no installer or real sender was run.

## Changed files in this slice

- `lib/workflows/review-tasks.ts`: assignment, trusted coverage and protected history sections only; parent owns concurrent list-read/handoff changes.
- `lib/operations/incident-review.ts`: trusted system coverage helper and optional suppression of duplicate generic notices during shared assignment.
- `lib/operations/review-task-assignment-notices.ts` and `review-task-assignment-destination.ts` (new).
- Narrow common-family additions in `business-notifications.ts`, `event-catalog.ts`, `notification-links.ts`, `governance-notice-destination.ts`.
- `lib/products/priority-concerns.ts`: protected system history projection.
- `app/api/admin/review-tasks/route.ts`; `app/admin/review-tasks/[id]/history/page.tsx` (new); `components/admin/shared-review-queue.tsx` history link.
- `drizzle/0152_review_task_system_ownership.sql` (new).
- Tests: `review-task-assignment-notices.test.ts`, `review-task-assignment-route.test.ts`, `review-task-priority-coverage.test.ts` (new).
- This evidence note. Separately, the earlier T32 audit received a clarification that approved-spec narration can be internally reviewed under the user's existing authorization.

## Prepared native0152 constraint helper

`scripts/t30-system-ownership-constraints.mjs` exports `verifyT30SystemOwnershipConstraints(connection)` for the root-owned combined native runner. It creates no connection and accepts only the already selected identity-verified portable fixture database name. It performs no schema modification or guard disabling. Negative multi-statement attempts use savepoints, and any helper failure rolls back the entire helper transaction. The fixture includes actual current staff roles/product-review profiles, a separate seller/product, original reported/human-triaged native events and trigger-created shared task; access loss then has a NULL-actor system receipt, synchronized shared owner and strict case update. Separate actual human resolution follows. It returns named pass checks and preserved human/system facts only after execution succeeds.

The native cases include absence/human attribution/mismatched revision/owner/backup/source, strict system booleans, binary case/trailing-space identities/reasons, coherent forgeries attempting to alter original business facts, a case-only write without shared synchronization, and immutable/retained audit receipt changes including case/space changes. This is native constraint SQL proof, not a claim that raw fixture creation exercises the entire published-product UI journey. The earlier memory priority test exercised real publish/report/triage/domain reroute.

Preparation verification: `node --check scripts/t30-system-ownership-constraints.mjs` exited0. No native process was launched by this agent. Actual native pass/failure evidence belongs to the coordinated root runner after Finance releases its heavy slot; it is not claimed in advance here. The paired Maria SQL generator/candidate are root-owned.

### Strict system boolean parity correction

Root review found that SQLite `json_extract(...,'$.system')=1` also accepted numeric1, while the native helper correctly rejected numeric1. Added a real SQLite forged numeric receipt case: RED was `Missing expected exception` because the native case update incorrectly succeeded. Source0152 now additionally requires `json_type(...,'$.system')='true'`. GREEN:2/2, exit0,9.7s, including retained valid actual boolean proof and the numeric rejection. Saved `.test-artifacts/t30/priority-strict-boolean.tap`. Frozen0152 SHA256: `9E4E160F73DA47DA1F1007D813FDFC699E073D4F661692E5661837D4C73719AD`. Root regenerates the paired native candidate from this source before execution. No runtime freeze file or source0149–0151 was changed.
