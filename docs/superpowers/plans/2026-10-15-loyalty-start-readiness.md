# Loyalty Setup and Scheduled Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare clear weekly loyalty setup and genuine future rule changes while keeping the active program paused and unpublished.

**Architecture:** Preserve immutable reward revisions and the deliberate save/publication flow. Add one pending published revision alongside current rules and an editable draft; compute read-only effective state and promote due changes within guarded mutations. Current rules continue until the scheduled Nepal-time boundary, and a later pause overrides scheduled activation.

**Tech Stack:** TypeScript/React, existing D1 repository, SQLite migration and form contracts, Node tests and normal Chrome. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-15-company-store-maker-readiness-design.md`, including the user's explicit choice to keep current rules until a scheduled change.

**Execution:** Main agent implements and controls active database/server. Separate `gpt-6.1-sol` extra-high code/test reviews. Independent of maker behavior; share the same Desktop branch and coordinate additive migration numbering.

## Global Constraints

- Work in `C:/Users/abinash/Desktop/Hatskala`. Preserve newer work.
- Keep `local_staging`, development mode, captured mail and simulated payments. Do not push or deploy.
- Do not reset, seed, replace or restore the active database. Preserve history, uploads and backups.
- Any storage upgrade needs a concrete SQL/source/destination review and an isolated rehearsal before a separately authorized active-data step. Startup checks must never apply it automatically.
- Keep earning paused, grace off and the active revision unpublished during this work. Do not invent start/end dates or budgets.
- All earning dates and claim-day boundaries use Nepal time (`Asia/Kathmandu`, UTC+05:45). Start is inclusive and end is exclusive. End must follow start.
- Approved weekly points are `5, 7, 9, 10, 11, 13, 15`; keep the starting conversion of 100 points = NPR 10.00.
- Preserve immutable claims, exact replay, one claim per Nepal day, finite shared point budgets, denomination locking and earned-point redemption.

## Review Focus

- A stale client at the scheduled boundary must not claim against a different displayed revision (Task 1).
- An operator pausing after scheduling must not be silently overridden at the future start (Task 1).
- Old-program consumption or first issuance may make a future budget/conversion incompatible before its start (Task 1).
- A draft saved while another revision is scheduled must not replace current or pending rules (Tasks 1, 2).
- Reload/lost response must preserve current/pending/draft identity and exact retry intent without exposing private answers (Task 2).

## Existing Work — Reuse, Do Not Rebuild

The 2026-10-14 **Improve commission field handling** chat and completed `2026-10-14-weekly-loyalty.md` confirm the seven editable awards, cycle repeat, missed-day reset, grace toggle, customer check-in, preview, balances/activity/history and prospective claim snapshots were already implemented. They were recovered into Desktop in `55be02c`; current cycle/policy/repository/tests are present. Existing draft/publication/pause and denomination locks also remain in use.

Only the missing initial-setup feedback/default presentation and genuinely pending future rule publication are new here. Current source/config stores current and draft revisions, not a pending replacement; publishing a future-start revision currently replaces current rules immediately. The new continuity behavior was expressly selected in this chat. Do not create a second weekly-cycle engine, claims ledger, report store or scheduler.

## File Structure and Shared Contracts

- Create `lib/incentives/loyalty-effective-state.ts`: pure effective-revision selection and due-change assessment.
- Create `lib/incentives/loyalty-setup.ts`: shared editor input types and field-specific validation/readiness, reusing canonical policy.
- Extend `lib/incentives/types.ts`, `lib/db/repositories/loyalty.ts`, `lib/db/repositories/incentive-reporting.ts`, `lib/incentives/reporting.ts`, the existing admin API/action contract and public rewards projections to use the same effective state.
- Create `drizzle/0072_loyalty_scheduled_changes.sql` (renumber consistently if newer work uses this slot). Coordinate with the maker plan's 0071; no active migration is automatic.
- Create `tests/loyalty-scheduled-changes.test.ts`, `tests/loyalty-setup-readiness.test.ts`; extend the existing admin/publication/reporting tests rather than duplicate their fixtures.

### Task 1: Current, pending and draft revisions with safe scheduled activation

**Files:** Effective-state module, types/repository/reporting, migration and scheduled tests above; modify `lib/forms/incentive-workspace-contracts.ts`, `app/api/admin/loyalty/route.ts`, `components/admin/loyalty-manager.tsx`, public terms/report/CSV consumers, schema-readiness probes in `scripts/start-local.mjs`, and `tests/local-feature-readiness.test.ts`. No separate scheduler or client-supplied authority/time is added.

**Interfaces:** Add nullable `scheduled_revision`, nullable `scheduled_for`, and boolean `scheduled_unpause` to `loyalty_config`, with valid null-pair/flag guards and unchanged old rows. Extend `LoyaltyState` with `scheduledRevision`, `scheduledFor`, `scheduledTerms`, `scheduledUnpause`, and `scheduleBlockedReason`; extend customer status with a public-safe `review_required` state. Export a pure `resolveEffectiveLoyaltyState(stored, now)` returning current effective terms/version, pending state, any blocker and required promotion. Reuse `publishLoyalty`; a future start schedules, an immediate start publishes immediately. Add audited `cancelScheduledLoyalty(db, context)` before the due time or when activation is blocked and no promotion occurred.

- [ ] Write `current rewards continue until the scheduled Nepal boundary`: A is active, future B is saved/published, a claim at `B.start-1` uses A and a claim at `B.start` uses B; page/report/CSV resolve the same revisions without writes. Preserve the global one-claim-per-day guard and return the original response on old exact retry.
- [ ] Assert A still obeys its own expiry, budgets, pause and eligibility before B starts. Continuity never extends an expired campaign or overrides its limits.
- [ ] Write `pause after scheduling overrides activation`, `save draft preserves current and pending rules`, and `cancel pending publication preserves current rules and history`. Scheduling while currently paused does not resume current rules early; its explicit activation intent may start B at its date. A later Pause clears that intent and keeps B paused when due. Only one pending revision is allowed; replacement requires audited cancellation and a new draft/publication.
- [ ] Write boundary/race tests: stale client version, due mutation versus concurrent publication/cancellation, role/form revocation, and duplicate admin/claim actions. `assert.equal(financialWritesAfterRejectedRace, 0)` and preserve exact request/form/audit receipts. Reject cancellation after a valid scheduled revision is effective; permit explicit cancellation of a blocked, unpromoted revision, showing whether the still-valid old rules will resume.
- [ ] Write `due incompatible limits or locked conversion stop earning without losing points`: advance old consumption beyond B's proposed limit, or lock A's conversion after B was scheduled. At B's start return an actionable review-required state, issue no new points, keep old claims/balances/conversion, and permit existing-rule redemption. No obsolete-rule earning continues after the blocked boundary.
- [ ] Run the scheduled tests before implementation; require behavioral failures. Implement read-only due-state projection and atomic promotion at every mutating entry point. A due valid projection reserves the next config version (`stored.version + 1`); mutation promotes that same version in its transaction before normal expected-version/current-revision guards. Old clients then receive stale, not a different silent award. Guard both stored pending identity and the resolved effective version. Apply integer overflow and consumed-total/denomination checks before any promotion.
- [ ] `publish` with an existing pending revision returns conflict until explicit cancellation; saving another draft remains allowed. Immediate publication and cancellation retain immutable revision/audit history. Replays return their original verified response and recheck current authority; they do not create a second promotion. A normal GET must never promote, issue points or update counters.
- [ ] Record an actual due promotion once in the same transaction, using deterministic `loyalty-schedule-activate:<revision>` audit provenance linked to its original publication. It has no fabricated human form answer. Failure of the surrounding claim/admin mutation rolls promotion back too; read-only projections do not create audit rows.
- [ ] Extend the manager's retained attempt/receipt schema and validators with the exact pending revision/time/terms/unpause state; bind it to the digest alongside existing owner/form/config versions. Reject missing/substituted schedule metadata without losing the original retry. A blocked due change does not partially promote or grant an award; cancellation/amendment requires a current authorized action and recorded reason.
- [ ] Run new tests plus `tests/loyalty-settings.test.ts`, `tests/loyalty-claims.test.ts`, `tests/loyalty-redemption.test.ts`, `tests/loyalty-routes.test.ts`, `tests/loyalty-weekly-publication.test.ts`, `tests/weekly-loyalty-reporting.test.ts`, `tests/loyalty-populated-upgrade.test.ts` and schema/native-adapter contract tests. Require zero failures, unchanged existing rows on isolated upgrade, and commit scoped files.

### Task 2: Clear weekly defaults, required fields and publication/change preview

**Files:** Setup module/readiness test above; modify `components/admin/loyalty-terms-editor.tsx`, `components/admin/loyalty-manager.tsx`, `app/admin/loyalty/page.tsx`, `tests/loyalty-editor-presentation.test.ts`, `tests/loyalty-admin-ui.test.ts` and affected public terms tests.

**Interfaces:** Export `LoyaltySetupFields` (the existing editor's string/boolean fields), `assessLoyaltySetup(values, originalTerms)` returning field issues and normalized valid terms or null. Move existing parsing to this shared module and re-export old helpers for compatibility. Extend `loyaltyEditorValues(terms, preferWeekly=false)`; the parent sets `preferWeekly` only for revision 0 with no draft/schedule/issued points. `LoyaltyTermsEditor` reports readiness to its parent; reason and configured custom-answer validation stay in the parent/form runtime.

- [ ] Write `unpublished initial setup shows the approved weekly values but never claims they are saved`: assert seven values, grace false, paused/unpublished state, reload defaults, and unchanged existing draft/legacy fixed/scheduled terms. Assert invalid/missing dates and limits identify the exact field; daily/total limits are described as shared points and each must cover the largest daily award.
- [ ] Write `review distinguishes live scheduled saved and unsaved terms`: changing the editor leaves all persisted states unchanged; saving changes only draft; future publication shows Nepal effective time and continuing current rules; cancellation, scheduled blockers and pause effects are explicit. Published changes cannot consume unsaved edits. Retry recovery must preserve the original current/pending/draft IDs and original private answers after reload.
- [ ] Run these tests before implementation. Implement field labels, inline issues, readiness/effect summary and accessible control states using existing components. Show how to start: fill dates/limits/reason, enable earning when published, Save draft, review saved rules, Publish draft. Show a scheduled-change cancellation action only where authorized and valid. Do not invent financial settings, remove server validation, or make checking a box activate rewards.
- [ ] Keep public views free of draft/pending private financial details and show only effective earning rules. Historical activity/export rows always use each recorded revision/cycle, never today's schedule.
- [ ] Run `node --import tsx --test tests/loyalty-setup-readiness.test.ts tests/loyalty-editor-presentation.test.ts tests/loyalty-admin-ui.test.ts tests/published-loyalty-terms.test.ts tests/weekly-loyalty-reporting.test.ts`; require zero failures and commit the focused UI result.

### Task 3: Complete local proof and leave active earning paused

**Files:** Tests above; update existing loyalty self-test documentation if present, otherwise include the manual checklist in the final response. Evidence stays in a dedicated local artifact directory.

- [ ] Run an isolated full-schema initial paused → enabled weekly draft → save remains inactive → publish/schedule → Day 1–7 claims → repeat/missed-day reset → pause/redemption scenario. Assert `[5,7,9,10,11,13,15]`, total `70`, first/last time boundaries, preserved earlier awards and same-day replay across a rule change. Also exercise disabled future terms and cancellation without side effects.
- [ ] Run focused loyalty suites, `npm run typecheck`, `npm run lint`, `npm run build` and whitespace checks. Obtain separate code and test review; repeat affected checks after fixes. Loopback access, when needed, is for isolated temporary Miniflare fixtures only.
- [ ] Rehearse 0072 against an isolated populated copy, compare every pre-existing column/value/claim/ledger and prove integrity/FKs plus read-only readiness. Combine its exact SQL review with the maker upgrade where practical; obtain concrete active-upgrade approval before changing active schema. Do not publish reward settings as part of an upgrade.
- [ ] In normal Chrome verify desktop and 390px layout, keyboard/error states, weekly initial defaults and explicit current/scheduled/draft labels. Active saved business records remain unchanged: no loyalty draft, publication, schedule, claim or redemption is submitted. Keep the approved schedule visible in the editor, grace off and earning paused.
- [ ] Verify the canonical Desktop server through `npm run local:check`, leave `http://localhost:3018/admin/loyalty#manage` open alongside Program Management, and report Passed/Failed/Not tested plus exact future activation steps. Never infer live or native database readiness from local tests.

## Self-review and Handoff

Task coverage: change timing/continuity/atomicity (1), clear setup and later enablement (2), complete local proof and preservation (3). All five Review Focus cases have named assertions. Current rewards remain active only in isolated fixtures; the active user's local program remains paused.

The user reviews this plan together with the maker plan before implementation. Main-agent execution with the requested independent code/test reviewers keeps shared storage, runtime and financial transitions under one owner.
