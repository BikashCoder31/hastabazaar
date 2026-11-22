# HastaBazaar Mac continuation handoff

## Active Mac checkpoint

Use `/Users/bikash/Desktop/HastaBazaar Project` for development. The checkout is `codex/company-store-maker-readiness` at `1addd7e9d60ace09e111d30ad5d4a8140998ecc6`, descended from the approved baseline `d9056dc10fee13dc11d15f24a14f63b003befe0b`. Read [AGENTS.md](../../../AGENTS.md), [LOCAL-START.md](../../../LOCAL-START.md) and the [current checkpoint](2026-11-01-implementation-progress.md) first.

Reuse the running [preview](http://localhost:3018). If it has stopped, follow the checked launcher instructions in `LOCAL-START.md`. Preserve the existing local database, browser sign-ins, and staged Git changes. Keep the release hold in effect for staging, deployment, pushes and GitHub Actions.

T34 regression is reconciled with 5,743 passes, zero outstanding ordinary failures and 38 guarded skips across 1,044 files. The latest local Linux archive `2d386958cdff2e506f7354f0c258a83b1df24017a1bf5ff41e8e5b540b55d220` passed four packaged browser gates, 30 targeted native checks and encrypted recovery of both original fictional uploads and their sidecars. [Regression ledger](/private/tmp/hbrs.yYIYm7/reconciled-local-regression.json) · [Package verification](/private/tmp/hb-t35-a05-build.dqqccco8/receipts/historical/postflight.json) · [Recovery verification](/private/tmp/hb-t35-resume-admission.2b1b38344d46/project/.test-artifacts/t35/current-artifact-native-1794957864544/focused-native-recovery-verification.json)

Resume with a fresh isolated role fixture against that exact archive. Verify Incoming payments in Chromium and complete the Seller and eight-area Super Admin walkthroughs. The prior archive passed Seller at desktop and mobile widths. The Incoming payments SQL correction passed native MariaDB and isolated finance tests. The final role retry stopped cooperatively at 4% before Chromium. Its owned test database and network were cleaned up. [Role admission](/private/tmp/hb-t35-commerce-controller.1mcKdE/final-role-preflight.json) · [Cleanup receipt](/private/tmp/hb-t35-commerce-controller.1mcKdE/run-wrapper-result.json)

Wider local acceptance still includes full same-archive native admission, the broader packaged commerce and Team journeys, and populated recovery with the prospective MariaDB schema. The current restore used the historical schema. Keep those items in the [progress ledger](2026-11-01-implementation-progress.md).

## Historical planning packet

<details>
<summary>1 November Windows planning record</summary>

# New-chat handoff — implement the complete Hastabazaar version

Prepared 1 November 2026. This packet is ready for a new implementation chat. The current chat made planning/documentation changes only; it did not resume application implementation.

## How to start

1. Start a new chat attached to the existing **HastaBazaar** project and local folder `C:/Users/abinash/Desktop/HastaBazaar`.
2. Paste the message below. The files are local to this project, so the entire old conversation does not need to be copied.
3. The new chat should begin with **T00**, show the checkpoint/preflight findings and then work through the checklist. Do not ask it to rebuild the design or start from an old worktree.
4. If another chat has already begun implementation, reuse its latest progress ledger rather than launching overlapping edits.

## Paste this into the new chat

```text
Begin local implementation of the complete approved Hastabazaar version, covering all 20 workstreams. Planning is complete; this message authorizes implementation and local testing.

Use only C:/Users/abinash/Desktop/HastaBazaar. Read AGENTS.md and LOCAL-START.md, then:
1. docs/superpowers/plans/2026-11-01-new-chat-handoff.md
2. docs/superpowers/plans/2026-11-01-complete-version-implementation.md
3. docs/superpowers/plans/2026-11-01-implementation-progress.md
4. docs/superpowers/plans/2026-11-01-requirement-coverage.md
5. docs/superpowers/plans/2026-11-01-checkpoint-manifest.json

Start at T00 and reconcile the existing dirty checkpoint before changing code. Reuse verified work and preserve unrelated/pre-existing changes. Follow the six linked implementation parts in dependency order, reading each task's canonical approved specifications. Execute task-by-task in this chat; do not stop after another plan or after only the first workstream.

Keep all 20 workstreams in this version and preserve the latest approved corrections, especially optional registration/product intake, verified-document locks, 6/12-hour order reminders, one eligible Super Admin for finance approvals, shared notifications with no duplicate/stale messages, real variants, and advisory-only discount rechecks with no automatic removal.

Use the approved local launcher and runtime. Never seed, migrate, restore, reset or replace the existing local database to pass startup; do not change the canonical root/baseline or bypass a failed check. Inspect fixture targets before tests, and use isolated fixtures for schema/money/race tests. Keep real email, payments, live data and seller approvals untouched.

Update the progress and requirement-coverage ledgers with concrete evidence after each task. Test changed behavior, role boundaries, recovery and the complete seller/admin/customer journey. Report actual blockers and continue independent work; do not reopen settled business decisions or silently defer scope.

Deployment remains on hold, including staging. Prepare the tested release and concrete production cutover proposal when local work is complete; do not deploy, run live migrations, send real email, change live permissions or activate real sellers without a later explicit instruction. If context ends, save the exact next task and safe checkpoint so another chat can continue.
```

## Read order and scope authority

- [Orchestration checklist](2026-11-01-complete-version-implementation.md): dependencies, contracts, all 20rows, review focus and verification gates.
- [Progress ledger](2026-11-01-implementation-progress.md): current implementation truth and next task.
- [Requirement coverage](2026-11-01-requirement-coverage.md): every controlling source and section, to close with evidence.
- [Version scope](2026-10-31-complete-version-scope.md), [decision register](2026-10-30-planning-readiness-review.md), [complete-plan review](2026-10-31-complete-plan-review.md): approved business behavior and later corrections.
- Six task parts:
  - [1. Foundation and safe checkpoint](2026-11-01-implementation-1-foundation.md)
  - [2. Seller records and review](2026-11-01-implementation-2-sellers.md)
  - [3. Offers, fees and product entry](2026-11-01-implementation-3-products.md)
  - [4. Publication, checkout and orders](2026-11-01-implementation-4-orders.md)
  - [5. Aftercare, payouts and activation](2026-11-01-implementation-5-finance-activation.md)
  - [6. Operations, integration and delivery](2026-11-01-implementation-6-verification.md)

The historical live-maker and public-listing implementation plans from 30 October remain context only. They are not the current execution checklist and must not override the later single-Super-Admin, no-expiry, optional-intake or deployment-hold decisions.

## Local checkpoint and what was actually checked

- Root: `C:/Users/abinash/Desktop/HastaBazaar`; branch `codex/company-store-maker-readiness`; observed HEAD `1addd7e9d60ace09e111d30ad5d4a8140998ecc6`.
- Configured baseline `d9056dc10fee13dc11d15f24a14f63b003befe0b` is an ancestor and canonical root config matches.
- `npm run local:check` passed with 89/89 forms, sign-in schema ready, local staging, no server started/data changed. The preflight itself explicitly does not verify mail/payment delivery.
- The [manifest](2026-11-01-checkpoint-manifest.json) hashes701 pre-existing changed paths within its stated source/planning scopes. It is metadata, not a backup. New preparation files and link-only index updates were written after capture.
- Existing document review/change endpoints, partial seller/profile/product work and Nepali video assets exist. Assess them before rewriting. Live activation in `lib/managed-commerce/activation.ts` includes a simulation path; do not remove that environment guard to claim live support.
- No application test suite, build, browser mutation, database migration, real email, payment, deployment or live seller approval ran during this preparation.
- Do not open old recovery archives or launch retired copies. Do not treat branch name, old screenshots, historical reports or local source as current production evidence.

## Preserve these decisions

All 20 active workstreams are required. Seven seller sections and eight admin areas are approved. Forms should be stable and user-friendly; initial fields are optional while later actual actions keep appropriate prerequisites. Product approval/publication, seller order activation and payouts are separate states. Reviewed evidence stays locked until a reasoned scoped change. Old orders keep their original money/terms/offer/address facts.

The12% transition uses the real recorded start and new-order terms gate; do not hardcode an invented date or retain old9% for future orders after the common start. Private profit inputs remain private. The30-day discount review is an optional suggestion, not expiry. Used/refurbished/open-box/demo goods and the new backup program remain deferred. One eligible Super Admin is enough for approved finance stages; actual evidence/conflict/uncertainty checks remain.

The user previously preferred holding staging and eventually deploying local work to production. Both deployment actions remain held in this handoff; implementation first prepares the concrete verified result.

## Continue safely if the chat becomes long

After every task record its evidence and the next task. Before ending a turn at a meaningful checkpoint, state the last verified task, remaining tasks, any running process and any unresolved target/permission issue. Do not mark all work complete just because a context or usage limit is approaching. A later chat should read the updated ledger and continue rather than replaying completed work.


</details>
