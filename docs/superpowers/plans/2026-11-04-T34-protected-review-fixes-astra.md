# Protected review recovery: independent-review corrections

Bounded follow-up to the T08/T31 protected admin recovery checkpoint and `.test-artifacts/t34/protected-recovery-independent-review-2026-11-04.md`. The approved D4 bank/identity rules, verified-document locks, single eligible Super Admin rule, and form recovery contract remain unchanged. Full-version acceptance, whole-project checks and release decisions remain Root-owned.

## Corrections

1. `reviewProtectedChangePermission` now returns the actual `command.commit` result. When two same-nonce calls both reach their batches, the generic command recovers the winning receipt after the losing transaction rolls back. Both native callers now receive that saved permission ID. Receipt identity, digest, payload, immutable proof, result shape, schema and permission-generation rules are unchanged. The HTTP proof reader had masked this native wrapper defect.
2. Only the existing hold-scope/evidence-confirmation validation and required-bank-confirmation validation exits in `disposeProtectedHolds` now throw the existing `ProtectedAdminBeforeWriteError`. Both exits precede the batch. Empty/duplicate scopes, missing current-evidence confirmation, and missing bank confirmation for payouts or a bank-dependent managed route therefore receive the exact actor/action/source/request marker. Generic domain, receipt conflict, transaction and infrastructure errors remain uncertain; no route-wide catch was broadened.
3. The mounted disposition form checks that a scope is selected and that a payout release has its bank-ownership confirmation before creating a UUID. The shared protected form catches only payload-construction failures at this pre-request stage and presents the actionable message while preserving editable private notes. The existing original-reference and exact-retry machinery is unchanged.

Actual mounted tests also cover validation which depends on the native managed route: a first native400 releases its reference, retains the note and permits a corrected decision after explicit current-evidence review. If the first response is hidden by503, an exact retry returning the same before-write400 and a subsequent GET404 cannot settle that earlier uncertainty. The original UUID, exact wire and disabled private inputs remain retained. No private form content is added to browser storage.

## Executed evidence

All artifact names below are under `.test-artifacts/t34/`. Counts overlap and must not be summed as one suite.

| Check | Actual result | Artifact |
| --- | --- | --- |
| New native acceptance RED | 0/5, exit1, 15.96s: one unsaved concurrent ID and four erroneous uncertain-validation classifications | `protected-review-fixes-native-red.tap` |
| Mounted empty-scope and missing payout-bank confirmation RED | 0/2, exit1, 22.02s: both invalid submissions sent a native POST instead of remaining editable without a reference | `protected-review-fixes-browser-red.tap` |
| First native GREEN | 5/5, exit0, 16.45s | `protected-review-fixes-native-green.tap` |
| First mounted GREEN | 2/2, exit0, 20.78s | `protected-review-fixes-browser-green.tap` |
| Affected native memory regression | 63/63, exit0, 213.50s | `protected-review-fixes-memory-regression.tap` |
| Final focused native checks, including explicit foreign-key-on assertions and managed new-order bank confirmation | 6/6, exit0, 20.52s | `protected-review-fixes-native-final.tap` |
| Actual mounted protected review plus retained seller bank intake | 17/17, exit0, 169.06s | `protected-review-fixes-browser-final.tap` |
| Retained original admin bank-review browser | 1/1, exit0, 12.02s | `protected-review-fixes-bank-browser-final.tap` |
| Nonpersistent native D1, including deterministic concurrent native permission calls | 2/2, exit0, 35.12s after inspected sandbox escalation | `protected-review-fixes-d1-approved.tap` |

The memory regression executes `tests/protected-admin-recovery.test.ts`, `tests/protected-change-disposition.test.ts`, `tests/protected-change-holds.test.ts`, `tests/protected-identity-change.test.ts` and `tests/protected-payout-disposition.test.ts`. It retains lost committed acknowledgements, exact original results, role/subject/session read fences, legacy no-backfill, later lawful rejection, independent holds, identity/bank history, order readiness and protected payout reservations/destinations. The later focused six checks add no mutation logic; they verify the final explicit foreign-key assertions and the managed-route validation branch.

The mounted group executes `tests/protected-admin-browser.test.ts` and `tests/seller-bank-scope-browser.test.ts`. Actual components call real isolated native receivers through fully intercepted localhost requests, with framework/navigation and authentication-provider shims. It includes the four new validation journeys, actor changes, malformed/lost acknowledgements, exact retries, reload GET recovery, first conflict versus prior uncertainty, late callbacks and the complete protected parent privacy curtain. The separate retained bank browser is selected by `--test-name-pattern='bank review browser retains'` from `tests/document-change-interface.test.ts`. These are mounted isolated tests, not a canonical full-framework preview.

The D1 tests are `tests/protected-admin-native.test.ts` and `tests/protected-change-native.test.ts`. `createIncentiveDb` was inspected: random database UUID, `d1Persist:false`, all real migration sources, no canonical database/path argument. The short temporary path is resolved beneath `.test-artifacts/t34/tmp/prf-<8hex>` and checked before directory creation. Initial sandbox execution failed both tests with `fetch failed` during fixture setup: 0/2, exit1, 15.95s, retained in `protected-review-fixes-d1.tap`. The exact inspected tests then passed with approved local workerd IPC. No fixture guard or migration was weakened.

The reviewer's earlier `protected-recovery-review-2026-11-04.test.ts` deliberately asserted the defects and exited0; it remains reproduction evidence, not product acceptance. The new RED artifacts above assert the required behavior. The initial two-browser RED overlapped briefly with a separately scheduled test because scheduling messages crossed; both failures were the expected actual POST-count assertions, and no failure is attributed to scheduling. Later heavy runs were serialized with Root and the cancellation owner.

## Source and ownership boundary

Exactly seven files differ from the prior26-file protected recovery freeze: four production files (`protected-change-requests.ts`, `protected-change-disposition.ts`, `protected-change-disposition.tsx`, `protected-review-form.tsx`) and the three protected admin recovery/browser/native test files. The other19 files retain their original SHA-256 values. The API routes, native proof reader, hosted read-only authentication, frozen document boundaries, workspace proof-event filtering before LIMIT, default observation clocks and Root's `formText` helper are preserved. No generic order/action hook was edited.

The exact final source and preserved-boundary hashes are recorded in `.test-artifacts/t34/protected-review-fixes-source-freeze.json`. Final scoped type-aware lint covers the seven changed source/test files and exits0; its output is `protected-review-fixes-final-scoped-lint.txt`. Whole-project typecheck/lint/full-suite, hosted MariaDB and T34/T35 acceptance are Root's continuing checkpoints; this note does not claim them. No SQL mutation logic or schema changed in this correction.

No Git mutation/worktree, canonical database seed/migration/reset/restore, preview launcher bypass, real provider/mail/payment, live seller activation or deployment occurred. Canonical startup constraints and the approved baseline remain intact. Video work remains deferred.
