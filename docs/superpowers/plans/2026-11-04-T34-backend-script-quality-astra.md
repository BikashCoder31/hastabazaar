# T34 bounded backend/script quality — 4 November 2026

This is the fresh Astra agent's reserved source/evidence note, not the master ledger, a native rehearsal, or a release certificate. The canonical checkout remains `C:/Users/abinash/Desktop/HastaBazaar`. The existing STOP4/107 startup condition remains unresolved; no launch, canonical database access, seed, migration, restore, reset, live provider, real message/payment, permission change, seller activation, deployment, Git mutation or worktree operation was performed. Video remains explicitly deferred.

## Scope and controlling requirements

Root reserved exactly 21 backend/script files, listed with their exact pre-edit copies and SHA-256 in `.test-artifacts/t34/backend-quality/before-manifest.json`. One dedicated test file, `tests/backend-script-quality.test.mjs`, was added. Other agents' payment/release, cancellation/fulfillment, UI and packaging files were not edited. Root's `getFeeTermsWorkspace(..., now: number = Date.now())` signature remains intact.

Read the local AGENTS/LOCAL-START instructions, implementation-6 verification/T34 journey mapping, complete-version requirement snapshot, and relevant canonical single-SA, Team and seller-response requirements. This slice preserves one eligible SA, native authority/source checks, original 6/12-hour clocks, shared current-recipient notices, source deduplication and historical facts. No master requirements or old evidence were relabeled.

## Changes

- Mechanical changes remove unnecessary array/spread/catch bindings, use `const`, preserve recursive source enumeration while returning promises consistently, and add the actual `mysql2/promise.Pool` type to the native test helper. No await/shutdown behavior was removed. Workspace SQL rows are typed to the scalar values actually selected; runtime conversion stays unchanged.
- Offer strings are narrowed once before checking their bounded length. Account reference validation rejects exactly ASCII codes 0–31 and 127 using equivalent character-code checks. No wider Unicode control policy was introduced.
- Multipart request IDs, scope digests and profile-media kinds must be text. Supported-return intake rejects object/array text fields; valid string and numeric quantities remain accepted by the original return parser. Malformed Team event JSON or a nontext duty ID is ineligible; valid native duty and shared-recipient checks are unchanged.
- Eight unused ORM callback parameters are renamed. `refundCostAllocations` uses Drizzle's array extra-config form with the same composite primary key. The governance generator emits unused callback names consistently and narrows the native PRAGMA index name. It was executed only with captured writes and an explicitly memory-only database, never against a schema file or an application database.
- Portable fixture cleanup now completes cleanup outside the operation's `finally`. A lone operation or cleanup error is rethrown unchanged. If both fail, an `AggregateError` retains the original error as its first entry and cause, plus the cleanup error. Authenticated SHUTDOWN, accepted disconnect codes, connection closure, exact PID/path verification, refusal to count forced stop as success, and fixture authority revocation remain intact. No MariaDB process was started by this task.

## Evidence

All paths below are under `.test-artifacts/t34/backend-quality/`.

| Check | Exact result / artifact |
|---|---|
| Final type-aware oxlint, 21 reserved sources plus new test | Exit 0, zero diagnostics, 7.017 seconds. `scoped-lint-final.json` contains the complete command; `scoped-lint-final.txt` retains raw output. No lint rule or assertion was disabled. |
| `node --test tests/backend-script-quality.test.mjs tests/portable-mariadb-fixture-guard.test.mjs` | **13/13 PASS**, zero skips, exit 0, 1.145 seconds; `mock-quality-complete.tap`. Actual source functions execute with completely substituted process/filesystem/database/network capabilities; API checks are mocked transport/domain probes, not native browser evidence. |
| `node --import tsx --test --test-concurrency=1 tests/team-governance-notices.test.ts tests/seller-workspace-tasks.test.ts tests/review-task-priority-coverage.test.ts tests/commission-terms-followup.test.ts` | **21/21 PASS**, zero skips, exit 0, 89.399 seconds; `domain-memory.tap`. Inspected fixture chains allocate `DatabaseSync(':memory:')`, apply source SQL only there, and use fictional identities. |
| `node --import tsx .test-artifacts/t34/backend-quality/verify-readonly.mjs` | **PASS**, exit 0; `readonly-equivalence.txt/json`. Complete metadata for **288 ORM tables** is identical: column SQL types/defaults, indexes, CHECKs, FKs, PKs and uniqueness. Captured governance generator output equals the current owned section, differing from its original output only in unused callback names. Before/after metadata JSON retained. |
| Domain SQL/bind source comparison | **PASS**: all **514 prepare/bind call ASTs across 12 reserved domain/API files** are identical, including cooked template text for the removed redundant apostrophe escapes. `sql-bind-equivalence.json`. This is source equivalence, not an adapter execution claim. |

The cleanup probe exercises operation success/failure (including `throw undefined`), simultaneous failures, authenticated disconnect codes, forced-stop rejection, PID identity drift and authority revocation. The same two simultaneous-failure tests against the exact original portable fixture source fail as intended: **0/2 PASS, 2 FAIL**, `cleanup-red.tap`. This establishes that the original cleanup hid the original operation error. `cleanup-before.tap` also retains an earlier probe setup failure caused by passing a URL string to `readFile`; it is not counted as the intended RED. The corrected RED input is `cleanup-red.test.mjs`.

The first scoped lint retained three diagnostics in the newly added test harness only (`module` name and Function constructors); these were resolved with a different local name and `node:vm.compileFunction`. `scoped-lint-first.txt` and the subsequent clean checkpoint remain retained. Earlier 9/9 and 12/12 mock checkpoints remain historical iterations; 13/13 is the final test source result. No failed assertion was removed or weakened.

The current-versus-HEAD whitespace check reports an existing blank line at EOF in `payouts.ts` (`diff-check.txt`). Both the exact pre-edit copy and final file contain that same trailing blank line. All 21 exact before/after source whitespace checks pass (`owned-diff-check.txt`); unrelated dirty formatting was preserved.

## Limits and handoff

The new `.test.mjs` probe is **not selected by the repository's default `.test.ts` npm-test glob**; use its explicit command above. Final global lint/typecheck, broader integration, native D1/Maria, browser, build/package and release gates remain root-owned. No fresh native result is claimed for type/cleanup changes to the retained native helpers. Historic V8/native evidence is immutable and not replaced by these source overlays.

`reserved-source.diff` compares only this task's exact pre-edit snapshots with the final reserved files, avoiding accidental attribution of earlier dirty work. `final-manifest.json` records the final owned sources, tests, evidence and inspected fixture/checkpoint dependencies. Dependency hashes are a completion checkpoint, not a claim that concurrent unrelated work was frozen during execution. All owned source files were stable for their final scoped lint and final probes; subsequent shared-checkout changes require root's affected checks.
