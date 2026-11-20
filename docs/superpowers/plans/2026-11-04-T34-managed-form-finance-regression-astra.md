# T34 managed-program and payout catalog regression repair — 2026-11-04

Scope: `tests/form-catalog-managed-program.test.ts`, `tests/form-catalog-payout-domain.test.ts`, and new dedicated `tests/helpers/catalogue-payout-execution.ts`. Initial dirty source bytes are preserved. No production/shared helper, migration, canonical database, Git setting, progress ledger or coverage ledger was changed by this slice. Video remains deferred and all deployment remains held.

## Diagnosis and approved contract

The four selected original failures reproduced as **0/4**. Managed-program built only a partial schema, omitting current recovery and protected-change parents. Some generic rejection assertions could therefore pass before reaching their intended transaction race. The old fixed and registered payment completion calls also contradict their current native execution-packet requirement. The managed payout test supplied a stale receiving label instead of the independently reviewed beneficiary returned by its existing fixture.

The approved Finance workspace, single-Super-Admin amendment and D4/D13 bank/identity rules require original obligations, current identity/beneficiary/funding review, distinct actual execution evidence and exact replay. One eligible Super Admin can perform the separate stages; approval alone is not bank completion. Original amounts stay **100,000 fixed supplier**, **91,000 managed maker** and **5,000 registered seller paisa**. No current fee is retroactively substituted. Fixed-supplier live checkout and deployment remain held.

## Retained changes

The managed fixture now uses `incentiveReportDatabase` with every actual migration and trigger in a new `:memory:` database, foreign keys enabled. Complete fictional users, seller identity, original fixed-supplier participation, category and product parents replace permissive handcrafted tables. No trigger is removed and no canonical database is opened. The existing transition adapter now finds all real columns/parents already present; its synthetic schema supplementation is not needed by this fixture. Foreign-key checks pass.

Batch-call counters and the unpaid-balance callback explicitly prove entry into the intended batch for managed authority, status, unit-price, publication and balance races, as well as registered payout preparation/action authority, seller, destination, balance, answer and publication races. All original no-domain-write/no-audit/no-answer rollback assertions remain. The full five-form route/history case retains a lawful approval of an explicitly modeled historical prepared supplier record; the obsolete direct mark-paid request is rejected. Current direct preparation still asserts approved, not paid. Historical prepared-state setup does not claim the current preparer creates an unapproved payment.

The new dedicated helper starts with unreviewed fictional identity documents and no bank instruction, invokes native identity review and authenticated seller bank submission/review, then native company-account draft/submission/verification and an explicit independent company-capital statement. It never inserts a successful command receipt or bank outcome directly, overwrites an existing beneficiary, treats seller earnings as cash, or invokes a provider. Native packet preparation, approval, start and actual fictional outcome record the exact original source. Tests check no bank identity/debit at processing; exact bank account, amount, time and transaction identity; unchanged source snapshot, beneficiary and identity revisions; exactly four native command receipts; actual actors; one bank identity; exact completion replay; altered replay rejection; and current authority. Registered payout still has four native payout events and one ledger debit. Managed payout has one approval, one processing and one paid source event.

`system.payout-finance` deliberately permits no configurable fields. Accordingly, supply/preparation/approval retain their real catalog answers, while execution keeps native system command receipts. Fixed success asserts three real catalog answers (formerly four including the forbidden mark-paid answer); registered success asserts one real approval answer (formerly three including forbidden direct processing/paid answers). Both now additionally complete the actual lawful native payment path. This is not replacement of successful money movement with a refusal-only test. The required custom context, exact actor/action/content binding, stale publication, archived history and privacy/authority tests remain green.

The registered native test uses an explicit initial relative historical fixture clock so its original earning is already eligible against the native commit clock; it does not edit availability after packet preparation. Initial fictional profiles now state their actual individual applicant type. The managed payout uses its fixture's actual reviewed receiving reference from the outset, retaining its original amount and settlement entries.

## Evidence

Artifacts: `.test-artifacts/t34/managed-form-finance-regression-astra-20261104/`.

| Artifact | Result |
| --- | --- |
| `before.tap` | Four original failures reproduced: 0/4. |
| `migrated-fixture.tap` | Actual-schema supply, transition and direct preparation: 3/3. |
| `native-execution.tap` | Managed native completion passed; fixed/registered exposed missing original applicant type: 1/3. |
| `native-identity.tap` | Fixed native completion passed; registered helper explicitly supplied undefined environment, correctly refused by finite-JSON command contract: 1/2. Helper now omits absent optional environment. |
| `bounded-all-memory.tap` | All 17 managed memory tests plus all 13 payout-domain tests: **30/30, exit 0, 371.912s**. |
| `final-native-receipts.tap` | Final exact source/bank/receipt/actor assertion strengthening: **3/3, exit 0, 24.597s**. |

The 30/30 run precedes only native-assertion strengthening, a managed source-event-count assertion, import placement and unused-import cleanup. `bounded-source-*` preserves those exact earlier source bytes; `final-*` preserves current bytes. All changed executable assertions were rerun in the final three cases. Counts overlap and must not be summed. `receipt.json`, `final-*.diff` and `source-freeze.json` retain counts, complete initial/final owned source, SHA256 identities and inspected dependency/migration identities. The freeze is captured at final evidence collection, not an atomic repository-wide freeze; concurrent root-owned native-health/schema work can supersede it.

Exact final commands (canonical checkout):

```powershell
node --import tsx --test --test-concurrency=1 --test-name-pattern='^(five managed-program definitions|supply decision binds|adjustment answer commits|payment preparation and both|route transition decision binds|a completed form request|a managed decision replay|a rejected answer insert|payment preparation rechecks|all five managed decisions|a payment status race|supply acceptance cannot|all five managed routes|managed-program route validates|managed-program receiver bounds|direct supplier payment preparation|supplier direct preparation|approval schema upgrade|managed payout approvals accept|direct payout preparation|direct preparation rolls|payout actions replay|payout action status|rejected payout releases|both live payout receivers|both payout routes reject|both payout receivers accept|direct SuperAdmin seller|direct managed preparation|direct seller preparation)' tests/form-catalog-managed-program.test.ts tests/form-catalog-payout-domain.test.ts
node --import tsx --test --test-concurrency=1 --test-name-pattern='^(payment preparation and both|managed payout approvals accept|payout actions replay)' tests/form-catalog-managed-program.test.ts tests/form-catalog-payout-domain.test.ts
```

## Held verification and integration handoff

No Chrome, D1, MariaDB, lint, compiler, build, global suite, provider/remote call, Git mutation, canonical data mutation or launcher bypass was performed. Root retains the heavy verification slot. Queue these exact commands after root releases that slot:

```powershell
node node_modules/oxlint/bin/oxlint --disable-nested-config tests/form-catalog-managed-program.test.ts tests/form-catalog-payout-domain.test.ts tests/helpers/catalogue-payout-execution.ts
node --import tsx --test --test-concurrency=1 --test-name-pattern='^mounted managed-program forms send their own published answer context$' tests/form-catalog-managed-program.test.ts
npm run typecheck
npm run build
npm test
```

Actual D1/Maria native financial adapter acceptance remains with root's engine workstreams; these memory tests do not certify either engine. Existing checked preview/preflight safeguards remain mandatory; no launch or data recovery is implied by this evidence.

Read-only UI inspection identified the approved-payment dead mark-paid control. Root separately assigned `managed_payment_ui_fix_astra`, which reported replacement by an exact original fixed-payout workspace link and its own five render tests. That change is outside this slice and its evidence is not counted here. Queue browser checks for approved state having no configurable payment-action form/Mark simulated paid control; authorized original payout ID link and correct return target; retained uncertain completion request visible without retry/clear; unchanged prepared approval configured submission/retry; and ordinary/self-beneficiary denial. The existing mounted test still selects the prepared form and is not evidence for all those new UI cases.
