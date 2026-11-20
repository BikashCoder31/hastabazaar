# Complete version — Operations, integration and delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Prepared 1 November 2026. Documentation only; implementation remains on hold until the user resumes it. This is part 6 of one release, not a separate release.

**Goal:** Complete the ordered tasks below against their approved source requirements.

**Architecture:** Extend the existing repositories, guards, feature-owned forms and shared projections. Use the [orchestration plan](2026-11-01-complete-version-implementation.md) for cross-task contracts and policy precedence.

**Tech Stack:** Existing React 19 / vinext / TypeScript application, Drizzle schema, D1/SQLite and native MariaDB adapter, Node test runner and approved browser tools.

**Spec:** [All 20 workstreams](2026-10-31-complete-version-scope.md); each task lists its canonical sources. The source requirements remain controlling when a short task summary omits detail.

## Global Constraints

Read the [orchestration constraints](2026-11-01-complete-version-implementation.md) and [new-chat handoff](2026-11-01-new-chat-handoff.md) first. No code, data, release or live record changes are performed by preparing this plan. During implementation preserve the canonical checkout and dirty checkpoint; do not seed/reset/migrate existing local data to pass startup. Update the [progress ledger](2026-11-01-implementation-progress.md) with evidence after each task. Planned filenames are exact intended locations; if an existing implementation already provides the responsibility, record that mapping and reuse it rather than duplicate it.

## Review Focus

Apply the five failure modes in the orchestration plan to the owning tasks below. Test actual state/transactions, not only source-text patterns. Existing targeted tests are starting coverage, not proof that the new cases are already implemented. New test files must be written before their related new behavior. Do not create artificial red tests for unchanged, already-proven behavior.

## T30. Finish Team, System health, incidents and audit records

**Workstreams:** V17, V03, V16. **Depends on:** T02, T03, T29.

**Canonical requirements:** [2026-10-31-team-business-policies](../specs/2026-10-31-team-business-policies.md); [2026-10-31-system-health-records](../specs/2026-10-31-system-health-records.md).

**Files**

- Inspect/reuse; modify only where required: [app/admin/team/page.tsx](../../../app/admin/team/page.tsx); [lib/db/repositories/staff-permissions.ts](../../../lib/db/repositories/staff-permissions.ts); [app/admin/forms/page.tsx](../../../app/admin/forms/page.tsx).
- Create if not already supplied by a verified equivalent: `components/admin/system-health-workspace.tsx`; `lib/operations/incident-review.ts`; `tests/system-health-ownership.test.ts`.
- Test: `tests/system-health-ownership.test.ts` (planned); [tests/business-settings-permissions.test.ts](../../../tests/business-settings-permissions.test.ts).

**Interfaces:** Consumes authority matrix, continuous calendar, heartbeat/queue/form journey evidence and owned tasks. Produces real service-health/incident records, access-review work and recovery history.

**Behavior and acceptance cases**

- [ ] Revoked staff cannot act through an already-open tab; task assignment is handed to an eligible owner.
- [ ] Email worker silence or supported form blockage creates the right incident with one alert episode and concrete next action.
- [ ] Incident resolution needs actual recovery evidence; acknowledgement is not repair.
- [ ] No daily/hourly backup scheduler, new restore UI or fabricated one-hour recovery promise is added.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Complete invite/grant/revoke/offboard flows with immediate enforcement, owner/backup handoff and 30-day access review. Real roster/contact assignments require actual eligible accounts, not invented coverage.
- [ ] 4. Rename Business emails to Email delivery and clearly distinguish queued, trying/retrying, provider-accepted, failed/intervention and uncertain. Show next automatic action, oldest actionable age and outage/recovery without exposing secrets.
- [ ] 5. Critical incidents: immediate alert,15min acknowledgement,1h containment plan, hourly updates. High:1h acknowledgement,4h plan/update cadence. Routine: first review within one service business day.
- [ ] 6. Show Form Management health from real submissions and persisted outcomes, not only metadata existence. Provide scoped diagnostics, stable audit search, permission checks and retained history.
- [ ] 7. Respect the deferred new backup program; retain existing operation-specific safeguards, source/destination review and reconciliation for any authorized recovery.
- [ ] 8. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/system-health-ownership.test.ts tests/business-settings-permissions.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T30's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T31. Finish every admin area and paired seller/customer screen

**Workstreams:** V02, V03, V08. **Depends on:** T05, T09, T10, T18, T19, T22, T24, T26, T27, T29, T30.

**Canonical requirements:** [2026-10-31-seller-customer-screen-walkthrough](../specs/2026-10-31-seller-customer-screen-walkthrough.md); [2026-10-30-super-admin-overview-review](../specs/2026-10-30-super-admin-overview-review.md); [2026-10-30-finance-payments-workspace](../specs/2026-10-30-finance-payments-workspace.md); [2026-10-31-fees-programs-promotions-workspace](../specs/2026-10-31-fees-programs-promotions-workspace.md).

**Files**

- Inspect/reuse; modify only where required: [app/seller/page.tsx](../../../app/seller/page.tsx); [app/seller/profile/page.tsx](../../../app/seller/profile/page.tsx); [app/seller/products/page.tsx](../../../app/seller/products/page.tsx); [app/seller/orders/page.tsx](../../../app/seller/orders/page.tsx); [app/seller/finance/page.tsx](../../../app/seller/finance/page.tsx); [app/admin/layout.tsx](../../../app/admin/layout.tsx); [lib/admin/navigation.ts](../../../lib/admin/navigation.ts); [app/account/orders/page.tsx](../../../app/account/orders/page.tsx); [app/orders/[orderNumber]/page.tsx](../../../app/orders/[orderNumber]/page.tsx).
- Create if not already supplied by a verified equivalent: `tests/workspace-paired-states.test.ts`.
- Test: `tests/workspace-paired-states.test.ts` (planned); [tests/seller-dashboard-experience.test.ts](../../../tests/seller-dashboard-experience.test.ts); [tests/return-case-presentation.test.ts](../../../tests/return-case-presentation.test.ts).

**Interfaces:** Consumes final capabilities, owned tasks, public projections and money states. Produces the approved complete seven-section Seller Center, eight-area Super Admin workspace and customer journey state map.

**Behavior and acceptance cases**

- [ ] Every task card opens the exact authorized record/section and returns with context.
- [ ] Overview counts, seller Home and detail records agree after state changes and recovery.
- [ ] Pending/held/approved/published/paid states are accurate in both seller and customer views.
- [ ] All eight admin areas and seven seller sections contain their completed workflows; no placeholder screens counted complete.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Walk every approved screen/state in the canonical paired walkthrough; finish content behind the shell, not just navigation. Home prioritizes actionable work and actual next actor/time.
- [ ] 4. Ensure Overview can reach seller, product, order, payment, refund, payout, support and system evidence/review in context; filters/counts use the same state model as detail pages.
- [ ] 5. Customer screens distinguish payment claim/verified, approval/publication/order availability, delay/cancellation/return/refund initiation/actual completion. Preserve useful input and one reference across support.
- [ ] 6. Verify mobile, keyboard, readable errors, busy/double-click behavior, empty states and role-specific privacy. Remove obsolete optional labels, government-ID wording, confusing rate pairs and impossible-action prompts only in their approved scope.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/workspace-paired-states.test.ts tests/seller-dashboard-experience.test.ts tests/return-case-presentation.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T31's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T32. Refresh the Nepali registration guide and in-context help

**Workstreams:** V18. **Depends on:** T06, T17, T31.

**Canonical requirements:** [2026-10-30-seller-order-response](2026-10-30-seller-order-response.md); [2026-10-31-seller-customer-screen-walkthrough](../specs/2026-10-31-seller-customer-screen-walkthrough.md).

**Files**

- Inspect/reuse; modify only where required: [output/seller-registration-guide-nepali/README.md](../../../output/seller-registration-guide-nepali/README.md); [output/seller-registration-guide-nepali/narration-ne.md](../../../output/seller-registration-guide-nepali/narration-ne.md); [output/seller-registration-guide-nepali/subtitles-ne.srt](../../../output/seller-registration-guide-nepali/subtitles-ne.srt); [app/sell/apply/page.tsx](../../../app/sell/apply/page.tsx).
- Create if not already supplied by a verified equivalent: `components/seller/registration-guide.tsx`; `tests/seller-guidance-links.test.ts`.
- Test: `tests/seller-guidance-links.test.ts` (planned).

**Interfaces:** Consumes final tested registration/dashboard journey and existing local video/voice assets. Produces reviewed Nepali narration/subtitles/video with accessible working embed and help fallback.

**Behavior and acceptance cases**

- [ ] Guide player and fallback work from registration and help, without blocking form saving/submission.
- [ ] Every shown action matches final UI; Nepali narration/subtitles are understandable and synchronized.
- [ ] Video contains no real seller or company financial evidence.
- [ ] Missing/broken media is reported as unfinished; file existence alone is not completion.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Inspect existing seller-registration-nepali.mp4 and hastabazaar-seller-guide-nepali-voice.mp4, narration, frames and timings; record reusable parts instead of starting over.
- [ ] 4. Rewrite/record the guide to the final easy registration, truthful autosave, optional intake, dashboard completion and product support flow. Remove obsolete phone verification/bank-in-registration instructions.
- [ ] 5. Use synthetic seller details, no private emails/PAN/bank credentials or real evidence in recordings. Provide accurate Nepali subtitles, controls and text/help alternative; no autoplay.
- [ ] 6. Validate desktop/mobile playback and seek/subtitle timing on the intended media delivery path. If a generator/provider is needed, inspect already-authorized capability; do not assume a new paid subscription.
- [ ] 7. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/seller-guidance-links.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T32's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T33. Rehearse all schema/data transitions and prepare the cutover map

**Workstreams:** V19, V20, V04, V14. **Depends on:** T28, T29, T30, T31.

**Canonical requirements:** [2026-10-31-complete-version-scope](2026-10-31-complete-version-scope.md); [2026-10-31-bank-identity-changes-payout-approval](../specs/2026-10-31-bank-identity-changes-payout-approval.md); [2026-10-31-retail-categories-product-variants](../specs/2026-10-31-retail-categories-product-variants.md).

**Files**

- Inspect/reuse; modify only where required: [db/schema.ts](../../../db/schema.ts); [lib/runtime/node-bindings.ts](../../../lib/runtime/node-bindings.ts); [deployment/babal/mariadb-schema.sql](../../../deployment/babal/mariadb-schema.sql); [scripts/generate-mariadb-schema.mjs](../../../scripts/generate-mariadb-schema.mjs); [tests/helpers/staging-native-fixture.ts](../../../tests/helpers/staging-native-fixture.ts).
- Create if not already supplied by a verified equivalent: `tests/complete-version-migration.test.ts`.
- Test: `tests/complete-version-migration.test.ts` (planned); [tests/company-store-native-schema.test.ts](../../../tests/company-store-native-schema.test.ts); [tests/commerce-financial-native.test.ts](../../../tests/commerce-financial-native.test.ts); [tests/commission-continuity-native-adapter.test.ts](../../../tests/commission-continuity-native-adapter.test.ts).

**Interfaces:** Consumes reviewed additive migrations and a proven disposable source fixture. Produces migration parity, before/after reconciliation report and a concrete later-release source/destination/cutover proposal.

**Behavior and acceptance cases**

- [ ] Upgrade and safe rerun leave historical values identical and do not duplicate stock, money or notifications.
- [ ] Old single products map without fabricated variants; unverifiable records remain visible for review, not silently activated.
- [ ] Native transaction/collation/date/JSON semantics match domain expectations on both adapters.
- [ ] Reconciliation failure stops cutover and names exact affected records/counts without exposing private evidence.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Apply prepared migrations only to isolated test targets after guard inspection. Test native MariaDB and D1/SQLite with real constraints; a skipped native test is not a native pass.
- [ ] 4. Reconcile counts/IDs/owners/drafts/uploads/evidence/change requests/profile versions, live/candidate offers, available/reserved stock, orders/invoices, benefits/fees/terms, ledgers/payout/refund/recovery and event keys.
- [ ] 5. Classify old pending/unclassified protected requests into proper holds while preserving original dates; record cutover commitments rather than inventing historical breaches or sending historical reminder floods.
- [ ] 6. Document real operational dependencies: actual rate timestamp, eligible staff/coverage, SMTP/provider/domain configuration, job scheduler, company/seller evidence, carrier routes and supported settlement model.
- [ ] 7. Prepare explicit later migration/deployment source, destination, compatibility, interruption and reconciliation/rollback criteria. Never automatically seed, migrate, restore or reset canonical local data or live data.
- [ ] 8. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/complete-version-migration.test.ts tests/company-store-native-schema.test.ts tests/commerce-financial-native.test.ts tests/commission-continuity-native-adapter.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T33's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T34. Run integrated verification for all twenty workstreams

**Workstreams:** V01, V02, V03, V04, V05, V06, V07, V08, V09, V10, V11, V12, V13, V14, V15, V16, V17, V18, V19, V20. **Depends on:** T00, T01, T02, T03, T04, T05, T06, T07, T08, T09, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20, T21, T22, T23, T24, T25, T26, T27, T28, T29, T30, T31, T32, T33.

**Canonical requirements:** [2026-10-31-complete-version-scope](2026-10-31-complete-version-scope.md); [2026-10-31-complete-plan-review](2026-10-31-complete-plan-review.md); [2026-10-31-seller-customer-screen-walkthrough](../specs/2026-10-31-seller-customer-screen-walkthrough.md).

**Files**

- Create if not already supplied by a verified equivalent: `tests/complete-version-journeys.test.ts`.
- Test: `tests/complete-version-journeys.test.ts` (planned).

**Interfaces:** Consumes completed task evidence and approved requirement coverage ledger. Produces integrated test report, role/mobile/browser evidence and a reconciled V01–V20 completion matrix.

**Behavior and acceptance cases**

- [ ] Every task-specific test and every canonical acceptance section is accounted for in the coverage ledger.
- [ ] Real browser journeys demonstrate successful submissions and state changes, not only source-string tests.
- [ ] No real email/payment or real seller approval occurs in local testing; capture and simulated money remain enforced.
- [ ] Source/build identity matches final evidence; any post-test code change triggers its relevant recheck.

**Implementation steps**

- [ ] 1. Read all controlling sections and acceptance cases in the canonical sources, inspect the mapped code, and record which behavior is already present. Add each relevant source section to the coverage ledger; later user amendments outrank older wording.
- [ ] 2. Add the missing acceptance cases above to the named test file(s), using isolated fixtures and authoritative time. Run the command below and confirm each new test fails for the intended missing behavior, not bad setup or an unrelated pre-existing failure.
- [ ] 3. Run meaningful unit/database integration suites plus npm run lint, npm run typecheck and npm test. Record actual pass/fail/skip; broaden tests after changes or unresolved concerns, not repeatedly without cause.
- [ ] 4. Inspect build/package scripts and run npm run build and the authorized production-host build/package path only after local verification. Do not upload/deploy as a side effect; record exact artifact hash and source state.
- [ ] 5. Use npm run local:check then npm run dev for canonical browser preview. Browser writes use only identified fictional local accounts/test records through normal flows; no seed/reset/alternate launcher to make tests pass. Inspect any old browser script's target before reuse.
- [ ] 6. Exercise applicant→draft→submission→correction→PAN/identity/bank→product offer→admin review→public browse→eligible activation→order→payment/COD→delivery→refund/payout/recovery end to end, including negative and race cases.
- [ ] 7. Test old signed-in sessions, role revocation, owner isolation, stale versions, interrupted upload, failed autosave, duplicate clicks/jobs, uncertainty, scheduler outage and recovery. Validate actual native fixture execution separately.
- [ ] 8. Close every requirement ledger item with evidence or an explicit unresolved gap. All 20 streams remain one version; do not call a partial set complete or hide missing external setup.
- [ ] 9. Rerun the targeted command, resolve introduced failures and inspect authorization/privacy, atomicity, historical preservation and notification consequences. For interface/schema changes run `npm run typecheck` and the affected native fixture tests; record skipped/unavailable checks explicitly.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/complete-version-journeys.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T34's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.

## T35. Prepare the release and continuation handoff without deploying

**Workstreams:** V19. **Depends on:** T34.

**Canonical requirements:** [2026-10-31-complete-version-scope](2026-10-31-complete-version-scope.md); [2026-10-31-complete-plan-review](2026-10-31-complete-plan-review.md).

**Files**

- Inspect/reuse; modify only where required: [docs/superpowers/plans/2026-11-01-implementation-progress.md](2026-11-01-implementation-progress.md); [docs/superpowers/plans/2026-11-01-new-chat-handoff.md](2026-11-01-new-chat-handoff.md).
- Test: `tests/complete-version-journeys.test.ts` (planned).

**Interfaces:** Consumes final verified source/artifact/data/configuration evidence. Produces release-ready or blocked report with exact remaining actions and safe continuation instructions; no automatic deployment.

**Behavior and acceptance cases**

- [ ] Release report covers all 20 streams and distinguishes implemented, verified, configured, deployed and real-record activated.
- [ ] Neither local success nor an artifact file is described as production deployment.
- [ ] Future chat can continue from the ledger without rerunning settled design approvals or losing paused work.

**Implementation steps**

- [ ] 1. Update all task/workstream statuses, exact commit/diff/artifact hashes, test results, migration rehearsal and unresolved real operational evidence.
- [ ] 2. Read actual hosting/deployed versions and GitHub repository visibility when authorized access is available. Preserve/finish the earlier repository-private restoration intent if relevant; do not make the repository public as a release workaround by assumption.
- [ ] 3. Staging remains held. The last preferred future route was local-to-production, but this plan/handoff alone does not authorize deployment, live migrations, credential changes, real notifications, real money or blanket seller activation.
- [ ] 4. Present a concrete tested release/cutover/reconciliation proposal for the user's later deployment instruction, with existing operation-specific safeguards. Keep new backup-program scope deferred.
- [ ] 5. If context ends earlier, leave a clean task-level checkpoint with last evidence, next exact task and blockers; do not mark unfinished work complete.
- [ ] 6. Review the already-recorded verification output against final source hashes; rerun relevant checks only if something changed. This handoff task creates no application test or deployment.

**Targeted command** — execute in the canonical checkout only after the fixture/target review; these commands were not run during planning:

```powershell
node --import tsx --test --test-concurrency=1 tests/complete-version-journeys.test.ts
```

- [ ] Record the source diff, exact command/result, role/journey evidence, schema/runtime dependencies and remaining gaps in T35's progress row. Review the diff before a task-scoped commit/checkpoint; never bulk-stage pre-existing changes. Do not mark this task verified on UI appearance or file existence alone.


