# Commission workspace implementation plan

> **For agentic workers:** Implement in this session using superpowers:executing-plans. Steps use checkboxes for tracking.

**Goal:** Manage commission earnings, order breakdowns, scheduled rate changes and history entirely at `/admin/commission`.

**Architecture:** Keep the existing 9% launch rate as the fallback. Store immutable fee schedules and explicit seller acceptances; resolve the latest effective accepted schedule per seller at checkout, snapshot its ID, rate and acceptance onto the order. Use recorded ledger commission and reversals for earnings, with unearned order snapshots shown separately.

**Tech stack:** React, vinext, TypeScript, D1/SQLite with the existing MariaDB adapter.

**Spec:** User-approved in-chat design, confirmed on 2026-10-14 with explicit instruction to implement.

## Constraints

- All staff controls live on Commission. No Business Settings detour or second editor.
- Preserve historical order, refund and ledger snapshots.
- Rates support 0–100% with at most two decimal places. New schedules require at least 15 days' notice, a reason, and explicit seller acceptance.
- Unaccepted sellers retain their latest previously accepted effective rate, or the 9% launch rate.
- Only a staff member with `commercial_policy.manage` can schedule or cancel; recheck authority within the transaction.
- Cancel only future schedules. Keep cancellations and their reasons in history.
- Totals and breakdown use the same filtered order cohort, independent of pagination. Label the date basis clearly.
- Retain the user's unrelated local legal-content edits.

## Review focus

- Mixed sellers and repeated partial refunds must not multiply earnings.
- Future, cancelled and unaccepted schedules must never change checkout rates.
- Stale browser versions, permission revocation and duplicate submission must not create conflicting changes.
- Date inputs use Nepal time regardless of the operator's browser timezone.
- Empty results, pagination and wildcard search must be accurate and usable.

## Tasks

- [x] Add database-backed regression tests for schedule validation, authority, idempotency, cancellation and accepted rates; confirm failing tests before implementation.
- [x] Add schedule, cancellation, acceptance and revision storage with SQLite migration, Drizzle definitions and a MariaDB incremental migration.
- [x] Implement transactional scheduling/cancellation, seller acceptance, per-seller checkout resolution and immutable order snapshots. Verify the regression tests.
- [x] Add filtered, paginated order commission reporting with real ledger earned/reversed/net totals. Test mixed sellers, cancellations and partial reversals against SQLite.
- [x] Implement Commission controls, totals, filters, order breakdown and history; expose fee notices/acceptance in the seller workspace. Verify rendered UI and interactions.
- [x] Run the full test suite, typecheck, lint, build and final review. Record results and remaining limitations.

## Execution notes

Work in the current checkout to make the requested change available here. The user explicitly requested implementation of the presented design; continue without another design approval round. No deployment or live rate changes are part of implementation.

## Verification results

- Full test suite: 265 passed, 0 failed.
- Application-scoped TypeScript check and changed-file lint: passed.
- Babal production build: passed.
- Browser checks on the actual production build with temporary SQLite QA binding: schedule/review/save, seller acceptance, cancellation/history, search/reset and 390px mobile layout passed; no page or console errors.
- Independent review identified returned-to-origin pending earnings; fixed with a failing-then-passing regression.
- Native MariaDB execution was unavailable locally. SQLite migrations applied successfully; the MariaDB additive migration is included in release-manifest integrity checks.
- The root-wide typecheck encounters a pre-existing syntax error in a generated deployment snapshot; the application source check is clean.
