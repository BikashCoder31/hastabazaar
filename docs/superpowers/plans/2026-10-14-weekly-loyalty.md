# Weekly Loyalty Implementation Plan

**Goal:** Implement the approved repeating 7-day rewards [5,7,9,10,11,13,15], editable on the Loyalty page, with missed-day resets and optional grace disabled by default.

**Architecture:** Extend immutable loyalty revisions with an optional weekly schedule and grace policy. Existing fixed-award revisions remain readable and unchanged. Derive each customer's next cycle position from their last recorded claim; record and enforce the chosen cycle state atomically with the award using database guards. Reuse current authorization, budget consumption, immutable ledgers, attempt recovery, draft/publish and reports.

**Approved design:** The user's explicit instruction in this chat. A Nepal calendar day without a successful claim restarts the next claim at Day 1. Grace permits one missing calendar day per cycle, awards nothing for that day, and is refreshed only at a new cycle. Day 7 completion starts another cycle. Already earned points and wallet credit remain unchanged. All settings, forecasts and history stay on the Loyalty page.

**Contracts:** `LoyaltyTerms` and `CustomerLoyaltyState` gain optional `weeklyPoints: readonly number[]` and `graceEnabled: boolean`. Legacy absence means fixed daily awards. A weekly schedule has exactly seven positive, strictly increasing safe integers with a safe total; `dailyPoints` equals Day 1 for compatibility. `ClaimResult` and `RewardsView` gain optional `cycle: LoyaltyCycleProgress`, with `{day,number,graceUsed,graceApplied,resetReason,lastClaimDate}`. Reasons are `first_claim`, `missed_day`, `cycle_complete`, or null. The view describes today's claim position, or the next claim when not claimed today. Rate changes apply prospectively to new claims and do not rewrite previous claim snapshots.

## Tasks

- [x] Write failing real-migration tests for seven awards, repeat, Nepal midnight, missed days, one-use grace, disabled grace, exact replay, budgets and forged cycle metadata. Implement policy, migration and repository.
- [x] Update admin editing, validation, retained attempts and weekly cost forecast with tested seven-day fields and grace control.
- [x] Update customer reward cards, current cycle, reset/grace messages and successful claim reconciliation with mounted/SSR regressions.
- [x] Extend overview, customer/activity reports and before/after history to include weekly schedules and recorded cycle information.
- [x] Run focused regressions, project suite, typecheck, lint and native build. Seed isolated verification scenarios, restart localhost:3000, verify the admin controls and customer progress in Chrome, and leave useful tabs open.

## Review focus

- The server and database must agree on cycle day and exact points; client-provided progress must never grant awards.
- Grace is allowed only for a one-day gap, once per cycle, with no missed-day points.
- Same-day duplicate claims and lost-response replays must not advance twice or consume additional budget.
- Existing fixed-award snapshots, denomination lock, points balances and wallet credit must remain intact.
- Publishing changed rewards/grace applies to future claims; unchanged dates preserve original milliseconds.

Local implementation remains in the existing isolated full preview. No production publication, permission changes or external financial transactions are involved.

## Verification and review evidence

- Full suite: 2,603 tests; 2,588 passed, zero failed, 15 native integration tests skipped. Log: `.wrangler/full-preview/weekly-full-suite.log`.
- Nine cycle and three subsequent publication/midnight tests passed against the real migrations and SQLite-backed repositories. Log: `weekly-backend.log`.
- Full TypeScript check, native build, changed-file lint and all 34 Super Admin HTTP routes passed.
- Fresh review identified same-day publication, weekly-to-fixed replay and midnight-read interleaving issues; all were repaired and covered by regressions.
- Chrome verified editing Day 6 and enabling grace in a saved draft. Real local API publication verified grace continuation; approved rewards and OFF grace were restored.
- Chrome verified a missed-day customer restarting at Day 1, earning exactly 5 points once and retaining its prior 12 points. The customer now has 17 points.
- Responsive browser QA found the outer implicit grid track expanding to the activity table's intrinsic width (1,125px document at an 877px viewport). The page now has an explicit zero-minimum single column; the rebuilt page fits at actual 877px and 562px viewport widths, with equal document widths and activity tables scrolling inside their own regions. The temporary browser viewport was reset.
- MariaDB schema was generated and statically reviewed; native MariaDB execution is not part of the isolated SQLite preview.
